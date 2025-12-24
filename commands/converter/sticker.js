const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { createSticker } = require("../../lib/sticker-helper");

module.exports = {
  name: "sticker",
  alias: ["s"],
  description: "Ubah gambar/video/dokumen menjadi stiker. Mendukung format: JPG, PNG, GIF, WebP, MP4, WebM, MOV, AVI, MKV",
  execute: async (msg, { bot }) => {

    let targetMsg = msg.quoted || msg;

    const validTypes = ['imageMessage', 'videoMessage', 'documentMessage'];
    if (!validTypes.includes(targetMsg.type)) {
      return msg.reply("❌ Kirim atau reply media yang valid dengan caption `.s`.\n\n📋 Format yang didukung:\n• Gambar: JPG, PNG, GIF, WebP\n• Video: MP4, WebM, MOV, AVI, MKV\n\n• Durasi video maksimal: 10 detik");
    }

    // Enhanced document validation
    if (targetMsg.type === 'documentMessage') {
      const mimetype = targetMsg.msg?.mimetype || '';
      const fileName = targetMsg.msg?.fileName || '';

      console.log(`Document mimetype: ${mimetype}, fileName: ${fileName}`);

      const supportedMimes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
        'application/json'
      ];

      const supportedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov', '.avi', '.mkv'];

      const hasValidMime = supportedMimes.some(mime => mimetype.includes(mime));
      const hasValidExt = supportedExts.some(ext => fileName.toLowerCase().includes(ext));

      if (!hasValidMime && !hasValidExt) {
        return msg.reply("❌ Dokumen yang dikirim bukan media yang didukung.\n\n📋 Format yang didukung:\n• Gambar: JPG, PNG, GIF, WebP\n• Video: MP4, WebM, MOV, AVI, MKV");
      }

      // Check file size for documents
      const fileSize = targetMsg.msg?.fileLength || 0;
      if (fileSize > 15 * 1024 * 1024) { // 15MB limit
        return msg.reply("❌ Ukuran file terlalu besar. Maksimal 15MB.\n\n💡 Tips:\n• Kompres file terlebih dahulu\n• Gunakan resolusi yang lebih kecil");
      }
    }

    await msg.react("⏳");

    try {
      console.log("Starting sticker creation process...");
      console.log(`Message type: ${targetMsg.type}`);

      const messageToDownload = targetMsg.isViewOnce ? targetMsg.raw : targetMsg;
      console.log("Downloading media message...");

      const buffer = await downloadMediaMessage(
        messageToDownload,
        "buffer",
        {},
        { reuploadRequest: bot.updateMediaMessage }
      );

      console.log(`Downloaded buffer size: ${buffer.length} bytes`);

      // Validate buffer
      if (!buffer || buffer.length === 0) {
        throw new Error("Downloaded buffer is empty or invalid");
      }

      // Check buffer size
      if (buffer.length > 15 * 1024 * 1024) { // 15MB
        throw new Error("File size too large");
      }

      const stickerOptions = {
        pack: process.env.stickerPackname || "Bot Stiker",
        author: process.env.stickerAuthor || "Dibuat oleh Bot",
        mimetype: targetMsg.msg?.mimetype || '',
        fileName: targetMsg.msg?.fileName || ''
      };

      console.log("Processing media and creating sticker...");
      const sticker = await createSticker(buffer, stickerOptions);

      console.log("Converting sticker to message format...");
      console.log(`Sticker type: ${typeof sticker}`);
      console.log(`Sticker has toMessage: ${typeof sticker.toMessage}`);
      console.log(`Sticker has isDirectBuffer: ${sticker.isDirectBuffer}`);

      const stickerMessage = await sticker.toMessage();

      console.log(`Sticker message keys: ${Object.keys(stickerMessage).join(', ')}`);

      // DEBUG: Cek ukuran sticker message
      if (stickerMessage.sticker) {
        console.log(`Final sticker message buffer size: ${stickerMessage.sticker.length} bytes`);

        // Validasi header WebP
        const header = stickerMessage.sticker.slice(0, 12);
        console.log(`Sticker header: ${header.toString('hex')}`);
        const isValidWebP = header.slice(0, 4).equals(Buffer.from('RIFF')) &&
          header.slice(8, 12).equals(Buffer.from('WEBP'));
        console.log(`Is valid WebP: ${isValidWebP}`);

        if (!isValidWebP) {
          console.error('❌ Invalid WebP format in sticker message!');
          await msg.react("⚠️");
          return msg.reply(`❌ Format stiker tidak valid. Terjadi kesalahan saat memproses.`);
        }

        if (stickerMessage.sticker.length > 1000 * 1024) {
          console.error(`❌ CRITICAL: Sticker message is too large! ${stickerMessage.sticker.length} bytes`);
          await msg.react("⚠️");
          return msg.reply(`❌ Gagal membuat stiker. File hasil terlalu besar (${Math.round(stickerMessage.sticker.length / 1024)}KB).\n\n💡 Tips:\n• Gunakan GIF/video yang lebih pendek\n• Gunakan resolusi yang lebih kecil\n• Kurangi jumlah frame`);
        }
      } else {
        console.error('❌ No sticker buffer in message!');
        await msg.react("⚠️");
        return msg.reply('❌ Gagal membuat stiker. Tidak ada data stiker yang dihasilkan.');
      }

      console.log("Sending sticker...");

      // DEBUG: Save sticker to file for inspection
      if (process.env.DEBUG_STICKER === 'true') {
        const fs = require('fs');
        const debugPath = `/tmp/debug_sticker_${Date.now()}.webp`;
        fs.writeFileSync(debugPath, stickerMessage.sticker);
        console.log(`Debug: Sticker saved to ${debugPath}`);
      }

      await bot.sendMessage(msg.from, stickerMessage, {
        quoted: msg,
      });
      await msg.react("✅");

      console.log("Sticker sent successfully!");

    } catch (err) {
      console.error("Kesalahan saat konversi stiker:", err);
      await msg.react("⚠️");

      // Enhanced error handling
      if (err.message.includes('Invalid data found when processing input') ||
        err.message.includes('Error while decoding stream') ||
        err.message.includes('Cannot determine format')) {
        return msg.reply("❌ Gagal memproses file. File mungkin rusak atau format tidak didukung.\n\n💡 Tips:\n• Pastikan file tidak corrupt\n• Coba convert ke format standar terlebih dahulu\n• Kirim ulang file dengan kualitas lebih rendah");
      }

      if (err.message.includes('Downloaded buffer is empty')) {
        return msg.reply("❌ Gagal mendownload media. Coba kirim ulang file tersebut.");
      }

      if (err.message.includes('File size too large') || err.message.includes('exceeds limit')) {
        return msg.reply("❌ Ukuran file terlalu besar setelah diproses.\n\n💡 Tips:\n• Gunakan GIF/video yang lebih pendek (maks 5 detik)\n• Kompres file terlebih dahulu\n• Gunakan resolusi yang lebih kecil\n• Kurangi jumlah frame/FPS");
      }

      if (err.message.includes('Image conversion failed') || err.message.includes('Unsupported media type')) {
        return msg.reply("❌ Format file tidak didukung atau file corrupt.\n\n💡 Tips:\n• Pastikan file tidak rusak\n• Gunakan format yang didukung: JPG, PNG, GIF, WebP, MP4");
      }

      if (err.message.includes('size limits') || err.message.includes('Could not compress sticker')) {
        return msg.reply("❌ Gagal membuat stiker dalam batas ukuran yang diizinkan.\n\n💡 Tips:\n• Gunakan video yang lebih pendek (maks 5 detik)\n• Kompres video terlebih dahulu\n• Gunakan resolusi yang lebih kecil");
      }

      if (err.message.includes('Invalid duration')) {
        return msg.reply("❌ Durasi video tidak valid atau file corrupt.\n\n💡 Pastikan file video tidak rusak.");
      }

      if (err.message.includes('timeout')) {
        return msg.reply("❌ Proses konversi timeout. File mungkin terlalu besar atau kompleks.\n\n💡 Tips:\n• Coba dengan file yang lebih kecil\n• Kompres video terlebih dahulu");
      }

      return msg.reply("❌ Gagal membuat stiker. Pastikan media yang dikirim valid.\n\n📋 Format yang didukung:\n• Gambar: JPG, PNG, GIF, WebP\n• Video: MP4, WebM, MOV, AVI, MKV (maks 10 detik) \n\n💡 Tips:\n• Ukuran file maksimal 15MB\n• Untuk video, durasi maksimal 10 detik\n• Pastikan file tidak corrupt");
    }
  },
};