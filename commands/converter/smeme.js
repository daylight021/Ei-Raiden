const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { createCanvas, loadImage } = require("canvas");
const sharp = require("sharp");

module.exports = {
  name: "smeme",
  alias: ["stickermeme", "meme"],
  description: "Buat sticker meme dengan teks atas dan bawah dari gambar/sticker",
  usage: ".smeme <teks_atas>|<teks_bawah>",
  example: ".smeme SAAT KAMU|NGODING TENGAH MALAM",
  
  execute: async (msg, { bot, args }) => {
    
    // Validasi: Harus reply media
    if (!msg.quoted) {
      return msg.reply(
        "Reply gambar/sticker dengan caption:\n" +
        "`.smeme teks_atas|teks_bawah`\n\n" +
        "Contoh:\n" +
        "`.smeme SAAT KAMU|NGODING TENGAH MALAM`\n" +
        "`.smeme WHEN YOU REALIZE|`\n" +
        "`.smeme |IT'S MONDAY`\n\n" +
        "Tips:\n" +
        "- Gunakan | (pipe) untuk memisahkan teks\n" +
        "- Kosongkan salah satu jika hanya ingin teks atas/bawah saja"
      );
    }

    let targetMsg = msg.quoted;

    // Validasi: Harus gambar atau sticker
    const validTypes = ['imageMessage', 'stickerMessage'];
    if (!validTypes.includes(targetMsg.type)) {
      return msg.reply(
        "Media yang di-reply harus berupa gambar atau sticker!\n\n" +
        "Format yang didukung:\n" +
        "- Gambar: JPG, PNG, WebP\n" +
        "- Sticker (akan dikonversi ke meme)"
      );
    }

    // Validasi: Harus ada teks
    const text = args.join(" ");
    if (!text) {
      return msg.reply(
        "Masukkan teks untuk meme!\n\n" +
        "Format:\n" +
        "`.smeme teks_atas|teks_bawah`\n\n" +
        "Contoh:\n" +
        "`.smeme WHEN YOU|REALIZE IT'S MONDAY`\n" +
        "`.smeme TEKS ATAS SAJA|`\n" +
        "`.smeme |TEKS BAWAH SAJA`"
      );
    }

    // Parsing teks
    let topText = "";
    let bottomText = "";

    if (text.includes("|")) {
      const textParts = text.split("|");
      topText = textParts[0] ? textParts[0].trim().toUpperCase() : "";
      bottomText = textParts[1] ? textParts[1].trim().toUpperCase() : "";
    } else {
      // Jika tidak ada pipe, anggap sebagai teks atas
      topText = text.trim().toUpperCase();
      bottomText = "";
    }

    // Validasi: Minimal ada satu teks
    if (!topText && !bottomText) {
      return msg.reply(
        "Minimal harus ada satu teks (atas atau bawah)!\n\n" +
        "Contoh:\n" +
        "`.smeme TEKS ATAS|TEKS BAWAH`\n" +
        "`.smeme HANYA ATAS|`\n" +
        "`.smeme |HANYA BAWAH`"
      );
    }

    await msg.react("⏳");

    try {
      console.log("Starting smeme creation process...");
      console.log(`Top text: "${topText}"`);
      console.log(`Bottom text: "${bottomText}"`);
      console.log(`Message type: ${targetMsg.type}`);

      // Download media
      console.log("Downloading media message...");
      const buffer = await downloadMediaMessage(
        targetMsg,
        "buffer",
        {},
        { reuploadRequest: bot.updateMediaMessage }
      );

      console.log(`Downloaded buffer size: ${buffer.length} bytes`);

      // Validasi buffer
      if (!buffer || buffer.length === 0) {
        throw new Error("Downloaded buffer is empty or invalid");
      }

      // Konversi ke JPEG dengan ukuran asli untuk mempertahankan rasio
      console.log("Processing image...");
      let processedImage = await sharp(buffer)
        .jpeg({ quality: 90 })
        .toBuffer();

      console.log(`Processed image size: ${processedImage.length} bytes`);

      // Buat meme menggunakan canvas
      console.log("Creating meme with canvas...");
      const memeBuffer = await createMemeImage(processedImage, topText, bottomText);
      
      console.log(`Meme buffer size: ${memeBuffer.length} bytes`);

      // Konversi meme ke sticker
      console.log("Converting meme to sticker...");
      const { createSticker } = require("../../lib/sticker-helper");
      
      const stickerOptions = {
        pack: process.env.stickerPackname || "Meme Sticker",
        author: process.env.stickerAuthor || "Dibuat oleh Bot",
        mimetype: "image/jpeg"
      };

      const sticker = await createSticker(memeBuffer, stickerOptions);
      const stickerMessage = await sticker.toMessage();

      // Validasi sticker message
      if (!stickerMessage.sticker || stickerMessage.sticker.length === 0) {
        throw new Error("Failed to create sticker from meme");
      }

      console.log(`Final sticker size: ${stickerMessage.sticker.length} bytes`);

      // Check ukuran final sticker
      if (stickerMessage.sticker.length > 1000 * 1024) {
        throw new Error("Generated sticker is too large");
      }

      // Kirim sticker
      console.log("Sending meme sticker...");
      await bot.sendMessage(msg.from, stickerMessage, {
        quoted: msg,
      });
      
      await msg.react("✅");
      console.log("Meme sticker sent successfully!");

    } catch (err) {
      console.error("Error saat membuat meme sticker:", err);
      await msg.react("⚠️");

      // Enhanced error handling
      if (err.message.includes("Downloaded buffer is empty")) {
        return msg.reply(
          "Gagal mendownload media. Coba kirim ulang gambar tersebut."
        );
      }

      if (err.message.includes("Input buffer")) {
        return msg.reply(
          "Gagal memproses gambar. Format file mungkin tidak didukung atau corrupt.\n\n" +
          "Tips:\n" +
          "- Kirim ulang gambar dengan format JPG atau PNG\n" +
          "- Pastikan file tidak rusak"
        );
      }

      if (err.message.includes("timeout")) {
        return msg.reply(
          "Proses timeout. Server terlalu lama merespon.\n\n" +
          "Tips:\n" +
          "- Coba dengan gambar yang lebih kecil\n" +
          "- Coba beberapa saat lagi"
        );
      }

      if (err.message.includes("sticker is too large")) {
        return msg.reply(
          "Hasil sticker terlalu besar (max 1MB).\n\n" +
          "Tips:\n" +
          "- Gunakan gambar dengan resolusi lebih kecil\n" +
          "- Kompres gambar terlebih dahulu"
        );
      }

      // Generic error
      return msg.reply(
        "Gagal membuat meme sticker.\n\n" +
        "Pastikan:\n" +
        "- Gambar tidak corrupt\n" +
        "- Format: JPG, PNG, WebP\n" +
        "- Ukuran max 10MB\n" +
        "- Teks menggunakan format: `teks_atas|teks_bawah`\n\n" +
        `Error: ${err.message}`
      );
    }
  },
};

