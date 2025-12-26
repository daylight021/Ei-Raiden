module.exports = {
  name: "brat",
  alias: ["bratsticker", "sbrat"],
  category: "sticker", // Kategori ditambahkan agar muncul rapi di Menu
  description: "Membuat stiker teks gaya brat (Max 30 karakter).",
  execute: async (msg, { bot, usedPrefix }) => {
    try {
      // 1. Ekstrak text dari pesan
      // Mengambil isi pesan, menghapus command prefix + nama command, lalu trim spasi
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

      // 3. Berikan reaksi loading (opsional, jika bot mendukung)
      await bot.sendMessage(msg.from, { react: { text: '🟩', key: msg.key } });

      // 4. Konfigurasi API
      const BRAT_API_KEY = '1NhvxjupkX'; // Key dari file brat.js lama
      const apiUrl = `https://anabot.my.id/api/maker/brat?text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(BRAT_API_KEY)}`;

      // 5. Fetch Data
      // Pastikan Node.js versi 18+ agar fetch native tersedia, atau gunakan 'node-fetch'
      const response = await fetch(apiUrl);

      // Cek tipe konten
      const contentType = response.headers.get('content-type');

      // Jika API mengembalikan JSON (biasanya error)
      if (contentType.includes('application/json')) {
        const json = await response.json();
        if (!json.status) {
          return await bot.sendMessage(msg.from, { text: '❌ Gagal membuat stiker brat (API Error).' }, { quoted: msg });
        }
      }

      // 6. Ambil Buffer Gambar
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 7. Kirim Stiker
      // Menggunakan format standar Baileys untuk mengirim stiker dari buffer
      await bot.sendMessage(msg.from, { 
        sticker: buffer,
        packname: "Brat Bot", // Bisa disesuaikan
        author: "By Bot"      // Bisa disesuaikan
      }, { quoted: msg });

    } catch (e) {
      console.error(e);
      await bot.sendMessage(msg.from, { text: `Terjadi kesalahan: ${e.message}` }, { quoted: msg });
    }
  },
};