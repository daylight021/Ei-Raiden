module.exports = {
    name: "updatename",
    category: "owner",
    description: "Update user name from WhatsApp",
    owner: true,

    execute: async (msg, { bot, args }) => {
        try {
            const targetJid = msg.quoted ? msg.quoted.sender : msg.sender;

            msg.react("⏳");

            // Gunakan GroupMetadataManager untuk dapatkan WA name
            const metadataManager = bot.metadataManager;
            if (!metadataManager) {
                return msg.reply("Metadata manager not available");
            }

            // Force get WA name
            const waName = await metadataManager.getWhatsAppName(targetJid);

            if (waName) {
                // Update database
                if (!bot.db.data.users[targetJid]) {
                    bot.db.data.users[targetJid] = {};
                }
                bot.db.data.users[targetJid].name = waName;
                await bot.db.write();

                msg.react("✅");
                return msg.reply(`Name updated to: *${waName}*`);
            } else {
                msg.react("❌");
                return msg.reply("Could not fetch WhatsApp name");
            }
        } catch (error) {
            console.error(error);
            msg.react("⚠️");
            return msg.reply("Error updating name");
        }
    }
};