/**
 * Buat meme image dengan canvas
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} topText - Teks atas
 * @param {string} bottomText - Teks bawah
 * @returns {Promise<Buffer>} - Meme image buffer
 */
async function createMemeImage(imageBuffer, topText, bottomText) {
  try {
    // Load gambar
    const image = await loadImage(imageBuffer);
    
    const width = image.width;
    const height = image.height;
    
    // Buat canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Gambar image ke canvas
    ctx.drawImage(image, 0, 0, width, height);
    
    const centerX = width / 2;
    const padding = 10;
    const maxWidth = width - (padding * 2);
    
    // Gambar teks atas jika ada
    if (topText) {
      drawMemeText(ctx, topText, centerX, padding, maxWidth, width, 'top');
    }
    
    // Gambar teks bawah jika ada
    if (bottomText) {
      drawMemeText(ctx, bottomText, centerX, height - padding, maxWidth, width, 'bottom');
    }
    
    // Convert canvas ke buffer
    return canvas.toBuffer('image/jpeg', { quality: 0.9 });
    
  } catch (error) {
    console.error("Error creating meme image:", error);
    throw new Error("Failed to create meme: " + error.message);
  }
}

/**
 * Gambar teks meme dengan ukuran font dinamis
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Text to draw
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} maxWidth - Maximum width
 * @param {number} canvasWidth - Canvas width
 * @param {string} position - 'top' or 'bottom'
 */
function drawMemeText(ctx, text, x, y, maxWidth, canvasWidth, position) {
  // Hitung ukuran font berdasarkan panjang teks dan lebar canvas
  let baseFontSize = Math.floor(canvasWidth / 10); // Ukuran font dasar (10% dari lebar)
  const minFontSize = Math.floor(canvasWidth / 20); // Ukuran minimum (5% dari lebar)
  const maxFontSize = Math.floor(canvasWidth / 8);  // Ukuran maksimum (12.5% dari lebar)
  
  // Faktor pengurangan berdasarkan panjang teks
  const textLength = text.length;
  let fontSize = baseFontSize;
  
  if (textLength > 30) {
    fontSize = Math.floor(baseFontSize * 0.6); // Teks sangat panjang: 60% dari ukuran dasar
  } else if (textLength > 20) {
    fontSize = Math.floor(baseFontSize * 0.75); // Teks panjang: 75% dari ukuran dasar
  } else if (textLength > 15) {
    fontSize = Math.floor(baseFontSize * 0.85); // Teks agak panjang: 85% dari ukuran dasar
  }
  
  // Clamp fontSize antara min dan max
  fontSize = Math.max(minFontSize, Math.min(maxFontSize, fontSize));
  
  console.log(`Text: "${text}" | Length: ${textLength} | Font size: ${fontSize}`);
  
  // Set font
  ctx.font = `bold ${fontSize}px Impact, Arial Black, sans-serif`;
  ctx.textAlign = 'center';
  
  // Wrap text
  const lines = wrapText(ctx, text, maxWidth);
  
  // Hitung total height dari semua lines
  const lineHeight = fontSize * 1.2;
  const totalHeight = lines.length * lineHeight;
  
  // Hitung starting Y position
  let startY;
  if (position === 'top') {
    ctx.textBaseline = 'top';
    startY = y;
  } else {
    ctx.textBaseline = 'bottom';
    // Untuk bottom text, mulai dari bawah dikurangi total height
    startY = y - (totalHeight - lineHeight);
  }
  
  // Gambar setiap line
  lines.forEach((line, index) => {
    const yPos = startY + (index * lineHeight);
    
    // Stroke (outline hitam tebal)
    ctx.strokeStyle = 'black';
    ctx.lineWidth = Math.floor(fontSize / 8);
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    
    // Gambar outline multiple kali untuk efek lebih tebal
    for (let i = 0; i < 3; i++) {
      ctx.strokeText(line, x, yPos);
    }
    
    // Fill (teks putih)
    ctx.fillStyle = 'white';
    ctx.fillText(line, x, yPos);
  });
}

/**
 * Wrap text agar tidak melebihi maxWidth
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Text to wrap
 * @param {number} maxWidth - Maximum width
 * @returns {string[]} - Array of lines
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine + " " + word;
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    
    if (testWidth > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);
  
  return lines;
}