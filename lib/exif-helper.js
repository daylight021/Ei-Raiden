const fs = require('fs');
const path = require('path');

// Try to load node-webpmux for EXIF handling
let webpmux;
try {
  webpmux = require('node-webpmux');
} catch (e) {
  console.warn('node-webpmux not available, EXIF functionality will be limited');
}

/**
 * Menambahkan EXIF metadata ke WebP sticker menggunakan node-webpmux
 * Ini adalah cara yang benar dan kompatibel dengan WhatsApp
 */
async function addExif(webpBuffer, options = {}) {
  const { pack = "xyzbot", author = "xyzuniverse" } = options;

  if (!webpmux) {
    console.warn('node-webpmux not available, returning buffer without EXIF');
    return webpBuffer;
  }

  try {
    // Validasi WebP format
    if (!webpBuffer.slice(0, 4).equals(Buffer.from('RIFF')) ||
        !webpBuffer.slice(8, 12).equals(Buffer.from('WEBP'))) {
      console.warn('Invalid WebP format, returning as-is');
      return webpBuffer;
    }

    // Buat temporary directory
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = Date.now();
    const inputPath = path.join(tempDir, `sticker_${timestamp}.webp`);
    const outputPath = path.join(tempDir, `sticker_with_exif_${timestamp}.webp`);

    // Tulis WebP buffer ke file
    fs.writeFileSync(inputPath, webpBuffer);

    // Buat EXIF data dengan format yang benar untuk WhatsApp stickers
    const exifData = {
      "sticker-pack-id": "com.xyzbot.wasticker",
      "sticker-pack-name": pack,
      "sticker-pack-publisher": author,
    };

    const exifJson = JSON.stringify(exifData);

    // Gunakan node-webpmux untuk menambahkan EXIF
    const sticker = new webpmux.Image();
    await sticker.load(inputPath);

    // Set EXIF data
    sticker.exif = exifJson;

    // Simpan dengan EXIF menggunakan Promise wrapper
    await new Promise((resolve, reject) => {
      sticker.save(outputPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (fs.existsSync(outputPath)) {
      const result = fs.readFileSync(outputPath);

      // Cleanup
      [inputPath, outputPath].forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      });

      console.log('✅ EXIF added using node-webpmux');
      return result;
    }

    // Cleanup jika gagal
    [inputPath, outputPath].forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });

    console.warn('Failed to add EXIF, returning original buffer');
    return webpBuffer;

  } catch (error) {
    console.error('Error adding EXIF:', error);
    return webpBuffer; // Return original buffer on error
  }
}

/**
 * Fallback sederhana tanpa EXIF
 */
async function addExifSimple(webpBuffer, options = {}) {
  console.log('Using simple method: WebP without EXIF metadata');
  return webpBuffer;
}

module.exports = {
  addExif,
  addExifSimple
};
