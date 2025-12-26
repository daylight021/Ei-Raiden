// file: commands/sticker/brat.js

const { Sticker, StickerTypes } = require('wa-sticker-formatter');

module.exports = {
  name: "brat",
  alias: ["bratsticker", "sbrat"],
  category: "sticker",
  description: "Membuat stiker teks gaya brat (Max 30 karakter).",
  execute: async (msg, { bot, usedPrefix }) => {
    try {
      // 1. Ekstrak text dari pesan
      const body = msg.body || msg.text || (msg.message && (msg.message.conversation || msg.message.extendedTextMessage?.text)) || "";
      const text = body.slice(usedPrefix.length + "brat".length).trim();

      // 2. Validasi Input
      if (!text) {
        return await bot.sendMessage(msg.from, { 
          text: `Gunakan format:\n${usedPrefix}brat <teks>\n\nContoh:\n${usedPrefix}brat siapa yang bikin onar` 
        }, { quoted: msg });
      }

      if (text.length > 30) {
        return await bot.sendMessage(msg.from, { 
          text: '⚠️ Teks terlalu panjang! Maksimal 30 karakter.' 
        }, { quoted: msg });
      }

      // 3. Reaksi Loading
      await msg.react("⏳");

      // 4. Konfigurasi API
      const BRAT_API_KEY = '1NhvxjupkX'; 
      const apiUrl = `https://anabot.my.id/api/maker/brat?text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(BRAT_API_KEY)}`;

      // 5. Fetch Data
      const response = await fetch(apiUrl);

      // Cek jika API error (biasanya JSON)
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const json = await response.json();
        if (!json.status) {
          await msg.react("❌");
          return await bot.sendMessage(msg.from, { text: '❌ Gagal membuat stiker brat (API Error).' }, { quoted: msg });
        }
      }

      // 6. Ambil Buffer Gambar Mentah
      const imageBuffer = await response.arrayBuffer();

      // 7. Konversi ke Stiker menggunakan wa-sticker-formatter (Seperti di stext.js)
      // Langkah ini penting untuk memperbaiki bug "stiker tidak bisa dibuka di mobile"
      const sticker = new Sticker(Buffer.from(imageBuffer), {
        pack: process.env.stickerPackname || 'Brat Bot', // Mengambil dari env atau default
        author: process.env.stickerAuthor || 'By Bot',
        type: StickerTypes.FULL, // Agar stiker tampil penuh (kotak)
        quality: 70 // Kualitas gambar
      });

      // 8. Generate Message Sticker
      const stickerMessage = await sticker.toMessage();

      // 9. Kirim Stiker
      await bot.sendMessage(msg.from, stickerMessage, { quoted: msg });
      await msg.react("✅");

    } catch (e) {
      console.error(e);
      await msg.react("❌");
      await bot.sendMessage(msg.from, { text: `Terjadi kesalahan: ${e.message}` }, { quoted: msg });
    }
  },
};
