const Serializer = require("../lib/Serializer");
const { getGroupMetadata } = require("../lib/CachedGroupMetadata");
const AntiBan = require("../lib/AntiBan");
const { handleGameAnswer } = require("./GameHandler");

module.exports = {
  async chatUpdate(messages) {
    const msg = await Serializer.serializeMessage(this, messages.messages[0]);

    try {
      if (!msg.message) return;
      if (msg.isBaileys) return;

      // Database
      require("./DatabaseHandler")(msg, this);

      // AFK
      require("./AFKHandler")(msg, this);

      // UNO Sticker Handler
      require("./UnoStickerHandler")(msg, this);

      // UNO Color Handler
      require("./UnoColorHandler")(msg, this);

      // Game answer handler for non-command texts
      if (!msg.text?.startsWith('.') && !msg.isCommand) {
        const gameHandled = await handleGameAnswer(msg, this);
        if (gameHandled) {
          return; // If game answer handled, skip command processing
        }
      }

      // Midman - prevent user to run command if the user doesn't have the permission
      let groupMetadata = msg.isGroup ? await getGroupMetadata(msg.from, this) : {};
      let participants = msg.isGroup ? groupMetadata.participants : [];

      // Debug participants
      console.log('[PARTICIPANTS_DEBUG] msg.sender:', msg.sender);
      console.log('[PARTICIPANTS_DEBUG] Total participants:', participants.length);
      if (participants.length > 0) {
        console.log('[PARTICIPANTS_DEBUG] Sample participant:', JSON.stringify(participants[0]));
      }

      // IMPROVED: Get user using metadataManager for accurate phone number extraction
      let user = {};
      let senderPhone = null;

      if (msg.isGroup && this.metadataManager) {
        // Method 1: Use getMemberInfo to get complete user data including admin status
        try {
          const memberInfo = await this.metadataManager.getMemberInfo(msg.from, msg.sender, true);
          if (memberInfo) {
            user = memberInfo;
            senderPhone = memberInfo.phoneNumber;
            console.log('[PARTICIPANTS_DEBUG] ✅ Got user from getMemberInfo:', JSON.stringify(user));
          }
        } catch (e) {
          console.log('[PARTICIPANTS_DEBUG] getMemberInfo failed:', e.message);
        }

        // Method 2: Fallback - search in database metadata directly
        if (!user.jid && this.bot.db && this.bot.db.data && this.bot.db.data.groupMetadata) {
          const dbMetadata = this.bot.db.data.groupMetadata[msg.from];
          if (dbMetadata && dbMetadata.participants) {
            console.log('[PARTICIPANTS_DEBUG] Searching in DB metadata...');

            // Try to find by LID first
            user = dbMetadata.participants.find((u) => u.lid == msg.sender);

            // If not found, try by JID
            if (!user) {
              user = dbMetadata.participants.find((u) => u.jid == msg.sender);
            }

            if (user) {
              senderPhone = user.phoneNumber;
              console.log('[PARTICIPANTS_DEBUG] ✅ Found user in DB metadata:', JSON.stringify(user));
            }
          }
        }

        // Method 3: Last resort - try direct match in participants from getGroupMetadata
        if (!user.jid) {
          user = participants.find((u) => u.jid == msg.sender || u.lid == msg.sender || u.id == msg.sender);
          if (user) {
            console.log('[PARTICIPANTS_DEBUG] ✅ Found user by direct match');
          }
        }
      } else if (msg.isGroup) {
        // No metadataManager, use old method
        user = participants.find((u) => u.jid == msg.sender || u.lid == msg.sender);
      }

      console.log('[PARTICIPANTS_DEBUG] Final user object:', JSON.stringify(user));

      let bot = msg.isGroup ? participants.find((u) => u.jid == Serializer.decodeJid(this.user.id) || u.lid == Serializer.decodeJid(this.user.id)) : {};
      let isAdmin = msg.isGroup ? user?.admin == "admin" || user?.admin == "superadmin" : false;
      let isBotAdmin = msg.isGroup ? bot?.admin : false;

      // Debug admin status
      console.log('[ADMIN_CHECK] msg.isGroup:', msg.isGroup);
      console.log('[ADMIN_CHECK] user object:', JSON.stringify(user));
      console.log('[ADMIN_CHECK] user.admin:', user?.admin);
      console.log('[ADMIN_CHECK] isAdmin:', isAdmin);
      console.log('[ADMIN_CHECK] participants count:', participants.length);

      let botNumber = this.user.id.split("@")[0].replace(/[^0-9]/g, "");
      let ownerNumber = process.env.owner.replace(/[^0-9]/g, "");

      // ========== IMPROVED PHONE NUMBER EXTRACTION ==========

      console.log('[OWNER_CHECK_DEBUG] Starting phone extraction...');
      console.log('[OWNER_CHECK_DEBUG] msg.sender:', msg.sender);
      console.log('[OWNER_CHECK_DEBUG] msg.key.fromMe:', msg.key.fromMe);

      if (msg.key.fromMe) {
        // Message from bot itself
        senderPhone = botNumber;
        console.log('[OWNER_CHECK_DEBUG] fromMe detected, using botNumber:', senderPhone);
      } else if (msg.isGroup && this.metadataManager) {
        // For group messages, use metadataManager to get phone from LID/JID
        console.log('[OWNER_CHECK_DEBUG] Group message detected, using metadataManager');

        // Method 1: Try getMemberInfo (most reliable for groups)
        try {
          const memberInfo = await this.metadataManager.getMemberInfo(msg.from, msg.sender, true);
          if (memberInfo && memberInfo.phoneNumber) {
            senderPhone = memberInfo.phoneNumber;
            console.log('[OWNER_CHECK_DEBUG] ✅ Got phone from getMemberInfo:', senderPhone);
          }
        } catch (e) {
          console.log('[OWNER_CHECK_DEBUG] getMemberInfo failed:', e.message);
        }

        // Method 2: Try participant object directly
        if (!senderPhone && participants && participants.length > 0) {
          const participant = participants.find(p => p.jid == msg.sender || p.lid == msg.sender);
          if (participant && participant.phoneNumber) {
            senderPhone = participant.phoneNumber;
            console.log('[OWNER_CHECK_DEBUG] ✅ Got phone from participant object:', senderPhone);
          }
        }

        // Method 3: Try extractPhoneNumber with LID lookup
        if (!senderPhone) {
          senderPhone = await this.metadataManager.extractPhoneNumberFromLID(msg.from, msg.sender);
          if (senderPhone) {
            console.log('[OWNER_CHECK_DEBUG] ✅ Got phone from extractPhoneNumberFromLID:', senderPhone);
          }
        }
      } else if (!msg.isGroup && this.metadataManager) {
        // For private chat, extract directly
        senderPhone = this.metadataManager.extractPhoneNumber(msg.sender);
        console.log('[OWNER_CHECK_DEBUG] Private chat, extracted phone:', senderPhone);
      }

      // Fallback 1: Try store.data.contacts
      if (!senderPhone && this.store && this.store.data && this.store.data.contacts) {
        console.log('[OWNER_CHECK_DEBUG] Trying store.data.contacts...');
        const contact = this.store.data.contacts[msg.sender];
        if (contact) {
          console.log('[OWNER_CHECK_DEBUG] Contact found:', JSON.stringify(contact));
          if (contact.phoneNumber) {
            senderPhone = contact.phoneNumber.replace(/[^0-9]/g, "");
            console.log('[OWNER_CHECK_DEBUG] ✅ Got phone from contact.phoneNumber:', senderPhone);
          } else {
            // Try to extract from contact.id or contact.jid
            const contactJid = contact.id || contact.jid || msg.sender;
            if (contactJid.includes('@s.whatsapp.net')) {
              senderPhone = contactJid.split('@')[0].replace(/[^0-9]/g, "");
              console.log('[OWNER_CHECK_DEBUG] ✅ Got phone from contact JID:', senderPhone);
            }
          }
        } else {
          console.log('[OWNER_CHECK_DEBUG] No contact found for:', msg.sender);
        }
      }

      // Fallback 2: Extract from sender JID if it's standard format
      if (!senderPhone && msg.sender.includes('@s.whatsapp.net')) {
        senderPhone = msg.sender.split("@")[0].replace(/[^0-9]/g, "");
        console.log('[OWNER_CHECK_DEBUG] ✅ Extracted from standard JID:', senderPhone);
      }

      // Last resort: use raw sender (might be LID)
      if (!senderPhone) {
        senderPhone = msg.sender.split("@")[0].replace(/[^0-9]/g, "");
        console.log('[OWNER_CHECK_DEBUG] ⚠️ Using raw sender as last resort:', senderPhone);
      }

      console.log(`[OWNER_CHECK] Bot: ${botNumber}, Owner: ${ownerNumber}, SenderPhone: ${senderPhone}, fromMe: ${msg.key.fromMe}`);

      // ========== OWNER CHECK ==========
      let isROwner = false;
      let isOwner = false;

      // Check if message is from bot itself
      if (msg.key.fromMe) {
        isROwner = true;
        isOwner = true;
        console.log(`[OWNER_CHECK] ✅ Message is from bot itself`);
      }
      // Check if sender phone matches owner (MOST IMPORTANT)
      else if (senderPhone && senderPhone === ownerNumber) {
        isROwner = true;
        isOwner = true;
        console.log(`[OWNER_CHECK] ✅ Sender phone matches owner number`);
      }
      // Check if sender phone matches bot number
      else if (senderPhone && senderPhone === botNumber) {
        isROwner = true;
        isOwner = true;
        console.log(`[OWNER_CHECK] ✅ Sender phone matches bot number`);
      }
      // Check if original sender JID matches owner (backward compatibility)
      else if (msg.sender === process.env.owner) {
        isROwner = true;
        isOwner = true;
        console.log(`[OWNER_CHECK] ✅ Sender JID matches owner`);
      }

      console.log(`[OWNER_CHECK] isROwner: ${isROwner}, isOwner: ${isOwner}`);

      // Eval - debugging
      const { exec } = require("child_process");
      if (msg.text.startsWith("=> ") && isOwner) {
        try {
          let evaled = await eval(msg.text.slice(2));
          if (typeof evaled !== "string") evaled = require("util").inspect(evaled);
          return msg.reply(evaled.toString());
        } catch (error) {
          console.log(error);
          return msg.reply(error.toString());
        }
      } else if (msg.text.startsWith("$ ") && isOwner) {
        msg.reply("Executing...").then((message) => {
          setTimeout(() => {
            exec(msg.text.slice(2), (err, stdout) => {
              if (err) return message.edit(err);
              if (stdout) return message.edit(stdout.toString());
            });
          }, 2000);
        });
      } else {
        // Special handling for replies that trigger commands
        if (msg.quoted && msg.text && msg.text.startsWith('.') && !msg.text.includes(' ')) {
          // Check if this is a reply to ytmp3 quality selection
          const sessionData = global.ytmp3Sessions && global.ytmp3Sessions[msg.sender];
          if (sessionData && sessionData.url && sessionData.messageId === msg.quoted.id) {
            console.log(`[COMMAND_HANDLER] Detected ytmp3 reply: "${msg.text}"`);
            // Call ytmp3 execute directly
            const ytmp3Command = this.commands.get('ytmp3');
            if (ytmp3Command) {
              const args = [msg.text]; // Pass the quality as first arg
              const extra = {
                bot: this,
                usedPrefix: '.', // Fake prefix for compatibility
                participants,
                groupMetadata,
                args,
                command: 'ytmp3',
              };
              try {
                await ytmp3Command.execute.call(this, msg, extra);
                return; // Exit after handling
              } catch (error) {
                console.error('[COMMAND_HANDLER] Error in ytmp3 reply handling:', error);
                return msg.reply("Error processing reply. Please try again.");
              }
            }
          }
        }

        // Handle InteractiveMessage responses for stext (ditambahkan sebelum command handling)
        const stextCommand = this.commands.get('stext');
        if (stextCommand && stextCommand.handleInteractiveResponse) {
          const handled = await stextCommand.handleInteractiveResponse(msg, this);
          if (handled) {
            console.log(`[COMMAND_HANDLER] stext interactive response handled for ${msg.sender}`);
            return; // Jika sudah dihandle, jangan proses sebagai command biasa
          }
        }

        // Command handling
        const botPrefix = new RegExp(
          "^[" + "/!#$%+£¢€¥^°=¶∆×÷π√✓©®:;?&.\\-".replace(/[|\\{}()[\]^$+*?.\-\^]/g, "\\$&") + "]"
        );
        let usedPrefix = msg.text.match(botPrefix)?.[0];
        if (!usedPrefix) return; // If no prefix is found, exit

        const args = msg.text.slice(usedPrefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        if (!commandName) return;
        if (!this.commands.has(commandName)) return;
        const command = this.commands.get(commandName);
        msg.isCommand = true;

        // Check owner first - owners bypass all restrictions except group/private
        if (command.owner && !isOwner) {
          return msg.react("⚠️").then(() => msg.reply("This command can only executed by the owner!"));
        }

        // Check group/private restrictions (even owners must follow these)
        if (msg.isGroup && command.private) {
          return msg.react("⚠️").then(() => msg.reply("This command can only executed in private chat!"));
        } else if (!msg.isGroup && command.group) {
          return msg.react("⚠️").then(() => msg.reply("This command can only executed in group chat!"));
        }

        // Check admin restrictions (but skip if user is owner)
        if (!isOwner) {
          if (command.admin && !isAdmin) {
            return msg.react("⚠️").then(() => msg.reply("This command can only executed by the admin!"));
          } else if (command.botAdmin && !isBotAdmin) {
            return msg.react("⚠️").then(() => msg.reply("Make sure the bot is admin before executing this command!"));
          }
        }

        // Anti-Ban: Check rate limit
        if (!AntiBan.checkRateLimit(msg.sender)) {
          return msg.react("⏳").then(() => msg.reply("You're sending commands too fast! Please wait a moment before trying again."));
        }

        // Safeguard: Check command limits (exclude games)
        if (!command.category || command.category !== 'game') {
          if (!AntiBan.checkCommandLimit(msg.sender)) {
            return msg.react("🚫").then(() => msg.reply("You've sent too many commands within 7 seconds! Please wait before sending more commands."));
          }

          if (!AntiBan.checkConsecutiveLimit(msg.sender)) {
            return msg.react("🚫").then(() => msg.reply("You've sent too many commands in a row! Please wait before sending more commands."));
          }
        }

        // Anti-Ban: Delay incoming command processing
        await AntiBan.delayIncomingCommand();

        // Execute the command requested by user
        let extra = {
          bot: this,
          usedPrefix,
          participants,
          groupMetadata,
          args,
          command: commandName,
        };
        try {
          await command.execute.call(this, msg, extra);
        } catch (error) {
          console.error(error);
          this.sendMessage(
            msg.key.remoteJid,
            {
              text: "There's some error while executing the command, please contact the owner to resolve this problem!",
            },
            { quoted: msg }
          );
        }
      }
    } finally {
      require("../lib/print")(this, msg, msg.isGroup ? await getGroupMetadata(msg.from, this) : {});
    }
  },
};