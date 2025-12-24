// tiktok.js (Perbaikan dengan Debugging)
const axios = require("axios");
const { generateWAMessageFromContent, prepareWAMessageMedia } = require("@whiskeysockets/baileys");

/**
 * =================================================================
 * FUNGSI TIKTOK DOWNLOADER BERDASARKAN KODE REFERENSI
 * =================================================================
 * Mengimplementasikan logika dari fungsi tiktokDl yang sudah
 * terbukti berhasil.
 */
async function tiktokDl(url) {
  try {
    const response = await axios.post('https://www.tikwm.com/api/', {}, {
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://www.tikwm.com',
        'Referer': 'https://www.tikwm.com/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'
      },
      params: {
        url: url,
        hd: 1 // Meminta kualitas HD
      }
    });

    const res = response.data.data;

    if (!res) {
      throw new Error('Respons API tidak valid atau tidak berisi data.');
    }

    const media = [];
    // Cek jika ini adalah slideshow gambar
    if (res.images && res.images.length > 0) {
      res.images.forEach(imgUrl => {
        media.push({
          type: 'image',
          url: imgUrl,
          title: res.title || "TikTok Image"
        });
      });
    }
    // Jika bukan, ini adalah video
    else if (res.play) {
      media.push({
        type: 'video',
        url: res.hdplay || res.play,
        title: res.title || "TikTok Video"
      }); // Prioritaskan HD
    } else {
      throw new Error('Tidak ada media video atau gambar yang ditemukan dalam respons API.');
    }

    return {
      title: res.title || "TikTok Content",
      author: res.author?.unique_id || "unknown",
      nickname: res.author?.nickname || "unknown",
      durations: res.duration,
      duration: res.duration + ' Detik',
      media: media
    };

  } catch (e) {
    const errorMessage = e.response ? e.response.data.msg : e.message;
    throw new Error(`API tikwm.com gagal: ${errorMessage}`);
  }
}

/**
 * Fungsi untuk membuat carousel dari media TikTok
 */
async function createTikTokCarousel(bot, m, result) {
  const caption = `🎞 *${result.title}*\n⏳ *${result.duration}*\n👤 *${result.author}* (@${result.nickname})`;

  console.log(`Membuat carousel untuk ${result.media.length} media...`);

  // Prepare cards for carousel - maksimal 10 card
  const maxCards = Math.min(result.media.length, 10);
  const cards = [];

  for (let i = 0; i < maxCards; i++) {
    const item = result.media[i];
    console.log(`Processing media ${i + 1}/${maxCards}...`);

    try {
      let media;
      let buttons = [];

      if (item.type === 'video') {
        // Untuk video, kita akan menggunakan thumbnail saja di carousel
        // karena carousel tidak support video langsung
        media = await prepareWAMessageMedia(
          {
            image: { url: "https://files.catbox.moe/kz0ier.jpeg" },
            mimetype: 'image/jpeg'
          },
          { upload: bot.waUploadToServer }
        );

        buttons = [{
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: "📥 Download Video",
            url: item.url,
            merchant_url: item.url
          })
        }];

      } else {
        // PERBAIKAN: Menyiapkan gambar
        media = await prepareWAMessageMedia(
          {
            image: { url: item.url },
            mimetype: 'image/jpeg'
          },
          { upload: bot.waUploadToServer }
        );

        // PERBAIKAN: Menambahkan tombol download/lihat pada gambar
        // WA mewajibkan ada interaksi di dalam card carousel
        buttons = [{
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: "🖼 Lihat Gambar Asli",
            url: item.url,
            merchant_url: item.url
          })
        }];
      }

      cards.push({
        header: {
          hasMediaAttachment: true,
          ...media
        },
        body: {
          text: item.type === 'video'
            ? `🎥 Video TikTok (${i + 1}/${maxCards})`
            : `🖼 Gambar TikTok (${i + 1}/${maxCards})`
        },
        footer: {
          text: `By: ${result.author}`
        },
        nativeFlowMessage: {
          buttons: buttons
        }
      });

    } catch (error) {
      console.error(`Gagal prepare media ${i + 1}:`, error.message);
    }
  }

  console.log(`Total cards dibuat: ${cards.length}`);

  // PERBAIKAN UTAMA: Menggunakan viewOnceMessage seperti di carousel.js
  const msg = generateWAMessageFromContent(m.chat, {
    viewOnceMessage: {
      message: {
        interactiveMessage: {
          body: {
            text: caption + `\n\n📊 Total: ${result.media.length} media\n⬅️➡️ Geser untuk melihat`
          },
          footer: {
            text: `📱 TikTok Downloader • ${new Date().toLocaleDateString('id-ID')}`
          },
          header: {
            hasMediaAttachment: false
          },
          carouselMessage: {
            cards: cards
          }
        }
      }
    }
  }, { quoted: m });

  return msg;
}

