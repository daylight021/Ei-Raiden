const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require("fs/promises");
const path = require("path");

module.exports = {
  name: "toimage",
  description: "Mengubah stiker WhatsApp menjadi gambar.",
  execute: async (msg, { bot }) => {
    let targetMsg = msg.quoted ? msg.quoted : msg;

    if (!targetMsg.type || !["stickerMessage"].includes(targetMsg.type)) {
      return msg.reply("Balas pesan stiker untuk mengubahnya menjadi gambar.");
    }

    try {
      msg.react("⏳");

      // Cek apakah stiker animasi
      const isAnimated = targetMsg.message?.stickerMessage?.isAnimated;
      if (isAnimated) {
        msg.react("⚠️");
        return msg.reply("Stiker animasi tidak didukung untuk konversi ke gambar.");
      }

      // Tambahkan error handling yang lebih detail
      let buffer;
      try {
        buffer = await downloadMediaMessage(
          targetMsg,
          "buffer",
          {},
          { 
            reuploadRequest: bot.updateMediaMessage,
            logger: console // Debug logging
          }
        );
      } catch (downloadError) {
        console.error("Download error details:", {
          error: downloadError.message,
          code: downloadError.code,
          mediaKey: targetMsg.message?.stickerMessage?.mediaKey?.length || 'missing',
          fileEncSha256: targetMsg.message?.stickerMessage?.fileEncSha256?.length || 'missing'
        });
        
        // Coba alternatif: ambil dari quoted message jika ada
        if (msg.quoted && msg.quoted !== targetMsg) {
          try {
            buffer = await downloadMediaMessage(
              msg.quoted,
              "buffer",
              {},
              { reuploadRequest: bot.updateMediaMessage }
            );
          } catch (retryError) {
            throw downloadError; // Throw error original
          }
        } else {
          throw downloadError;
        }
      }

      if (!buffer) {
        msg.react("⚠️");
        return msg.reply("Gagal mengunduh stiker. Coba forward ulang stiker tersebut.");
      }

      const filename = `sticker_${Date.now()}.png`;
      const filepath = path.join("/tmp", filename);

      await fs.writeFile(filepath, buffer);

      msg.react("✅");
      await bot.sendMessage(msg.from, {
        image: { url: filepath },
        caption: "gweh thevoid kerasin!",
      });

      await fs.unlink(filepath);
    } catch (error) {
      console.error("Error details:", error);
      msg.react("⚠️");
      
      // Berikan feedback yang lebih spesifik
      if (error.code === 'ERR_OSSL_BAD_DECRYPT') {
        return msg.reply(
          "⚠️ Stiker ini tidak dapat diproses karena ada masalah dengan enkripsi media.\n\n" +
          "Solusi:\n" +
          "• Coba minta pengirim untuk kirim ulang stiker\n" +
          "• Atau screenshot stiker lalu kirim sebagai gambar"
        );
      }
      
      return msg.reply("Terjadi kesalahan saat memproses stiker.");
    }
  },
};