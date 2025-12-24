// Import library Baileys yang diperlukan
const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require("@whiskeysockets/baileys");

module.exports = {
  name: "carousel",
  description: "Mengirim pesan carousel dengan beberapa cards ke chat",
  owner: true,
  execute: async (m, { args, bot, usedPrefix }) => {
    // 1. Reaksi proses
    await m.react("🔄");

    // DATA KARTU YANG INGIN DIKIRIM
    // Kita buat array object biar rapi
    const cardsData = [
      {
        image: "https://files.catbox.moe/mkna0l.jpeg",
        title: "PROMO TERAKHIR",
        body: "Diskon 50% untuk semua produk",
        footer: "Berlaku hingga 31 Desember",
        url: "Hyacine", // Isi kode copy disini
        btnText: "📋 Salin Kode 1"
      },
      {
        image: "https://files.catbox.moe/kz0ier.jpeg",
        title: "NEW USER BONUS",
        body: "Dapatkan bonus 100K untuk pengguna baru",
        footer: "Minimal pembelian 500K",
        url: "Evernight",
        btnText: "📋 Salin Kode 2"
      },
      {
        image: "https://files.catbox.moe/rveiuy.jpeg", // Ganti gambar jika perlu
        title: "FLASH SALE",
        body: "Harga spesial untuk produk terpilih",
        footer: "Terbatas hanya 100 item",
        url: "Changli",
        btnText: "📋 Salin Kode 3"
      },
      {
        image: "https://files.catbox.moe/xmchp8.jpg",
        title: "PROMO TERAKHIR",
        body: "Diskon 50% untuk semua produk",
        footer: "Berlaku hingga 31 Desember",
        url: "Cartethyia", // Isi kode copy disini
        btnText: "📋 Salin Kode 4"
      },
      {
        image: "https://files.catbox.moe/0hr3hq.jpeg",
        title: "PROMO TERAKHIR",
        body: "Diskon 50% untuk semua produk",
        footer: "Berlaku hingga 31 Desember",
        url: "Lingsha", // Isi kode copy disini
        btnText: "📋 Salin Kode 5"
      },
      {
        image: "https://files.catbox.moe/5zmkr9.jpeg",
        title: "PROMO TERAKHIR",
        body: "Diskon 50% untuk semua produk",
        footer: "Berlaku hingga 31 Desember",
        url: "Kazuzu", // Isi kode copy disini
        btnText: "📋 Salin Kode 6"
      },
      {
        image: "https://files.catbox.moe/1hghbc.jpeg",
        title: "PROMO TERAKHIR",
        body: "Diskon 50% untuk semua produk",
        footer: "Berlaku hingga 31 Desember",
        url: "Nahida", // Isi kode copy disini
        btnText: "📋 Salin Kode 7"
      },
      {
        image: "https://files.catbox.moe/nybwxd.jpeg",
        title: "PROMO TERAKHIR",
        body: "Diskon 50% untuk semua produk",
        footer: "Berlaku hingga 31 Desember",
        url: "Hu Tao", // Isi kode copy disini
        btnText: "📋 Salin Kode 8"
      },
      {
        image: "https://files.catbox.moe/f00zng.jpeg",
        title: "PROMO TERAKHIR",
        body: "Diskon 50% untuk semua produk",
        footer: "Berlaku hingga 31 Desember",
        url: "Rai den", // Isi kode copy disini
        btnText: "📋 Salin Kode 9"
      },
      {
        image: "https://files.catbox.moe/8hcyk1.jpeg",
        title: "PROMO TERAKHIR",
        body: "Diskon 50% untuk semua produk",
        footer: "Berlaku hingga 31 Desember",
        url: "Hertha", // Isi kode copy disini
        btnText: "📋 Salin Kode 10"
      },

    ];

    // 2. PROSES PEMBUATAN KARTU (Mapping)
    // Ini mengubah data simpel di atas menjadi format rumit yang dimengerti WhatsApp
    const cards = await Promise.all(cardsData.map(async (card) => {

      // Siapkan media (gambar)
      const media = await prepareWAMessageMedia({ image: { url: card.image } }, { upload: bot.waUploadToServer });

      return {
        header: {
          hasMediaAttachment: true,
          ...media // Masukkan data gambar yang sudah diproses
        },
        body: {
          text: card.body
        },
        footer: {
          text: card.footer
        },
        nativeFlowMessage: {
          buttons: [
            {
              name: "cta_copy",
              buttonParamsJson: JSON.stringify({
                display_text: card.btnText,
                copy_code: card.url,
                id: card.url
              })
            }
          ]
        }
      };
    }));

    // 3. SUSUN PESAN UTAMA (Interactive Message)
    const msg = generateWAMessageFromContent(m.chat, {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: {
              text: "✨ PROMO SPESIAL HARI INI ✨\n\nSilakan geser kartu di bawah untuk melihat promo!"
            },
            footer: {
              text: "Astarot Project"
            },
            header: {
              hasMediaAttachment: false
            },
            carouselMessage: {
              cards: cards // Masukkan kartu yang sudah dibuat di tahap 2
            }
          }
        }
      }
    }, { quoted: m });

    // 4. KIRIM PESAN (Relay)
    await bot.relayMessage(m.from, msg.message, { messageId: msg.key.id });

    // Reaksi sukses
    await m.react("✅");
  },
};