const fs = require("fs");
const path = require("path");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");
const {
  getMediaFPS,
  hasTransparency,
  handleTransparentGif,
  optimizedConversion,
  fallbackConversion,
  ensureFileSizeLimit,
  applyCompressionStrategy
} = require("./sticker-compressor");

// Try to load exif helper, fallback if not available
let addExif;
try {
  const exifHelper = require("./exif-helper");
  addExif = exifHelper.addExif;
} catch (e) {
  console.warn("exif-helper not found, will use wa-sticker-formatter for all stickers");
  addExif = null;
}

function ensureTempDir() {
  const tempDir = path.join(__dirname, "../temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

function detectMediaType(buffer) {
  if (!buffer || buffer.length === 0) {
    return 'unknown';
  }

  const header = buffer.slice(0, 32);

  // JPEG detection
  if (header[0] === 0xFF && header[1] === 0xD8) return 'jpeg';

  // PNG detection
  if (header.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47]))) return 'png';

  // WebP detection with animation check
  if (buffer.includes(Buffer.from('RIFF')) && buffer.includes(Buffer.from('WEBP'))) {
    if (buffer.includes(Buffer.from('ANIM')) || buffer.includes(Buffer.from('ANMF'))) {
      return 'animated_webp';
    }
    return 'webp';
  }

  // GIF detection
  if (header.slice(0, 6).equals(Buffer.from('GIF87a', 'ascii')) ||
    header.slice(0, 6).equals(Buffer.from('GIF89a', 'ascii'))) {
    return 'gif';
  }

  // MP4 detection
  if (buffer.slice(4, 8).equals(Buffer.from('ftyp', 'ascii'))) return 'video';

  // WebM/MKV detection
  if (header.slice(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'video';

  // AVI detection
  if (header.slice(0, 4).equals(Buffer.from('RIFF', 'ascii')) &&
    header.slice(8, 12).equals(Buffer.from('AVI ', 'ascii'))) return 'video';

  // MOV detection
  if (header.slice(4, 8).equals(Buffer.from('moov', 'ascii')) ||
    header.slice(4, 8).equals(Buffer.from('mdat', 'ascii'))) return 'video';

  return 'unknown';
}

async function validateAndFixBuffer(buffer, mediaType) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Buffer is empty or invalid');
  }

  if (buffer.length > 15 * 1024 * 1024) {
    throw new Error('File size too large (max 15MB)');
  }

  return buffer;
}