module.exports = {
  name: "tt",
  description: "Unduh media dari TikTok (video atau slideshow gambar).",
  execute: async (m, { args, bot, usedPrefix }) => {
    const url = args[0];
    if (!url || !url.includes("tiktok.com")) {
      return m.reply("❌ Masukkan URL TikTok yang valid.\n\nContoh: " + usedPrefix + "tt https://vt.tiktok.com/ZSPGf7PoD/");
    }

    await m.react("⏳");

    try {
      const result = await tiktokDl(url);

      if (!result.media || result.media.length === 0) {
        throw new Error("Tidak ada media yang bisa diunduh.");
      }

      console.log(`Media count: ${result.media.length}, types: ${result.media.map(m => m.type).join(', ')}`);

      // OPTION 1: Jika slideshow gambar (lebih dari 1 gambar)
      if (result.media.length > 1 && result.media[0].type === 'image') {
        console.log("Detected image slideshow, creating carousel...");

        // Coba carousel dulu
        try {
          const carouselMsg = await createTikTokCarousel(bot, m, result);
          await bot.relayMessage(m.from, carouselMsg.message, { messageId: carouselMsg.key.id });
          await m.react("✅");
          return;
        } catch (carouselError) {
          console.error("Carousel error:", carouselError.message);
          // Fallback ke metode album
        }
      }

      // OPTION 2: Kirim sebagai album (satu per satu)
      console.log("Mengirim sebagai album...");
      await m.reply(`✅ *${result.title || "TikTok Content"}*\n👤 ${result.author}\n⏱ ${result.duration}\n📦 ${result.media.length} media\n\n_Mengirim..._`);

      let sentCount = 0;
      const maxToSend = Math.min(result.media.length, 15); // Batasi maksimal 15

      for (let i = 0; i < maxToSend; i++) {
        const item = result.media[i];
        try {
          const mediaCaption = i === 0
            ? `🎞 ${result.title}\n👤 ${result.author}\n⏱ ${result.duration}\n📸 ${i + 1}/${maxToSend}`
            : `📸 ${i + 1}/${maxToSend}`;

          if (item.type === 'video') {
            await bot.sendMessage(
              m.from,
              {
                video: { url: item.url },
                caption: mediaCaption,
                gifPlayback: false
              },
              { quoted: i === 0 ? m : null } // Hanya quote pesan pertama
            );
          } else {
            await bot.sendMessage(
              m.from,
              {
                image: { url: item.url },
                caption: mediaCaption
              },
              { quoted: i === 0 ? m : null }
            );
          }
          sentCount++;

          // Delay untuk menghindari rate limit
          if (i < maxToSend - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
          }
        } catch (sendError) {
          console.error(`Error sending media ${i + 1}:`, sendError.message);
        }
      }

      await m.react(sentCount > 0 ? "✅" : "⚠️");
      if (sentCount < result.media.length) {
        await m.reply(`📊 Berhasil mengirim ${sentCount} dari ${result.media.length} media.`);
      }

    } catch (err) {
      console.error("Proses unduh TikTok gagal:", err);
      await m.react("❌");
      return m.reply(`❌ Gagal: ${err.message}\n\nCoba URL yang berbeda atau coba lagi nanti.`);
    }
  },
};