module.exports = {
  name: "updatemetadata",
  alias: ["update-metadata", "refresh-metadata", "syncmeta"],
  category: "owner",
  desc: "Update group metadata manually (Owner only)",
  owner: true,
  execute: async (msg, { bot, args }) => {
    try {
      const isGroup = msg.from.endsWith('@g.us');
      
      // Jika command dengan argument "check", tampilkan statistik tanpa update
      if (args[0] === "check") {
        if (!isGroup) {
          return await bot.sendMessage(msg.from, { text: "❌ This command must be used in a group!" });
        }
        
        const metadata = await bot.metadataManager.getGroupMetadata(msg.from, false);
        if (!metadata) {
          return await bot.sendMessage(msg.from, { text: "❌ Failed to get metadata!" });
        }
        
        const validNames = metadata.participants.filter(p => 
          p.name && bot.metadataManager.isValidName(p.name)
        );
        
        const invalidNames = metadata.participants.filter(p => 
          !p.name || !bot.metadataManager.isValidName(p.name)
        );
        
        let response = "📊 *Metadata Status Check*\n\n";
        response += `📋 *Group:* ${metadata.subject}\n`;
        response += `👥 *Total Members:* ${metadata.participants.length}\n\n`;
        response += `✅ *Valid Names:* ${validNames.length}\n`;
        response += `❌ *Invalid/Missing Names:* ${invalidNames.length}\n\n`;
        
        if (invalidNames.length > 0) {
          response += `*Members without valid names:*\n`;
          invalidNames.slice(0, 10).forEach(p => {
            response += `• ${p.phoneNumber || p.jid.split('@')[0]} (${p.name || 'NO NAME'})\n`;
          });
          if (invalidNames.length > 10) {
            response += `... and ${invalidNames.length - 10} more\n`;
          }
          response += `\n💡 Run \`.updatemetadata\` to fix this`;
        } else {
          response += `✅ All members have valid names!`;
        }
        
        response += `\n\n⏰ *Last Update:* ${new Date(metadata.lastUpdate).toLocaleString('id-ID')}`;
        
        return await bot.sendMessage(msg.from, { text: response });
      }
      
      // Jika di grup, update metadata grup tersebut
      if (isGroup) {
        await bot.sendMessage(msg.from, { text: "🔄 Updating metadata for this group..." });
        
        const result = await bot.metadataManager.forceUpdateGroupMetadata(msg.from);
        
        if (result) {
          const validNames = result.participants.filter(p => 
            p.name && bot.metadataManager.isValidName(p.name)
          );
          const invalidNames = result.participants.filter(p => 
            !p.name || !bot.metadataManager.isValidName(p.name)
          );
          
          let response = "✅ *Metadata Updated Successfully!*\n\n";
          response += `📋 *Group:* ${result.subject}\n`;
          response += `👥 *Total Members:* ${result.participants.length}\n`;
          response += `✅ *Valid Names:* ${validNames.length}\n`;
          response += `❌ *Invalid Names:* ${invalidNames.length}\n\n`;
          
          if (invalidNames.length > 0) {
            response += `⚠️ *Members still without valid names:*\n`;
            invalidNames.slice(0, 5).forEach(p => {
              response += `• ${p.phoneNumber || p.jid.split('@')[0]}\n`;
            });
            if (invalidNames.length > 5) {
              response += `... and ${invalidNames.length - 5} more\n`;
            }
            response += `\n💡 These users may not have set a WhatsApp name`;
          }
          
          response += `\n⏰ *Last Update:* ${new Date(result.lastUpdate).toLocaleString('id-ID')}`;
          
          await bot.sendMessage(msg.from, { text: response });
        } else {
          await bot.sendMessage(msg.from, { text: "❌ Failed to update metadata!" });
        }
      } 
      // Jika command dengan argument "all", update semua grup
      else if (args[0] === "all") {
        await bot.sendMessage(msg.from, { text: "🔄 Updating metadata for ALL groups...\nThis may take a while..." });
        
        const groups = bot.metadataManager.getBotGroups();
        let updated = 0;
        let failed = 0;
        let totalFixed = 0;
        
        for (const groupId of groups) {
          try {
            const result = await bot.metadataManager.forceUpdateGroupMetadata(groupId);
            if (result) {
              updated++;
              const validNames = result.participants.filter(p => 
                p.name && bot.metadataManager.isValidName(p.name)
              );
              totalFixed += validNames.length;
              console.log(`[UPDATE_METADATA] ✅ Updated: ${result.subject} (${validNames.length}/${result.participants.length} named)`);
            } else {
              failed++;
              console.log(`[UPDATE_METADATA] ❌ Failed: ${groupId}`);
            }
            // Delay untuk menghindari rate limit
            await new Promise(resolve => setTimeout(resolve, 1500));
          } catch (error) {
            failed++;
            console.error(`[UPDATE_METADATA] Error updating ${groupId}:`, error);
          }
        }
        
        let response = "✅ *Metadata Update Complete!*\n\n";
        response += `📊 *Total Groups:* ${groups.length}\n`;
        response += `✅ *Updated:* ${updated}\n`;
        response += `❌ *Failed:* ${failed}\n`;
        response += `👤 *Total Members with Names:* ${totalFixed}`;
        
        await bot.sendMessage(msg.from, { text: response });
      }
      // Jika di private chat tanpa argument, berikan panduan
      else {
        let response = "📋 *Update Metadata Commands*\n\n";
        response += "*Usage:*\n";
        response += "1️⃣ In group: `.updatemetadata`\n";
        response += "   └ Updates current group metadata\n\n";
        response += "2️⃣ In group: `.updatemetadata check`\n";
        response += "   └ Check metadata status without updating\n\n";
        response += "3️⃣ In private: `.updatemetadata all`\n";
        response += "   └ Updates all groups metadata\n\n";
        response += "*What it does:*\n";
        response += "• Fetches fresh data from WhatsApp\n";
        response += "• Updates member names from contacts\n";
        response += "• Validates and fixes LID/phone issues\n";
        response += "• Saves to database\n\n";
        response += "*Note:* Some users may not have names if they\nhaven't set a WhatsApp display name";
        
        await bot.sendMessage(msg.from, { text: response });
      }
      
    } catch (error) {
      console.error("[UPDATE_METADATA] Error:", error);
      await bot.sendMessage(msg.from, { text: `❌ An error occurred: ${error.message}` });
    }
  }
};