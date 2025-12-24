/**
 * Group Metadata Manager
 * Handles fetching, storing, and retrieving group metadata including member information
 */

const fs = require('fs');
const path = require('path');

class GroupMetadataManager {
  constructor(bot) {
    this.bot = bot;
    this.metadataCache = new Map(); // In-memory cache for faster access
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutes cache expiry
  }

  /**
   * Initialize metadata for all groups the bot is in
   */
  async initializeAllGroups() {
    try {
      console.log('[GROUP_METADATA] Initializing metadata for all groups...');

      const groups = Object.keys(this.bot.db.data.groups || {});
      for (const groupId of groups) {
        await this.updateGroupMetadata(groupId);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log('[GROUP_METADATA] Initialization complete');
    } catch (error) {
      console.error('[GROUP_METADATA] Error initializing groups:', error);
    }
  }

  /**
   * IMPROVED: Extract phone number from various JID formats
   * Now includes LID lookup in metadata cache
   * @param {string} jid - JID string (can be @s.whatsapp.net or @lid)
   * @param {string} phoneNumberHint - Phone number hint from participant object
   * @returns {string} - Clean phone number or null
   */
  extractPhoneNumber(jid, phoneNumberHint = null) {
    try {
      // If we have a phone number hint, use it
      if (phoneNumberHint) {
        return phoneNumberHint.split('@')[0].replace(/\D/g, '');
      }

      // Extract from JID
      const jidPart = jid.split('@')[0];

      // If it's already a phone number (only digits or starts with digits)
      if (/^\d+$/.test(jidPart)) {
        return jidPart;
      }

      // If it's a LID, search in metadata cache
      if (jid.includes('@lid')) {
        console.log(`[METADATA] LID detected: ${jid}, searching in cache...`);

        // Search through all cached metadata
        for (const [groupId, cached] of this.metadataCache) {
          if (cached.data && cached.data.participants) {
            const participant = cached.data.participants.find(p =>
              p.lid === jid || p.jid === jid
            );

            if (participant && participant.phoneNumber) {
              console.log(`[METADATA] ✅ Found phone in cache: ${participant.phoneNumber}`);
              return participant.phoneNumber;
            }
          }
        }

        // Also search in database metadata
        if (this.bot.db && this.bot.db.data && this.bot.db.data.groupMetadata) {
          for (const [groupId, metadata] of Object.entries(this.bot.db.data.groupMetadata)) {
            if (metadata.participants) {
              const participant = metadata.participants.find(p =>
                p.lid === jid || p.jid === jid
              );

              if (participant && participant.phoneNumber) {
                console.log(`[METADATA] ✅ Found phone in DB: ${participant.phoneNumber}`);
                return participant.phoneNumber;
              }
            }
          }
        }

        console.log(`[METADATA] ⚠️ LID not found in cache/DB: ${jid}`);
        return null;
      }

      // Fallback: just extract numbers (might not be accurate for LID)
      return jidPart.replace(/\D/g, '') || null;

    } catch (error) {
      console.error(`[METADATA] Error in extractPhoneNumber:`, error);
      return null;
    }
  }

  /**
   * Extract phone number from LID by looking up in group metadata
   * This is specifically for handling LID (@lid) format
   * @param {string} groupId - Group JID where the LID is from
   * @param {string} lidOrJid - LID or JID to extract phone from
   * @returns {Promise<string|null>} - Phone number or null
   */
  async extractPhoneNumberFromLID(groupId, lidOrJid) {
    try {
      console.log(`[METADATA] Extracting phone from LID: ${lidOrJid} in group ${groupId}`);

      // If it's already a standard JID, extract directly
      if (lidOrJid.includes('@s.whatsapp.net')) {
        const phone = lidOrJid.split('@')[0].replace(/\D/g, '');
        console.log(`[METADATA] ✅ Standard JID, extracted: ${phone}`);
        return phone;
      }

      // Get group metadata
      const metadata = await this.getGroupMetadata(groupId);
      if (!metadata || !metadata.participants) {
        console.log(`[METADATA] ❌ No metadata found for group ${groupId}`);
        return null;
      }

      // Search in participants
      const participant = metadata.participants.find(p =>
        p.lid === lidOrJid ||
        p.jid === lidOrJid
      );

      if (participant && participant.phoneNumber) {
        console.log(`[METADATA] ✅ Found in metadata: ${participant.phoneNumber}`);
        return participant.phoneNumber;
      }

      // If not found, force refresh metadata and try again
      console.log(`[METADATA] Not found in cache, forcing metadata refresh...`);
      const freshMetadata = await this.updateGroupMetadata(groupId, true);

      if (freshMetadata && freshMetadata.participants) {
        const freshParticipant = freshMetadata.participants.find(p =>
          p.lid === lidOrJid ||
          p.jid === lidOrJid
        );

        if (freshParticipant && freshParticipant.phoneNumber) {
          console.log(`[METADATA] ✅ Found after refresh: ${freshParticipant.phoneNumber}`);
          return freshParticipant.phoneNumber;
        }
      }

      console.log(`[METADATA] ❌ Could not find phone number for ${lidOrJid}`);
      return null;

    } catch (error) {
      console.error(`[METADATA] Error extracting phone from LID:`, error);
      return null;
    }
  }

  /**
   * Get PURE WhatsApp name ONLY (not contact name)
   * @param {string} jid - User JID
   * @returns {string|null} - Pure WhatsApp name or null
   */
  getPureWhatsAppName(jid) {
    try {
      console.log(`[PURE_WA_NAME] Getting pure WA name for: ${jid}`);

      if (!this.bot.store?.data?.contacts) {
        console.log(`[PURE_WA_NAME] No contacts store available`);
        return null;
      }

      // Cari contact dengan berbagai format
      const contact = this.bot.store.data.contacts[jid] ||
        (() => {
          const phone = this.extractPhoneNumber(jid);
          return phone ? this.bot.store.data.contacts[`${phone}@s.whatsapp.net`] : null;
        })();

      if (contact) {
        // HANYA ambil verifiedName atau notify
        const waName = contact.verifiedName || contact.notify;

        if (waName && this.isValidName(waName)) {
          console.log(`[PURE_WA_NAME] Found PURE WA name: ${waName}`);
          return waName;
        }

        // Debug log hanya jika diperlukan
        console.log(`[PURE_WA_NAME] No pure WA name found for ${jid}`);
      }

      return null;
    } catch (error) {
      console.error(`[PURE_WA_NAME] Error:`, error);
      return null;
    }
  }

  /**
   * ULTIMATE: Get best participant name dengan HANYA WA name
   */
  async getBestParticipantName(jid, phoneNumber = null, storedName = null, groupId = null) {
    try {
      console.log(`[ULTIMATE_NAME] Getting name for: ${jid}${groupId ? ` in group ${groupId}` : ''}`);

      const cleanPhone = this.extractPhoneNumber(jid, phoneNumber);

      // STEP 1: Cek apakah nama sudah valid di database users
      const userId = jid.includes('@lid') ? jid : (cleanPhone ? `${cleanPhone}@s.whatsapp.net` : jid);
      const existingUserName = this.bot.db.data.users?.[userId]?.name;

      if (existingUserName && this.isValidName(existingUserName)) {
        console.log(`[ULTIMATE_NAME] ✅ Already has valid name in users: ${existingUserName}`);

        // PASTIKAN nama ini juga ada di groupMetadata jika ada groupId
        if (groupId && this.bot.db.data.groupMetadata?.[groupId]) {
          await this.updateNameInGroupMetadata(groupId, jid, existingUserName);
        }

        return existingUserName;
      }

      // STEP 2: HANYA WhatsApp name murni
      const pureWaName = this.getPureWhatsAppName(jid);
      if (pureWaName) {
        console.log(`[ULTIMATE_NAME] ✅ Found PURE WhatsApp name: ${pureWaName}`);

        // Update BOTH places
        await this.updateUserDatabase(jid, pureWaName);
        if (groupId) {
          await this.updateNameInGroupMetadata(groupId, jid, pureWaName);
        }

        return pureWaName;
      }

      // STEP 3: Coba dari store (tapi HANYA verifiedName/notify)
      if (this.bot.store?.data?.contacts) {
        const contact = this.bot.store.data.contacts[jid] ||
          (cleanPhone ? this.bot.store.data.contacts[`${cleanPhone}@s.whatsapp.net`] : null);

        if (contact) {
          // HANYA ambil dari WhatsApp, bukan dari kontak
          const waName = contact.verifiedName || contact.notify;
          if (waName && this.isValidName(waName)) {
            console.log(`[ULTIMATE_NAME] ⚠️ Using WA name from store: ${waName}`);

            await this.updateUserDatabase(jid, waName);
            if (groupId) {
              await this.updateNameInGroupMetadata(groupId, jid, waName);
            }

            return waName;
          }
        }
      }

      // STEP 4: Phone number (last resort)
      if (cleanPhone) {
        console.log(`[ULTIMATE_NAME] ❌ No WA name found, using phone: ${cleanPhone}`);
        return cleanPhone;
      }

      return null;
    } catch (error) {
      console.error(`[ULTIMATE_NAME] Error:`, error);
      return null;
    }
  }

  /**
 * Update name in group metadata participants
 * @param {string} groupId - Group ID
 * @param {string} userJid - User JID/LID
 * @param {string} name - Name to update
 */
  async updateNameInGroupMetadata(groupId, userJid, name) {
    try {
      if (!name || !this.isValidName(name)) {
        return false;
      }

      console.log(`[GROUP_UPDATE] Updating name for ${userJid} in group ${groupId}: ${name}`);

      if (!this.bot.db.data.groupMetadata?.[groupId]) {
        console.log(`[GROUP_UPDATE] Group metadata not found`);
        return false;
      }

      const metadata = this.bot.db.data.groupMetadata[groupId];
      const phoneNumber = this.extractPhoneNumber(userJid);

      // Cari participant berdasarkan berbagai kemungkinan
      const participantIndex = metadata.participants.findIndex(p =>
        (p.phoneNumber && p.phoneNumber === phoneNumber) ||
        p.jid === userJid ||
        p.lid === userJid ||
        (phoneNumber && p.jid === `${phoneNumber}@s.whatsapp.net`)
      );

      if (participantIndex !== -1) {
        const oldName = metadata.participants[participantIndex].name;

        // Hanya update jika nama berbeda DAN valid
        if (oldName !== name && this.isValidName(name)) {
          metadata.participants[participantIndex].name = name;
          metadata.lastUpdate = Date.now();

          // Simpan ke database
          await this.bot.db.write();

          console.log(`[GROUP_UPDATE] ✅ Updated in group: ${oldName || 'NO NAME'} → ${name}`);
          return true;
        } else {
          console.log(`[GROUP_UPDATE] No change needed or invalid name`);
        }
      } else {
        console.log(`[GROUP_UPDATE] Participant not found in group metadata`);
      }

      return false;
    } catch (error) {
      console.error(`[GROUP_UPDATE] Error:`, error);
      return false;
    }
  }

  /**
   * Update the users database with a found name
   * @param {string} jid - User JID
   * @param {string} name - Valid name to store
   */
  async updateUserDatabase(jid, name) {
    try {
      if (!name || !this.isValidName(name)) {
        return;
      }

      // Initialize user if not exists
      if (!this.bot.db.data.users[jid]) {
        this.bot.db.data.users[jid] = {};
      }

      const user = this.bot.db.data.users[jid];

      // Only update if we don't have a name or if the new name is different
      if (!user.name || user.name !== name) {
        user.name = name;
        console.log(`[METADATA] 💾 Updated user database: ${jid} -> "${name}"`);
        await this.bot.db.write();
      }
    } catch (error) {
      console.warn(`[METADATA] Error updating user database for ${jid}:`, error.message);
    }
  }

  /**
   * Check if a name is valid (not a number, not a JID, not LID)
   * @param {string} name - Name to check
   * @returns {boolean} - Is valid name
   */
  isValidName(name) {
    if (!name || typeof name !== 'string') return false;

    // Check if it's just a number
    if (/^\d+$/.test(name)) return false;

    // Check if it contains @
    if (name.includes('@')) return false;

    // Check if it's a LID pattern (long number without spaces)
    if (name.length > 12 && /^\d+$/.test(name.replace(/\s/g, ''))) return false;

    return true;
  }

  /**
   * Update metadata for a specific group with enhanced name resolution
   * @param {string} groupId - Group JID
   * @param {boolean} forceFresh - Force fetch from WhatsApp even if cache exists
   * @returns {Object} - Updated metadata
   */
  async updateGroupMetadata(groupId, forceFresh = false) {
    try {
      console.log(`[GROUP_METADATA] Updating metadata for group: ${groupId}`);

      // Fetch fresh metadata from WhatsApp
      const metadata = await this.bot.groupMetadata(groupId);

      if (!metadata) {
        console.warn(`[GROUP_METADATA] No metadata found for group: ${groupId}`);
        return null;
      }

      console.log(`[GROUP_METADATA] Processing ${metadata.participants.length} participants...`);

      // Process participants with enhanced information
      const processedParticipants = [];

      for (const participant of metadata.participants) {
        let jid, lid, phoneNumber;

        if (typeof participant === 'string') {
          // Old format: participant is a JID string
          jid = participant;
          phoneNumber = this.extractPhoneNumber(participant);
        } else if (typeof participant === 'object' && participant !== null) {
          // New format: participant is an object
          jid = participant.id || participant.phoneNumber;
          lid = participant.id;

          // IMPORTANT: Clean phoneNumber properly
          let rawPhone = participant.phoneNumber;
          if (rawPhone) {
            // Remove @s.whatsapp.net or any @ suffix
            phoneNumber = rawPhone.split('@')[0].replace(/\D/g, '');
            if (phoneNumber.length < 10) {
              // If too short, it's probably not a valid phone, try extracting from jid
              phoneNumber = this.extractPhoneNumber(jid);
            }
          } else {
            phoneNumber = this.extractPhoneNumber(jid);
          }
        }

        // Get best available name (with async lookup)
        let bestName = null;

        // Cari di database users berdasarkan berbagai identifier
        const userKeys = [];
        if (phoneNumber) userKeys.push(`${phoneNumber}@s.whatsapp.net`);
        if (jid) userKeys.push(jid);
        if (lid) userKeys.push(lid);

        for (const userKey of userKeys) {
          const dbUser = this.bot.db.data.users?.[userKey];
          if (dbUser?.name && this.isValidName(dbUser.name)) {
            bestName = dbUser.name;
            console.log(`[METADATA] Found name in users database: ${bestName}`);
            break;
          }
        }

        // Jika tidak ada di users, baru cari dengan getBestParticipantName
        if (!bestName) {
          bestName = await this.getBestParticipantName(jid, phoneNumber, null, groupId);
        }

        // ===== PERBAIKAN: INISIALISASI processedParticipant =====
        // Determine final JID to use (prefer standard format)
        const finalJid = phoneNumber ? `${phoneNumber}@s.whatsapp.net` : jid;

        const processedParticipant = {
          jid: finalJid,
          lid: lid,
          phoneNumber: phoneNumber,
          name: bestName,
          admin: participant.admin || null,
          isAdmin: (participant.admin === 'admin' || participant.admin === 'superadmin'),
          isSuperAdmin: (participant.admin === 'superadmin')
        };

        processedParticipants.push(processedParticipant); // ✅ SEKARANG SUDAH DIBUAT

        console.log(`[METADATA] Processed: ${phoneNumber} -> Name: ${bestName || 'NO NAME'}, Admin: ${participant.admin || 'NO'}`);
      }

      // Prepare metadata object
      const groupMetadata = {
        id: metadata.id,
        subject: metadata.subject,
        subjectOwner: metadata.subjectOwner,
        subjectTime: metadata.subjectTime,
        creation: metadata.creation,
        owner: metadata.owner,
        desc: metadata.desc,
        descId: metadata.descId,
        restrict: metadata.restrict,
        announce: metadata.announce,
        size: metadata.size,
        participants: processedParticipants,
        lastUpdate: Date.now()
      };

      // Store in database
      if (!this.bot.db.data.groupMetadata) {
        this.bot.db.data.groupMetadata = {};
      }
      this.bot.db.data.groupMetadata[groupId] = groupMetadata;
      await this.bot.db.write();

      // Update cache
      this.metadataCache.set(groupId, {
        data: groupMetadata,
        timestamp: Date.now()
      });

      const namedCount = processedParticipants.filter(p => p.name && this.isValidName(p.name)).length;
      const unnamedCount = processedParticipants.length - namedCount;

      console.log(`[GROUP_METADATA] ✅ Updated: ${metadata.subject}`);
      console.log(`[GROUP_METADATA] Total: ${processedParticipants.length}, Named: ${namedCount}, Unnamed: ${unnamedCount}`);

      return groupMetadata;

    } catch (error) {
      console.error(`[GROUP_METADATA] Error updating metadata for group ${groupId}:`, error);
      return null;
    }
  }

  /**
   * Force update group metadata (for manual command)
   * @param {string} groupId - Group JID
   * @returns {Object} - Updated metadata
   */
  async forceUpdateGroupMetadata(groupId) {
    console.log(`[GROUP_METADATA] 🔄 Force updating metadata for: ${groupId}`);

    // Clear cache for this group to force fresh fetch
    this.metadataCache.delete(groupId);

    // Update with force flag
    return await this.updateGroupMetadata(groupId, true);
  }

  /**
   * Get participant name from various sources (legacy method, kept for compatibility)
   * @param {string} jid - Participant JID or LID
   * @returns {string} - Participant name
   */
  getParticipantName(jid) {
    // Note: This is now sync, for async use getBestParticipantName
    try {
      const phoneNumber = this.extractPhoneNumber(jid);

      if (this.bot.store && this.bot.store.data && this.bot.store.data.contacts) {
        // Try standard JID
        if (phoneNumber) {
          const standardJid = `${phoneNumber}@s.whatsapp.net`;
          if (this.bot.store.data.contacts[standardJid]) {
            const contact = this.bot.store.data.contacts[standardJid];
            const name = contact.notify || contact.name || contact.pushName;
            if (name && this.isValidName(name)) return name;
          }
        }

        // Try direct JID
        if (this.bot.store.data.contacts[jid]) {
          const contact = this.bot.store.data.contacts[jid];
          const name = contact.notify || contact.name || contact.pushName;
          if (name && this.isValidName(name)) return name;
        }
      }

      return phoneNumber || jid.split('@')[0];
    } catch (error) {
      return jid.split('@')[0];
    }
  }

  /**
   * Get cached metadata for a group
   * @param {string} groupId - Group JID
   * @param {boolean} forceRefresh - Force refresh from WhatsApp
   * @returns {Object} - Group metadata
   */
  async getGroupMetadata(groupId, forceRefresh = false) {
    try {
      // Check cache first
      const cached = this.metadataCache.get(groupId);
      if (!forceRefresh && cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
        return cached.data;
      }

      // Check database
      const dbMetadata = this.bot.db.data.groupMetadata?.[groupId];
      if (!forceRefresh && dbMetadata) {
        // Update cache
        this.metadataCache.set(groupId, {
          data: dbMetadata,
          timestamp: Date.now()
        });
        return dbMetadata;
      }

      // Fetch fresh metadata
      return await this.updateGroupMetadata(groupId);

    } catch (error) {
      console.error(`[GROUP_METADATA] Error getting metadata for group ${groupId}:`, error);
      return null;
    }
  }

  /**
   * Get member information by JID with name update check
   * @param {string} groupId - Group JID
   * @param {string} userJid - User JID
   * @param {boolean} autoUpdateName - Auto update name if found in contacts
   * @returns {Object} - Member information
   */
  async getMemberInfo(groupId, userJid, autoUpdateName = true) {
    try {
      const metadata = await this.getGroupMetadata(groupId);
      if (!metadata) return null;

      const phoneNumber = this.extractPhoneNumber(userJid);

      const member = metadata.participants.find(participant =>
        (participant.phoneNumber && participant.phoneNumber === phoneNumber) ||
        participant.jid === userJid ||
        participant.lid === userJid
      );

      // If member found and autoUpdateName is true, check for better name
      if (member && autoUpdateName) {
        const currentName = member.name;

        // Only update if current name is invalid
        if (!currentName || !this.isValidName(currentName)) {
          const betterName = await this.getBestParticipantName(userJid, member.phoneNumber, currentName, groupId);

          if (betterName && this.isValidName(betterName)) {
            console.log(`[METADATA] 🔄 Updating name: ${currentName || 'NO NAME'} → ${betterName}`);

            // Gunakan method baru untuk update
            await this.updateNameInGroupMetadata(groupId, userJid, betterName);
          }
        }
      }

      return member;
    } catch (error) {
      console.error(`[GROUP_METADATA] Error getting member info for ${userJid} in ${groupId}:`, error);
      return null;
    }
  }

  /**
   * Get member name by JID with auto-update
   * @param {string} groupId - Group JID
   * @param {string} userJid - User JID
   * @returns {string} - Member name
   */
  async getMemberName(groupId, userJid, forceUpdate = false) {
    try {
      // Jika forceUpdate, langsung ambil nama terbaru
      if (forceUpdate) {
        const phoneNumber = this.extractPhoneNumber(userJid);
        const betterName = await this.getBestParticipantName(userJid, phoneNumber, null, groupId);

        if (betterName && this.isValidName(betterName)) {
          return betterName;
        }
      }

      // Coba dari member info dulu
      const memberInfo = await this.getMemberInfo(groupId, userJid, true);

      if (memberInfo && memberInfo.name && this.isValidName(memberInfo.name)) {
        return memberInfo.name;
      }

      // Fallback
      const phoneNumber = this.extractPhoneNumber(userJid);
      return phoneNumber || userJid.split('@')[0];

    } catch (error) {
      console.warn(`[GROUP_METADATA] Error getting member name for ${userJid}:`, error.message);
      const phoneNumber = this.extractPhoneNumber(userJid);
      return phoneNumber || userJid.split('@')[0];
    }
  }

  /**
   * Update member information when participants change
   * @param {string} groupId - Group JID
   * @param {Array} participants - Updated participants array
   * @param {string} action - Action type ('add', 'remove', 'promote', 'demote')
   */
  async updateParticipants(groupId, participants, action) {
    try {
      console.log(`[GROUP_METADATA] Updating participants for group ${groupId}, action: ${action}`);

      // For add/remove, only update specific members instead of full refresh
      if (action === 'add' || action === 'remove') {
        console.log(`[GROUP_METADATA] Updating specific members due to ${action} action`);
        await this.updateSpecificMembers(groupId, participants, action);
        return;
      }

      // For other actions (promote, demote), just refresh normally
      await this.updateGroupMetadata(groupId, true);

    } catch (error) {
      console.error(`[GROUP_METADATA] Error updating participants for group ${groupId}:`, error);
    }
  }

  /**
   * Update only specific members instead of full metadata refresh
   * @param {string} groupId - Group JID
   * @param {Array} participants - Participants to update
   * @param {string} action - Action type ('add', 'remove')
   */
  async updateSpecificMembers(groupId, participants, action) {
    try {
      // Get existing metadata
      let metadata = this.bot.db.data.groupMetadata?.[groupId];
      if (!metadata) {
        console.log(`[GROUP_METADATA] No existing metadata for ${groupId}, fetching fresh`);
        metadata = await this.updateGroupMetadata(groupId);
        return;
      }

      for (const participant of participants) {
        let jid, phoneNumber;

        if (typeof participant === 'string') {
          jid = participant;
          phoneNumber = this.extractPhoneNumber(participant);
        } else if (typeof participant === 'object' && participant !== null) {
          jid = participant.id || participant.phoneNumber;
          phoneNumber = this.extractPhoneNumber(jid, participant.phoneNumber);
        }

        if (action === 'add') {
          // Add new member
          const bestName = await this.getBestParticipantName(jid, phoneNumber);
          const newParticipant = {
            jid: phoneNumber ? `${phoneNumber}@s.whatsapp.net` : jid,
            lid: jid,
            phoneNumber: phoneNumber,
            name: bestName,
            admin: participant.admin || null,
            isAdmin: (participant.admin === 'admin' || participant.admin === 'superadmin'),
            isSuperAdmin: (participant.admin === 'superadmin')
          };

          // Check if already exists
          const existingIndex = metadata.participants.findIndex(p =>
            (p.phoneNumber && p.phoneNumber === phoneNumber) ||
            p.jid === newParticipant.jid ||
            p.lid === newParticipant.lid
          );

          if (existingIndex === -1) {
            metadata.participants.push(newParticipant);
            console.log(`[GROUP_METADATA] Added member: ${phoneNumber} -> ${bestName || 'No name'}`);
          } else {
            // Update existing
            metadata.participants[existingIndex] = { ...metadata.participants[existingIndex], ...newParticipant };
            console.log(`[GROUP_METADATA] Updated existing member: ${phoneNumber} -> ${bestName || 'No name'}`);
          }

        } else if (action === 'remove') {
          // Remove member
          const removeIndex = metadata.participants.findIndex(p =>
            (p.phoneNumber && p.phoneNumber === phoneNumber) ||
            p.jid === jid ||
            p.lid === jid
          );

          if (removeIndex !== -1) {
            const removed = metadata.participants.splice(removeIndex, 1);
            console.log(`[GROUP_METADATA] Removed member: ${phoneNumber || jid}`);
          }
        }
      }

      // Update size and lastUpdate
      metadata.size = metadata.participants.length;
      metadata.lastUpdate = Date.now();

      // Save to database
      this.bot.db.data.groupMetadata[groupId] = metadata;
      await this.bot.db.write();

      // Update cache
      this.metadataCache.set(groupId, {
        data: metadata,
        timestamp: Date.now()
      });

      console.log(`[GROUP_METADATA] ✅ Updated specific members for ${groupId}: ${metadata.participants.length} total`);

    } catch (error) {
      console.error(`[GROUP_METADATA] Error updating specific members for group ${groupId}:`, error);
    }
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [groupId, cached] of this.metadataCache.entries()) {
      if (now - cached.timestamp > this.cacheExpiry) {
        this.metadataCache.delete(groupId);
      }
    }
  }

  /**
   * Get all groups the bot is in
   * @returns {Array} - Array of group IDs
   */
  getBotGroups() {
    return Object.keys(this.bot.db.data.groups || {});
  }

  /**
   * Check if user is admin in group
   * @param {string} groupId - Group JID
   * @param {string} userJid - User JID
   * @returns {boolean} - Is admin
   */
  async isAdmin(groupId, userJid) {
    try {
      const memberInfo = await this.getMemberInfo(groupId, userJid);
      return memberInfo ? memberInfo.isAdmin : false;
    } catch (error) {
      console.error(`[GROUP_METADATA] Error checking admin status for ${userJid} in ${groupId}:`, error);
      return false;
    }
  }

  /**
   * Check if user is super admin in group
   * @param {string} groupId - Group JID
   * @param {string} userJid - User JID
   * @returns {boolean} - Is super admin
   */
  async isSuperAdmin(groupId, userJid) {
    try {
      const memberInfo = await this.getMemberInfo(groupId, userJid);
      return memberInfo ? memberInfo.isSuperAdmin : false;
    } catch (error) {
      console.error(`[GROUP_METADATA] Error checking super admin status for ${userJid} in ${groupId}:`, error);
      return false;
    }
  }
}

module.exports = GroupMetadataManager;