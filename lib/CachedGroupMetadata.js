class GroupMetadataCache {
  constructor(expirationTime = 300000) {
    // Default: 5 minutes
    this.cache = new Map();
    this.expirationTime = expirationTime;
  }
  set(jid, metadata) {
    const expiresAt = Date.now() + this.expirationTime;
    this.cache.set(jid, { metadata, expiresAt });
  }
  get(jid) {
    const data = this.cache.get(jid);
    if (data && data.expiresAt > Date.now()) {
      return data.metadata;
    }
    this.cache.delete(jid);
    return null;
  }
  has(jid) {
    return this.cache.has(jid) && this.cache.get(jid).expiresAt > Date.now();
  }
  clear() {
    this.cache.clear();
  }
}

/**
 * Get group metadata with caching and fallback to metadataManager
 * @param {string} groupId - Group JID
 * @param {Object} bot - Bot instance
 * @returns {Promise<Object>} - Group metadata
 */
async function getGroupMetadata(groupId, bot) {
  try {
    // Priority 1: Use metadataManager if available (has better data)
    if (bot.metadataManager) {
      console.log('[CACHED_METADATA] Using metadataManager for:', groupId);
      const metadata = await bot.metadataManager.getGroupMetadata(groupId);
      if (metadata) {
        console.log('[CACHED_METADATA] ✅ Got metadata from metadataManager, participants:', metadata.participants?.length);
        return metadata;
      }
    }

    // Priority 2: Check database metadata
    if (bot.db && bot.db.data && bot.db.data.groupMetadata && bot.db.data.groupMetadata[groupId]) {
      console.log('[CACHED_METADATA] Using DB metadata for:', groupId);
      const dbMetadata = bot.db.data.groupMetadata[groupId];
      console.log('[CACHED_METADATA] ✅ Got metadata from DB, participants:', dbMetadata.participants?.length);
      return dbMetadata;
    }

    // Priority 3: Fetch from WhatsApp directly (last resort)
    console.log('[CACHED_METADATA] Fetching fresh metadata from WhatsApp for:', groupId);
    const freshMetadata = await bot.groupMetadata(groupId);

    // If metadataManager exists, process and store it
    if (bot.metadataManager && freshMetadata) {
      console.log('[CACHED_METADATA] Processing fresh metadata with metadataManager...');
      await bot.metadataManager.updateGroupMetadata(groupId);
      return await bot.metadataManager.getGroupMetadata(groupId);
    }

    return freshMetadata;

  } catch (error) {
    console.error('[CACHED_METADATA] Error getting metadata for', groupId, ':', error.message);

    // Last fallback: try direct fetch
    try {
      return await bot.groupMetadata(groupId);
    } catch (e) {
      console.error('[CACHED_METADATA] Direct fetch also failed:', e.message);
      return null;
    }
  }
}

module.exports = {
  getGroupMetadata
};
