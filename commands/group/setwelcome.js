const WelcomeHelper = require("../../lib/welcomeHelper");

module.exports = {
  name: "setwelcome",
  alias: ["set-welcome", "welcome"],
  category: "group",
  desc: "Set custom welcome message for group (admins and owner only)",
  group: true,
  admin: true,
  owner: false,
  execute: async (msg, { bot, args }) => {
    try {
      const groupId = msg.from;
      
      // Use global welcomeHelper instance, or create new one if not available
      const welcomeHelper = bot.welcomeHelper || new (require("../../lib/welcomeHelper"))(bot);
      
      // Ensure database is ready
      await welcomeHelper.ensureDatabase();

      console.log('[SETWELCOME] msg.type:', msg.type);
      console.log('[SETWELCOME] msg.mtype:', msg.mtype);
      console.log('[SETWELCOME] msg.isMedia:', msg.isMedia);

      let messageText = msg.text || args.join(" ") || "";

      let hasMedia = false;
      let mediaType = null;
      let mediaSource = null;
      let isDocument = false;

      // Check imageMessage (including GIF)
      if (msg.type === 'imageMessage' && msg.msg) {
        messageText = msg.msg.caption || messageText;
        hasMedia = true;
        mediaType = 'image';
        mediaSource = msg.message;
        isDocument = false;
        
        const isGif = msg.msg.mimetype === 'image/gif';
        console.log(`[SETWELCOME] ✅ Image detected (GIF: ${isGif})`);
      }
      // Check videoMessage
      else if (msg.type === 'videoMessage' && msg.msg) {
        messageText = msg.msg.caption || messageText;
        hasMedia = true;
        mediaType = 'video';
        mediaSource = msg.message;
        isDocument = false;
        console.log('[SETWELCOME] ✅ Video detected');
      }
      // Check documentMessage
      else if (msg.type === 'documentMessage' && msg.msg) {
        const docMsg = msg.msg;
        console.log('[SETWELCOME] Document mimetype:', docMsg.mimetype);
        console.log('[SETWELCOME] Document fileName:', docMsg.fileName);

        const isGif = docMsg.mimetype === 'image/gif' ||
          docMsg.fileName?.toLowerCase().endsWith('.gif');
        const isImage = !isGif && (docMsg.mimetype?.startsWith('image/') ||
          docMsg.fileName?.match(/\.(jpg|jpeg|png|webp)$/i));
        const isVideo = docMsg.mimetype?.startsWith('video/') ||
          docMsg.fileName?.match(/\.(mp4|mov|avi|mkv|webm)$/i);

        if (isGif || isImage || isVideo) {
          messageText = docMsg.caption || messageText;
          hasMedia = true;
          mediaType = isGif ? 'image' : (isImage ? 'image' : 'video');
          mediaSource = msg.message;
          isDocument = true;
          console.log(`[SETWELCOME] ✅ Document ${mediaType} detected (GIF: ${isGif})`);
        }
      }
      // Check quoted message
      else if (msg.quoted && msg.quoted.isMedia) {
        messageText = args.join(" ") || msg.text || "";
        
        if (msg.quoted.type === 'imageMessage') {
          hasMedia = true;
          mediaType = 'image';
          mediaSource = msg.quoted.message;
          isDocument = false;
          console.log('[SETWELCOME] ✅ Quoted image detected');
        } else if (msg.quoted.type === 'videoMessage') {
          hasMedia = true;
          mediaType = 'video';
          mediaSource = msg.quoted.message;
          isDocument = false;
          console.log('[SETWELCOME] ✅ Quoted video detected');
        } else if (msg.quoted.type === 'documentMessage') {
          const quotedDoc = msg.quoted.msg;
          const isGif = quotedDoc.mimetype === 'image/gif' ||
                       quotedDoc.fileName?.toLowerCase().endsWith('.gif');
          const isImage = !isGif && (quotedDoc.mimetype?.startsWith('image/') ||
                         quotedDoc.fileName?.match(/\.(jpg|jpeg|png|webp)$/i));
          const isVideo = quotedDoc.mimetype?.startsWith('video/') ||
                         quotedDoc.fileName?.match(/\.(mp4|mov|avi|mkv|webm)$/i);
          
          if (isGif || isImage || isVideo) {
            hasMedia = true;
            mediaType = isGif ? 'image' : (isImage ? 'image' : 'video');
            mediaSource = msg.quoted.message;
            isDocument = true;
            console.log(`[SETWELCOME] ✅ Quoted document ${mediaType} detected (GIF: ${isGif})`);
          }
        }
      }

      // Remove command from text
      const commands = ['setwelcome', 'set-welcome', 'welcome'];
      for (const cmd of commands) {
        const regex = new RegExp(`^[.!#/]${cmd}\\s*`, 'i');
        messageText = messageText.replace(regex, '').trim();
      }

      console.log('[SETWELCOME] Has media:', hasMedia);
      console.log('[SETWELCOME] Media type:', mediaType);
      console.log('[SETWELCOME] Is document:', isDocument);
      console.log('[SETWELCOME] Text length:', messageText.length);

      // Show current message if no input
      if (!messageText && !hasMedia) {
        const currentMessage = welcomeHelper.getWelcomeMessage(groupId);
        let response = `*📋 Current Welcome Message:*\n\n${currentMessage.text}\n\n`;
        
        if (currentMessage.media) {
          response += `📎 *Media:* ${currentMessage.media.type.toUpperCase()}\n`;
          response += `📄 *File:* ${currentMessage.media.filename}\n`;
          response += `💾 *Size:* ${(currentMessage.media.size / 1024).toFixed(2)} KB\n`;
          if (currentMessage.media.isGif) {
            response += `🎨 *Type:* Animated GIF\n`;
          }
          response += `\n`;
        }
        
        response += `*💡 Usage:*\n`;
        response += `1. Send GIF/image/video WITH caption:\n`;
        response += `   \`.setwelcome Your message here\`\n\n`;
        response += `2. Reply to media with:\n`;
        response += `   \`.setwelcome Your message here\`\n\n`;
        response += `3. GIF stays as GIF (auto-play, loop)\n`;
        response += `4. MP4/Video converts to GIF\n\n`;
        response += `*🎯 Placeholders:*\n`;
        response += `• \`{groupName}\` - Group name\n`;
        response += `• \`{user}\` - User mention\n\n`;
        response += `*🗑️ Reset:* \`.setwelcome delete\``;
        
        return bot.sendMessage(msg.from, { text: response });
      }

      // Handle delete command
      if (messageText.toLowerCase() === 'delete') {
        const deleted = await welcomeHelper.deleteWelcomeMessage(groupId);
        if (deleted) {
          return bot.sendMessage(msg.from, { 
            text: "✅ Welcome message reset to default! Old media deleted." 
          });
        } else {
          return bot.sendMessage(msg.from, { 
            text: "❌ No custom welcome message was set." 
          });
        }
      }

      // Set welcome message
      console.log('[SETWELCOME] Setting welcome message...');
      const success = await welcomeHelper.setWelcomeMessage(
        groupId,
        messageText,
        hasMedia ? mediaSource : null,
        mediaType,
        isDocument
      );

      if (success) {
        let response = "✅ *Welcome message updated successfully!*\n\n";
        response += `*Preview:*\n${welcomeHelper.formatMessage(messageText, "Group Name", "@user")}`;
        
        if (hasMedia) {
          const savedMedia = welcomeHelper.getWelcomeMessage(groupId).media;
          if (savedMedia) {
            response += `\n\n📎 *Media:* ${savedMedia.type.toUpperCase()}`;
            if (savedMedia.isGif) {
              response += ` (GIF - will auto-play & loop)`;
            }
            response += `\n💾 *Size:* ${(savedMedia.size / 1024).toFixed(2)} KB`;
          }
        }
        
        bot.sendMessage(msg.from, { text: response });
      } else {
        bot.sendMessage(msg.from, { 
          text: "❌ Failed to update welcome message. Check console for details." 
        });
      }

    } catch (error) {
      console.error("[SETWELCOME] Error:", error);
      console.error("[SETWELCOME] Stack:", error.stack);
      bot.sendMessage(msg.from, { 
        text: `❌ An error occurred: ${error.message}` 
      });
    }
  }
};