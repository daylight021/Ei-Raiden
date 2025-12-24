/**
 * Test GIF Command
 * Untuk testing apakah GIF bisa dikirim dengan benar
 */

module.exports = {
  name: "testgif",
  alias: ["test-gif"],
  category: "owner",
  desc: "Test sending GIF with different methods",
  owner: true,
  execute: async (msg, { bot, args }) => {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Check if there's media in the message
      let hasMedia = false;
      let mediaBuffer = null;
      let mediaPath = null;

      // Check for media in current message
      if (msg.type === 'imageMessage' && msg.msg) {
        const isGif = msg.msg.mimetype === 'image/gif';
        if (!isGif) {
          return bot.sendMessage(msg.from, { 
            text: '❌ Please send a GIF image, not regular image!' 
          });
        }
        hasMedia = true;
      } else if (msg.type === 'documentMessage' && msg.msg) {
        const isGif = msg.msg.mimetype === 'image/gif' || 
                      msg.msg.fileName?.toLowerCase().endsWith('.gif');
        if (!isGif) {
          return bot.sendMessage(msg.from, { 
            text: '❌ Please send a GIF document!' 
          });
        }
        hasMedia = true;
      } else if (msg.quoted && msg.quoted.isMedia) {
        if (msg.quoted.type === 'imageMessage') {
          const isGif = msg.quoted.msg.mimetype === 'image/gif';
          if (!isGif) {
            return bot.sendMessage(msg.from, { 
              text: '❌ Quoted message must be a GIF!' 
            });
          }
          hasMedia = true;
        }
      }

      if (!hasMedia) {
        return bot.sendMessage(msg.from, { 
          text: `*🧪 GIF Test Command*

*Usage:*
1. Send GIF with caption: \`.testgif\`
2. Reply to GIF with: \`.testgif\`

This will test 3 different methods:
• Method 1: Send as image with mimetype 'image/gif'
• Method 2: Send as video with gifPlayback
• Method 3: Send as video without gifPlayback

Choose the method that works best!` 
        });
      }

      // Download the GIF
      const WelcomeHelper = require("../../lib/welcomeHelper");
      const helper = new WelcomeHelper(bot);

      let messageContent;
      if (msg.quoted && msg.quoted.isMedia) {
        messageContent = msg.quoted.message;
      } else {
        messageContent = msg.message;
      }

      const isDocument = msg.type === 'documentMessage' || msg.quoted?.type === 'documentMessage';

      await bot.sendMessage(msg.from, { 
        text: '⏳ Downloading GIF...' 
      });

      const downloadResult = await helper.downloadMedia(messageContent, 'image', isDocument);
      mediaBuffer = downloadResult.buffer;

      await bot.sendMessage(msg.from, { 
        text: `✅ Downloaded: ${(mediaBuffer.length / 1024).toFixed(2)} KB

🧪 Testing 3 methods...` 
      });

      // Method 1: Send as image with gif mimetype
      await bot.sendMessage(msg.from, { 
        text: '📤 Method 1: Image with mimetype "image/gif"' 
      });
      
      try {
        await bot.sendMessage(msg.from, {
          image: mediaBuffer,
          mimetype: 'image/gif',
          caption: '🎨 Method 1: Sent as IMAGE with mimetype "image/gif"\n\nShould autoplay and loop infinitely.'
        });
        await bot.sendMessage(msg.from, { text: '✅ Method 1: Success!' });
      } catch (error) {
        await bot.sendMessage(msg.from, { 
          text: `❌ Method 1: Failed - ${error.message}` 
        });
      }

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Method 2: Send as video with gifPlayback
      await bot.sendMessage(msg.from, { 
        text: '📤 Method 2: Video with gifPlayback: true' 
      });
      
      try {
        await bot.sendMessage(msg.from, {
          video: mediaBuffer,
          gifPlayback: true,
          caption: '🎬 Method 2: Sent as VIDEO with gifPlayback: true\n\nShould show as animated.'
        });
        await bot.sendMessage(msg.from, { text: '✅ Method 2: Success!' });
      } catch (error) {
        await bot.sendMessage(msg.from, { 
          text: `❌ Method 2: Failed - ${error.message}` 
        });
      }

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Method 3: Send as video without gifPlayback
      await bot.sendMessage(msg.from, { 
        text: '📤 Method 3: Video without gifPlayback' 
      });
      
      try {
        await bot.sendMessage(msg.from, {
          video: mediaBuffer,
          caption: '🎥 Method 3: Sent as VIDEO without gifPlayback\n\nShould show as regular video.'
        });
        await bot.sendMessage(msg.from, { text: '✅ Method 3: Success!' });
      } catch (error) {
        await bot.sendMessage(msg.from, { 
          text: `❌ Method 3: Failed - ${error.message}` 
        });
      }

      // Final message
      await bot.sendMessage(msg.from, { 
        text: `🎯 *Test Complete!*

Check which method works best:
✅ Method 1: Image + mimetype 'image/gif'
✅ Method 2: Video + gifPlayback
✅ Method 3: Video only

*Recommended:* Use Method 1 for best compatibility!` 
      });

    } catch (error) {
      console.error("[TESTGIF] Error:", error);
      bot.sendMessage(msg.from, { 
        text: `❌ Test failed: ${error.message}\n\nStack: ${error.stack}` 
      });
    }
  }
};