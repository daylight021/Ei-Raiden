module.exports = {
  name: "bratvid",
  alias: ["bratgif", "vbrat"],
  description: "Membuat animasi video/GIF teks gaya brat.",
  execute: async (msg, { bot, usedPrefix }) => {
    try {
      // 1. Ekstrak text dari pesan
      const body = msg.body || msg.text || (msg.message && (msg.message.conversation || msg.message.extendedTextMessage?.text)) || "";
      const text = body.slice(usedPrefix.length + 7).trim(); // +7 untuk panjang "bratvid"

      // 2. Validasi Input
      if (!text) {
        return await bot.sendMessage(msg.from, { 
          text: `Gunakan format:\n${usedPrefix}bratvid <teks>\n\nContoh:\n${usedPrefix}bratvid goyang dumang` 
        }, { quoted: msg });
      }

      if (text.length > 100) {
        return await bot.sendMessage(msg.from, { 
          text: '⚠️ Teks terlalu panjang! Maksimal 100 karakter.' 
        }, { quoted: msg });
      }

      // 3. Reaksi Loading
      await msg.react("⏳");

      // 4. Konfigurasi API
      const API_KEY = '1NhvxjupkX'; 
      const apiUrl = `https://anabot.my.id/api/maker/bratGif?text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(API_KEY)}`;

      // 5. Fetch API Utama
      const response = await fetch(apiUrl);
      const contentType = response.headers.get('content-type');

      // Variabel untuk menyimpan URL akhir media
      let mediaUrl = '';

      // Skenario A: API Mengembalikan JSON (berisi URL media)
      if (contentType && contentType.includes('application/json')) {
        const json = await response.json();
        if (!json.status || !json.data || !json.data.url) {
          await msg.react("❌");
          return await bot.sendMessage(msg.from, { text: '❌ Gagal membuat brat video (API Error).' }, { quoted: msg });
        }
        mediaUrl = json.data.url;
      } 
      // Skenario B: API Mengembalikan File Langsung (Jaga-jaga)
      else if (contentType && (contentType.includes('video') || contentType.includes('image'))) {
          // Jika langsung file, kita bisa pakai url API langsung atau buffer
          // Namun API ini biasanya mereturn JSON dulu
      }

      if (!mediaUrl) {
         return await bot.sendMessage(msg.from, { text: '❌ Tidak dapat menemukan URL media.' }, { quoted: msg });
      }

      // 6. Kirim Video
      // Kita kirim sebagai video dengan opsi gifPlayback: true agar loop otomatis di WA
      await bot.sendMessage(msg.from, { 
        video: { url: mediaUrl }, 
        caption: `Brat Video: ${text}`,
        gifPlayback: true // Ini membuat video diputar otomatis tanpa suara (seperti GIF)
      }, { quoted: msg });

      await msg.react("✅");

    } catch (e) {
      console.error(e);
      await msg.react("❌");
      await bot.sendMessage(msg.from, { text: `Terjadi kesalahan: ${e.message}` }, { quoted: msg });
    }
  },
};