async function createSticker(mediaBuffer, options = {}) {
  const tempDir = ensureTempDir();
  const timestamp = Date.now();
  const tempInputPath = path.join(tempDir, `input_${timestamp}`);
  const tempOutputPath = path.join(tempDir, `output_${timestamp}.webp`);

  try {
    const mediaType = detectMediaType(mediaBuffer);
    console.log(`Processing media type: ${mediaType}, size: ${mediaBuffer.length} bytes`);

    if (mediaType === 'unknown') {
      throw new Error('Unsupported media type or corrupted file');
    }

    await validateAndFixBuffer(mediaBuffer, mediaType);

    let processedBuffer;
    const maxSizeBytes = 950 * 1024; // Target maksimal di bawah 1MB

    if (mediaType === 'animated_webp' || mediaType === 'gif' || mediaType === 'video') {
      console.log("Processing as animated media...");

      const inputExtension = mediaType === 'gif' ? '.gif' :
        mediaType === 'animated_webp' ? '.webp' : '.mp4';
      const properInputPath = tempInputPath + inputExtension;

      fs.writeFileSync(properInputPath, mediaBuffer);

      try {
        // Cek apakah ini GIF dengan transparency
        const isTransparentGif = mediaType === 'gif' && hasTransparency(mediaBuffer);

        if (isTransparentGif) {
          console.log("Detected transparent GIF, using special handling...");
          let finalSize = await handleTransparentGif(properInputPath, tempOutputPath);

          if (finalSize > maxSizeBytes) {
            finalSize = await ensureFileSizeLimit(tempOutputPath, maxSizeBytes, true, properInputPath);
          }

          // PENTING: Baca ulang file setelah kompresi
          processedBuffer = fs.readFileSync(tempOutputPath);
          console.log(`✅ Transparent GIF processed successfully: ${processedBuffer.length} bytes`);
        } else {
          // Coba metode optimized dulu
          let finalSize = await optimizedConversion(properInputPath, tempOutputPath, true);

          // Jika masih terlalu besar, kompres lagi
          if (finalSize > maxSizeBytes) {
            finalSize = await ensureFileSizeLimit(tempOutputPath, maxSizeBytes, true, properInputPath);
          }

          // PENTING: Baca ulang file setelah kompresi
          processedBuffer = fs.readFileSync(tempOutputPath);
          console.log(`✅ Animated sticker processed successfully: ${processedBuffer.length} bytes`);
        }

      } catch (error) {
        console.warn(`⚠️ Optimized conversion failed, trying fallback: ${error.message}`);

        try {
          // Untuk GIF transparan yang gagal, coba special handling
          const isTransparentGif = mediaType === 'gif' && hasTransparency(mediaBuffer);

          if (isTransparentGif) {
            console.log("Trying transparent GIF fallback...");
            let finalSize = await handleTransparentGif(properInputPath, tempOutputPath);

            if (finalSize > maxSizeBytes) {
              finalSize = await ensureFileSizeLimit(tempOutputPath, maxSizeBytes, true, properInputPath);
            }

            // PENTING: Baca ulang file setelah kompresi
            processedBuffer = fs.readFileSync(tempOutputPath);
            console.log(`✅ Transparent GIF processed with fallback: ${processedBuffer.length} bytes`);
          } else {
            // Coba metode fallback biasa
            let finalSize = await fallbackConversion(properInputPath, tempOutputPath, true);

            if (finalSize > maxSizeBytes) {
              finalSize = await ensureFileSizeLimit(tempOutputPath, maxSizeBytes, true, properInputPath);
            }

            // PENTING: Baca ulang file setelah kompresi
            processedBuffer = fs.readFileSync(tempOutputPath);
            console.log(`✅ Animated sticker processed with fallback: ${processedBuffer.length} bytes`);
          }

        } catch (fallbackError) {
          console.error("Both conversion methods failed:", fallbackError);

          // Cleanup input file sebelum throw error
          if (fs.existsSync(properInputPath)) {
            fs.unlinkSync(properInputPath);
          }

          throw new Error(`Failed to convert animated media: ${fallbackError.message}`);
        }
      }

      // Jangan hapus input file sampai proses selesai
      // Cleanup ada di finally block

    } else if (mediaType === 'webp' || mediaType === 'jpeg' || mediaType === 'png') {
      console.log("Processing as static image...");

      const inputExtension = mediaType === 'jpeg' ? '.jpg' :
        mediaType === 'png' ? '.png' : '.webp';
      const properInputPath = tempInputPath + inputExtension;

      fs.writeFileSync(properInputPath, mediaBuffer);

      try {
        if (mediaType === 'webp') {
          // Untuk WebP, cek dulu ukuran asli
          const stats = fs.statSync(properInputPath);
          if (stats.size <= maxSizeBytes) {
            console.log(`WebP already small enough (${stats.size} bytes), using as-is`);
            fs.copyFileSync(properInputPath, tempOutputPath);
            processedBuffer = fs.readFileSync(tempOutputPath);
          } else {
            // Perlu dikonversi
            let finalSize = await optimizedConversion(properInputPath, tempOutputPath, false);
            if (finalSize > maxSizeBytes) {
              finalSize = await ensureFileSizeLimit(tempOutputPath, maxSizeBytes, false);
            }
            // Baca ulang setelah kompresi
            processedBuffer = fs.readFileSync(tempOutputPath);
            console.log(`✅ WebP sticker processed: ${processedBuffer.length} bytes`);
          }
        } else {
          // Untuk JPEG/PNG
          let finalSize = await optimizedConversion(properInputPath, tempOutputPath, false);
          if (finalSize > maxSizeBytes) {
            finalSize = await ensureFileSizeLimit(tempOutputPath, maxSizeBytes, false);
          }
          // Baca ulang setelah kompresi
          processedBuffer = fs.readFileSync(tempOutputPath);
          console.log(`✅ Static sticker processed: ${processedBuffer.length} bytes`);
        }

      } catch (error) {
        console.error(`Failed to process ${mediaType}:`, error);
        throw new Error(`Failed to process ${mediaType}: ${error.message}`);
      }

      if (fs.existsSync(properInputPath)) {
        fs.unlinkSync(properInputPath);
      }
    } else {
      throw new Error(`Unsupported media type: ${mediaType}`);
    }

    console.log(`Final processed buffer size: ${processedBuffer.length} bytes`);

    // VALIDASI KRITIS: Pastikan file yang akan dikirim benar-benar sesuai
    const finalFileStats = fs.statSync(tempOutputPath);
    console.log(`Final output file on disk: ${finalFileStats.size} bytes`);

    if (finalFileStats.size !== processedBuffer.length) {
      console.error(`❌ MISMATCH: File size (${finalFileStats.size}) != Buffer size (${processedBuffer.length})`);
      // Baca ulang file untuk memastikan
      processedBuffer = fs.readFileSync(tempOutputPath);
      console.log(`Re-read buffer size: ${processedBuffer.length} bytes`);
    }

    // Validasi ukuran buffer sebelum membuat sticker
    if (processedBuffer.length > maxSizeBytes) {
      console.error(`❌ ERROR: Buffer size (${processedBuffer.length} bytes) is still too large after compression!`);
      throw new Error(`File size ${processedBuffer.length} bytes exceeds limit after all compression attempts`);
    }

    // Untuk file yang sedikit lebih besar dari 1MB tapi tidak terlalu besar
    if (processedBuffer.length > 1000 * 1024 && processedBuffer.length < 1200 * 1024) {
      console.log(`📱 File size (${processedBuffer.length} bytes) might work on WhatsApp mobile, trying anyway...`);
    } else if (processedBuffer.length > 1200 * 1024) {
      console.warn(`⚠️ Warning: Final size (${processedBuffer.length} bytes) is too large for WhatsApp mobile`);
    } else {
      console.log(`✅ File size OK for WhatsApp mobile: ${processedBuffer.length} bytes`);
    }

    // Untuk animated media, skip wa-sticker-formatter dan return buffer langsung
    if (mediaType === 'animated_webp' || mediaType === 'gif' || mediaType === 'video') {
      console.log("Skipping wa-sticker-formatter for animated media, returning processed WebP directly...");

      // Return custom object dengan interface yang sama seperti Sticker
      return {
        toMessage: async () => {
          return {
            sticker: processedBuffer
          };
        },
        isDirectBuffer: true
      };
    }

    // Untuk static images, gunakan wa-sticker-formatter
    console.log("Using wa-sticker-formatter library for static images...");

    // Untuk file yang sudah dioptimalkan, gunakan konfigurasi khusus
    const stickerConfig = {
      pack: options.pack || "xyzbot",
      author: options.author || "xyzuniverse",
      type: StickerTypes.FULL,
      // Tambahkan EXIF metadata langsung di wa-sticker-formatter
      metadata: {
        "sticker-pack-id": "com.xyzbot.wasticker",
        "sticker-pack-name": options.pack || "xyzbot",
        "sticker-pack-publisher": options.author || "xyzuniverse"
      }
    };

    // Jika file sudah dalam format WebP yang baik, jangan set quality
    // Biarkan library menggunakan file as-is
    if (mediaType === 'webp' || mediaType === 'animated_webp') {
      console.log('WebP input detected, skipping quality setting to preserve original');
      // Tidak set quality agar tidak diproses ulang
    } else {
      stickerConfig.quality = 100;
    }

    const sticker = new Sticker(processedBuffer, stickerConfig);

    return sticker;

  } catch (error) {
    console.error("Error in createSticker:", error);
    throw error;
  } finally {
    // Cleanup semua file temporary dengan delay kecil untuk memastikan FFmpeg sudah selesai
    await new Promise(resolve => setTimeout(resolve, 100));

    const filesToClean = [
      tempInputPath,
      tempInputPath + '.gif',
      tempInputPath + '.webp',
      tempInputPath + '.jpg',
      tempInputPath + '.png',
      tempInputPath + '.mp4',
      tempOutputPath,
      tempOutputPath.replace('.webp', '_compressed.webp')
    ];

    try {
      const tempFiles = fs.readdirSync(tempDir).filter(f =>
        f.includes(timestamp.toString())
      );
      tempFiles.forEach(f => filesToClean.push(path.join(tempDir, f)));
    } catch (e) { /* ignore */ }

    // Cleanup juga folders frames jika ada
    try {
      const frameFolders = fs.readdirSync(tempDir).filter(f =>
        f.startsWith('frames_') && f.includes(timestamp.toString().slice(0, -3))
      );
      frameFolders.forEach(folder => {
        const folderPath = path.join(tempDir, folder);
        try {
          const files = fs.readdirSync(folderPath);
          files.forEach(file => {
            fs.unlinkSync(path.join(folderPath, file));
          });
          fs.rmdirSync(folderPath);
          console.log(`Cleaned up frames folder: ${folder}`);
        } catch (e) {
          console.warn(`Could not clean frames folder ${folder}:`, e.message);
        }
      });
    } catch (e) { /* ignore */ }

    filesToClean.forEach(file => {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
          console.log(`Cleaned up temp file: ${path.basename(file)}`);
        } catch (err) {
          console.warn(`Could not delete temp file ${file}:`, err.message);
        }
      }
    });
  }
}

module.exports = {
  createSticker,
  detectMediaType,
  validateAndFixBuffer,
  hasTransparency,
  handleTransparentGif,
  getMediaFPS,
  ensureFileSizeLimit,
  applyCompressionStrategy
};
