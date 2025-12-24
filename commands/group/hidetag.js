module.exports = {
  name: "hidetag",
  description: "Silently tag all group members with your message.",
  group: true,
  admin: true,
  botAdmin: true,
  execute: async (msg, { bot, args }) => {
    try {
      const metadata = await bot.groupMetadata(msg.from);
      
      // FILTER: Semua member kecuali pengirim (sender)
      const allMembersExceptSender = metadata.participants
        .filter(p => p.jid !== msg.sender && p.id !== msg.sender) // Exclude sender
        .map(p => p.jid || p.id);

      const message = args.join(" ") || "Pesan dari admin";
      
      // TEKNIK SILENT: Gunakan mentions TANPA trigger notifikasi
      await bot.sendMessage(msg.from, {
        text: message,
        mentions: allMembersExceptSender
      });

      console.log(`[HIDETAG] Silent message sent to ${allMembersExceptSender.length} members (all except sender)`);
      
    } catch (error) {
      console.error('Hidetag error:', error);
      msg.reply("❌ Gagal mengirim pesan silent.");
    }
  },
};