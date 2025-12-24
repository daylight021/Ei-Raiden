module.exports = {
    name: "checkname",
    category: "owner",
    description: "Check WhatsApp name vs contact name",
    owner: true,
    execute: async (msg, { bot, args }) => {
        const targetJid = msg.quoted ? msg.quoted.sender : msg.sender;
        const phone = targetJid.split('@')[0];
        const standardJid = `${phone}@s.whatsapp.net`;

        let result = `JID: ${targetJid}\n`;

        if (bot.store?.data?.contacts) {
            const contact = bot.store.data.contacts[targetJid] ||
                bot.store.data.contacts[standardJid];

            if (contact) {
                result += `\n📱 **Contact Data:**\n`;
                result += `• verifiedName: ${contact.verifiedName || 'none'}\n`;
                result += `• notify: ${contact.notify || 'none'}\n`;
                result += `• pushName: ${contact.pushName || 'none'}\n`;
                result += `• name: ${contact.name || 'none'}\n`;
                result += `\n⚠️ **name** adalah nama kontak Anda!\n`;
                result += `✅ **verifiedName/notify** adalah nama WA mereka!`;
            } else {
                result += `\n❌ Tidak ditemukan di contacts`;
            }
        }

        if (bot.metadataManager) {
            const waName = bot.metadataManager.getPureWhatsAppName(targetJid);
            result += `\n\n🔍 **Pure WA Name:** ${waName || 'Not found'}`;
        }

        return msg.reply(result);
    }
};