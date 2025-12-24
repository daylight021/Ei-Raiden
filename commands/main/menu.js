const PhoneNumber = require('awesome-phonenumber');

module.exports = {
  name: "menu",
  alias: ["help"],
  description: "Menampilkan daftar perintah bot.",
  execute: async (msg, { bot, usedPrefix }) => {
    
    // --- Fungsi Aman untuk Membersihkan Nomor ---
    const cleanUserNumber = (jid) => {
        try {
            // Ambil nomor dari JID (format: 628xxx@s.whatsapp.net)
            const rawNumber = jid.split('@')[0];
            
            // Coba format dengan awesome-phonenumber
            const pn = PhoneNumber('+' + rawNumber);
            
            // Cek apakah nomor valid
            if (pn.isValid()) {
                return pn.getNumber('international');
            }
            
            // Jika tidak valid, kembalikan format manual
            return '+' + rawNumber;
        } catch (error) {
            // Jika ada error, fallback ke format sederhana
            const rawNumber = jid.split('@')[0];
            return '+' + rawNumber;
        }
    };
    
    // --- Mengumpulkan Informasi ---
    
    const userName = msg.pushName || "Pengguna";
    const userNumber = cleanUserNumber(msg.sender);
    
    const botName = bot.user.name || "Nama Bot";
    const ownerNumber = `+${process.env.owner.replace(/[^0-9]/g, '')}`;
    
    // --- Membuat Daftar Perintah yang Rapi ---

    // 1. Dapatkan semua perintah unik
    const uniqueCommands = [...new Map(bot.commands.map(cmd => [cmd.name, cmd])).values()];
    
    // 2. Kelompokkan berdasarkan kategori
    const commandsByCategory = {};
    uniqueCommands.forEach(cmd => {
        const category = cmd.category || 'Lainnya';
        if (!commandsByCategory[category]) {
            commandsByCategory[category] = [];
        }
        commandsByCategory[category].push(cmd);
    });

    // 3. Buat teks menu
    let commandText = '';
    for (const category in commandsByCategory) {
        commandText += `┌─○「 *${category.toUpperCase()}* 」\n`;
        commandsByCategory[category].forEach(cmd => {
            // commandText += `│ ➤ ${usedPrefix}${cmd.name} - ${cmd.description || 'Tidak ada deskripsi'}\n`;
            commandText += `│ ➤ ${usedPrefix}${cmd.name}\n`;
        });
        commandText += `└─○\n\n`;
    }

    // --- Menyusun Tampilan Menu Final ---

    const menuString = `
┌─○「 *USER INFO* 」
│ *Nama* : ${userName}
│ *Nomor* : ${userNumber}
└─○

┌─○「 *BOT INFO* 」
│ *Nama Bot* : ${botName}
│ *Owner* : ${ownerNumber}
└─○

⊱⋆⊰───⊰⊱ ⋆⋅COMMANDS⋅⋆ ⊰⊱──⊱⋆⊰

${commandText.trim()}
`.trim();

    await bot.sendMessage(msg.from, { text: menuString });
  },
};