module.exports = {
  name: "bratvid",
  alias: ["bratgif", "vbrat"],
  description: "Membuat animasi video/GIF teks gaya brat.",
  execute: async (msg, { bot, usedPrefix }) => {
    try {
      // 1. Ekstrak text
      const body = msg.body || msg.text || (msg.message && (msg.message.conversation || msg.message.extendedTextMessage?.text)) || "";
      const text = body.slice(usedPrefix.length + 7).trim(); // +7 untuk "bratvid"

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

      // 5. Kirim Video (Buffer)
      // Menggunakan Buffer lebih stabil daripada URL
      await bot.sendMessage(msg.from, { 
        video: Buffer.from(buffer), 
        caption: `Brat Video: ${text}`,
        gifPlayback: true // Agar loop otomatis tanpa suara
      }, { quoted: msg });

      await msg.react("✅");

    } catch (e) {
      console.error(e);
      await msg.react("❌");
      await bot.sendMessage(msg.from, { text: `Terjadi kesalahan: ${e.message}` }, { quoted: msg });
    }
  },
};
