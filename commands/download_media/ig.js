const axios = require("axios");
const cheerio = require("cheerio");
const { generateWAMessageFromContent, prepareWAMessageMedia } = require("@whiskeysockets/baileys");

/**
 * =================================================================
 * FUNGSI IG Downloader (Scraper)
 * =================================================================
 */
async function instagramDl(url) {
    return new Promise(async (resolve, reject) => {
        try {
            const { data } = await axios.post('https://yt1s.io/api/ajaxSearch', new URLSearchParams({ q: url, vt: 'ig' }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                    'Referer': 'https://yt1s.io/'
                }
            });

            const $ = cheerio.load(data.data);
            const result = [];
            
            const downloadLinks = $('a.abutton.is-success.is-fullwidth.btn-premium');

            if (downloadLinks.length === 0) {
                 throw new Error("Tidak ada link unduhan. Postingan mungkin privat atau API berubah.");
            }

            downloadLinks.each((i, element) => {
                const href = $(element).attr('href');
                if (href) {
                    result.push(href);
                }
            });

            resolve(result);

        } catch (e) {
            const errorMessage = e.response ? e.response.data : e.message;
            reject(new Error(`Gagal scraping: ${errorMessage}`));
        }
    });
}

/**
 * Helper untuk cek apakah URL adalah video atau gambar
 * Menggunakan HEAD request agar ringan (tidak download file utuh)
 */
async function getContentType(url) {
    try {
        const response = await axios.head(url);
        const contentType = response.headers['content-type'];
        return contentType.includes('video') ? 'video' : 'image';
    } catch (e) {
        return 'image'; // Default fallback
    }
}

/**
 * Fungsi Membuat Carousel Instagram
 */
async function createInstagramCarousel(bot, m, mediaUrls) {
    console.log(`Membuat carousel untuk ${mediaUrls.length} media IG...`);
    
    // Batasi maksimal 10 kartu sesuai limit WA
    const maxCards = Math.min(mediaUrls.length, 10);
    const cards = [];
    
    for (let i = 0; i < maxCards; i++) {
        const url = mediaUrls[i];
        
        // Cek tipe konten (Video/Image)
        const type = await getContentType(url); 
        console.log(`Processing media ${i + 1}/${maxCards} (${type})...`);
        
        try {
            let media;
            let buttons = [];
            let bodyText = "";

            if (type === 'video') {
                // KARTU VIDEO: Gunakan thumbnail statis + Tombol Download
                media = await prepareWAMessageMedia(
                    { 
                        image: { url: "https://files.catbox.moe/kz0ier.jpeg" }, // Thumbnail placeholder
                        mimetype: 'image/jpeg'
                    }, 
                    { upload: bot.waUploadToServer }
                );
                
                bodyText = `🎥 Video Instagram (${i + 1}/${maxCards})`;
                
                buttons = [{
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                        display_text: "📥 Download Video",
                        url: url,
                        merchant_url: url
                    })
                }];
                
            } else {
                // KARTU GAMBAR: Tampilkan gambar + Tombol Lihat
                media = await prepareWAMessageMedia(
                    { 
                        image: { url: url },
                        mimetype: 'image/jpeg'
                    }, 
                    { upload: bot.waUploadToServer }
                );
                
                bodyText = `🖼 Gambar Instagram (${i + 1}/${maxCards})`;
                
                buttons = [{
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                        display_text: "🖼 Lihat Gambar Penuh",
                        url: url,
                        merchant_url: url
                    })
                }];
            }

            cards.push({
                header: {
                    hasMediaAttachment: true,
                    ...media
                },
                body: {
                    text: bodyText
                },
                footer: {
                    text: `Instagram Downloader`
                },
                nativeFlowMessage: {
                    buttons: buttons
                }
            });
            
        } catch (error) {
            console.error(`Gagal prepare media IG ${i + 1}:`, error.message);
        }
    }
    
    // WRAPPER: viewOnceMessage (PENTING AGAR MUNCUL DI HP)
    const msg = generateWAMessageFromContent(m.chat, {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    body: {
                        text: `📸 *Instagram Carousel*\n📦 Total: ${mediaUrls.length} Media\n\nGeser kartu untuk melihat atau mengunduh.`
                    },
                    footer: {
                        text: `IG Downloader • ${new Date().toLocaleDateString('id-ID')}`
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
  name: "ig",
  description: "Unduh media dari Instagram (Carousel Supported).",
  execute: async (m, { args, bot, usedPrefix }) => {
    const url = args[0];
    if (!url || !url.includes("instagram.com")) {
      return m.reply(`❌ Masukkan URL Instagram yang valid.\nContoh: ${usedPrefix}ig https://www.instagram.com/p/Example/`);
    }

    await m.react("⏳");

    try {
      const mediaUrls = await instagramDl(url);
      
      if (!mediaUrls || mediaUrls.length === 0) {
          throw new Error("Gagal mengekstrak media.");
      }

      // Jika lebih dari 1 media, gunakan Carousel
      if (mediaUrls.length > 1) {
          try {
              const carouselMsg = await createInstagramCarousel(bot, m, mediaUrls);
              await bot.relayMessage(m.from, carouselMsg.message, { messageId: carouselMsg.key.id });
              await m.react("✅");
          } catch (carouselErr) {
              console.error("Gagal kirim carousel IG:", carouselErr);
              await m.reply("⚠️ Gagal membuat carousel, mengirim manual...");
              // Fallback ke pengiriman manual jika carousel gagal
              await sendManual(bot, m, mediaUrls);
          }
      } else {
          // Jika hanya 1 media, kirim langsung (lebih cepat & simpel)
          await sendManual(bot, m, mediaUrls);
      }

    } catch (err) {
      console.error("IG Downloader Error:", err);
      await m.react("❌");
      return m.reply(`❌ Gagal: ${err.message}`);
    }
  },
};

/**
 * Fungsi Fallback / Manual Send (Untuk 1 file atau jika carousel gagal)
 */
async function sendManual(bot, m, mediaUrls) {
    for (const [index, mediaUrl] of mediaUrls.entries()) {
        const caption = `✅ Media ${index + 1}/${mediaUrls.length}`;
        try {
            // Cek tipe konten
            const type = await getContentType(mediaUrl);
            
            if (type === 'video') {
                 await bot.sendMessage(m.from, { video: { url: mediaUrl }, caption }, { quoted: m });
            } else {
                 await bot.sendMessage(m.from, { image: { url: mediaUrl }, caption }, { quoted: m });
            }
            
            // Delay kecil agar tidak spamming error
            if (index < mediaUrls.length - 1) await new Promise(r => setTimeout(r, 1000));
          
        } catch (sendError) {
            console.error(`Gagal kirim manual IG ${index}:`, sendError.message);
            await m.reply(`⚠️ Gagal mengirim media ke-${index+1} (Link mungkin expired).`);
        }
    }
    await m.react("✅");
}