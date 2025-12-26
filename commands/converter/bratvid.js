const { createSticker } = require("../../lib/sticker-helper"); 

module.exports = {
  name: "bratvid",
  alias: ["bratgif", "vbrat", "sbratvid"],
  description: "Membuat stiker animasi (GIF) teks gaya brat.",
  execute: async (msg, { bot, usedPrefix }) => {
    try {
      // 1. Ekstrak text
      // Menghapus command prefix + nama command, lalu trim
      const body = msg.body || msg.text || (msg.message && (msg.message.conversation || msg.message.extendedTextMessage?.text)) || "";
      // Sesuaikan panjang slice dengan panjang command terpanjang atau split manual
      const args = body.trim().split(/\s+/);
      const text = body.slice(args[0].length).trim(); 

      if (!text) {
        return await bot.sendMessage(msg.from, { 
          text: `Gunakan format:\n${usedPrefix}bratvid <teks>\n\nContoh:\n${usedPrefix}bratvid siapa suruh datang` 
        }, { quoted: msg });
      }

      if (text.length > 100) return msg.reply('⚠️ Teks terlalu panjang! Maksimal 100 karakter.');

      await msg.react("⏳");

      // 2. Request ke API
      const API_KEY = '1NhvxjupkX';
      const apiUrl = `https://anabot.my.id/api/maker/bratGif?text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(API_KEY)}`;
      
      const response = await fetch(apiUrl);
      const contentType = response.headers.get('content-type');

      let buffer;

      // 3. Penanganan Respons (JSON vs Raw Video)
      if (contentType && contentType.includes('application/json')) {
        // Skenario A: API memberikan JSON berisi URL
        const json = await response.json();
        if (!json.status || !json.data || !json.data.url) {
          await msg.react("❌");
          return msg.reply('❌ Gagal membuat video (API Error/Limit).');
        }
        // Download video dari URL yang diberikan JSON
        const videoResponse = await fetch(json.data.url);
        buffer = await videoResponse.arrayBuffer();
      } else {
        // Skenario B: API langsung memberikan file video (Raw Buffer)
        buffer = await response.arrayBuffer();
      }

      // 4. Validasi Buffer
      if (!buffer || buffer.byteLength === 0) {
        await msg.react("❌");
        return msg.reply('❌ Gagal mengunduh data video.');
      }

      // 5. Konversi ke Stiker menggunakan sticker-helper
      console.log("Mengonversi brat video ke stiker...");
      
      try {
        const stickerBuffer = Buffer.from(buffer);
        
        // Gunakan createSticker dari helper kamu
        // Helper ini otomatis mengompres video agar muat jadi stiker WA (< 1MB)
        const sticker = await createSticker(stickerBuffer, {
            pack: "Brat Vid",
            author: "By Bot"
        });

        // Helper kamu mengembalikan objek yang memiliki method toMessage()
        const stickerMessage = await sticker.toMessage();

        // 6. Kirim Stiker
        await bot.sendMessage(msg.from, stickerMessage, { quoted: msg });
        await msg.react("✅");

      } catch (conversionError) {
        console.error("Gagal convert ke stiker:", conversionError);
        // Fallback: Jika gagal jadi stiker, kirim sebagai video biasa
        await bot.sendMessage(msg.from, { 
            video: Buffer.from(buffer), 
            caption: "⚠️ Gagal konversi ke stiker (file terlalu berat), mengirim sebagai video.",
            gifPlayback: true
        }, { quoted: msg });
      }

    } catch (e) {
      console.error(e);
      await msg.react("❌");
      await bot.sendMessage(msg.from, { text: `Terjadi kesalahan: ${e.message}` }, { quoted: msg });
    }
  },
};
