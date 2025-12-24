const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");

// Fungsi untuk mendapatkan FPS dari video/animasi
function getMediaFPS(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.warn('Could not get FPS, using default');
        resolve(null);
        return;
      }

      try {
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (videoStream && videoStream.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
          const fps = den ? num / den : num;
          console.log(`Detected FPS: ${fps}`);
          resolve(fps);
        } else {
          resolve(null);
        }
      } catch (e) {
        console.warn('Error parsing FPS:', e.message);
        resolve(null);
      }
    });
  });
}

// Fungsi untuk mengecek apakah GIF memiliki transparency
function hasTransparency(buffer) {
  try {
    // Cek untuk Global Color Table transparency
    if (buffer.includes(Buffer.from([0x21, 0xF9]))) { // Graphic Control Extension
      return true;
    }

    // Cek untuk disposal method yang mengindikasikan transparency
    const gifData = buffer.toString('hex');
    if (gifData.includes('21f9') || gifData.includes('21fe')) {
      return true;
    }

    return false;
  } catch (error) {
    console.warn('Error checking transparency:', error.message);
    return false;
  }
}

// Fungsi khusus untuk menangani GIF transparan
async function handleTransparentGif(inputPath, outputPath) {
  console.log("Handling transparent GIF with special method...");

  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Transparent GIF conversion timeout'));
    }, 60000);

    // Deteksi FPS asli dan batasi jika terlalu tinggi
    let originalFPS = await getMediaFPS(inputPath);
    if (originalFPS && originalFPS > 20) {
      console.log(`GIF FPS too high (${originalFPS}), limiting to 12 for stability`);
      originalFPS = 12;
    } else if (!originalFPS) {
      originalFPS = 12; // Default fallback
    }

    // Method khusus untuk GIF transparan - extract frames dulu, lalu rebuild
    const tempFramesDir = path.join(path.dirname(inputPath), `frames_${Date.now()}`);

    try {
      fs.mkdirSync(tempFramesDir, { recursive: true });
    } catch (e) {
      clearTimeout(timeout);
      return reject(new Error('Failed to create frames directory'));
    }

    // Step 1: Extract frames dari GIF dengan padding transparan
    ffmpeg(inputPath)
      .outputOptions([
        "-vf", "format=rgba,scale='if(gt(iw,ih),512,-2)':'if(gt(iw,ih),-2,512)',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0"
      ])
      .save(path.join(tempFramesDir, 'frame_%04d.png'))
      .on("start", (commandLine) => {
        console.log('Extracting GIF frames:', commandLine);
      })
      .on("end", () => {
        // Step 2: Rebuild ke WebP animasi dari extracted frames dengan padding transparan
        ffmpeg(path.join(tempFramesDir, 'frame_%04d.png'))
          .inputOptions([
            "-framerate", originalFPS.toString()
          ])
          .outputOptions([
            "-c:v", "libwebp_anim",
            "-vf", "format=rgba",
            "-pix_fmt", "yuva420p",
            "-loop", "0",
            "-preset", "default",
            "-lossless", "0",
            "-qscale", "60",
            "-compression_level", "6",
            "-method", "6"
          ])
          .save(outputPath)
          .on("start", (commandLine) => {
            console.log('Rebuilding WebP from frames:', commandLine);
          })
          .on("end", () => {
            clearTimeout(timeout);

            // Cleanup frames directory
            try {
              const files = fs.readdirSync(tempFramesDir);
              files.forEach(file => {
                fs.unlinkSync(path.join(tempFramesDir, file));
              });
              fs.rmdirSync(tempFramesDir);
            } catch (cleanupError) {
              console.warn('Failed to cleanup frames directory:', cleanupError.message);
            }

            if (!fs.existsSync(outputPath)) {
              return reject(new Error("Output file was not created."));
            }

            const stats = fs.statSync(outputPath);
            console.log(`Transparent GIF conversion completed: ${stats.size} bytes`);
            resolve(stats.size);
          })
          .on("error", (err) => {
            clearTimeout(timeout);
            // Cleanup on error
            try {
              const files = fs.readdirSync(tempFramesDir);
              files.forEach(file => {
                fs.unlinkSync(path.join(tempFramesDir, file));
              });
              fs.rmdirSync(tempFramesDir);
            } catch (e) {}
            reject(err);
          });
      })
      .on("error", (err) => {
        clearTimeout(timeout);
        // Cleanup on error
        try {
          if (fs.existsSync(tempFramesDir)) {
            const files = fs.readdirSync(tempFramesDir);
            files.forEach(file => {
              fs.unlinkSync(path.join(tempFramesDir, file));
            });
            fs.rmdirSync(tempFramesDir);
          }
        } catch (e) {}
        reject(err);
      });
  });
}

// Fungsi konversi yang diperbaiki untuk menghindari artefak
async function optimizedConversion(inputPath, outputPath, isVideo = false) {
  console.log("Using optimized conversion method...");

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Conversion timeout'));
    }, 60000);

    let ffmpegCmd = ffmpeg(inputPath);

    if (isVideo) {
      // Untuk video/animasi - menggunakan libwebp_anim dengan padding transparan
      ffmpegCmd = ffmpegCmd
        .duration(10) // Maksimal 10 detik
        .outputOptions([
          "-c:v", "libwebp_anim",
          "-vf", "format=rgba,scale='if(gt(iw,ih),512,-2)':'if(gt(iw,ih),-2,512)',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0,fps=15",
          "-pix_fmt", "yuva420p",
          "-loop", "0",
          "-an", // No audio
          "-preset", "default",
          "-lossless", "0",
          "-compression_level", "6",
          "-qscale", "65",
          "-method", "6"
        ]);
    } else {
      // Untuk gambar statis dengan padding transparan
      ffmpegCmd = ffmpegCmd
        .outputOptions([
          "-c:v", "libwebp",
          "-vf", "format=rgba,scale='if(gt(iw,ih),512,-2)':'if(gt(iw,ih),-2,512)',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0",
          "-pix_fmt", "yuva420p",
          "-lossless", "0",
          "-qscale", "70",
          "-preset", "default",
          "-compression_level", "6"
        ]);
    }

    ffmpegCmd
      .save(outputPath)
      .on("start", (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on("end", () => {
        clearTimeout(timeout);
        if (!fs.existsSync(outputPath)) {
          return reject(new Error("Output file was not created."));
        }
        const stats = fs.statSync(outputPath);
        console.log(`Conversion completed: ${stats.size} bytes`);
        resolve(stats.size);
      })
      .on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}

// Fungsi fallback untuk file yang sulit dikonversi
async function fallbackConversion(inputPath, outputPath, isVideo = false) {
  console.log("Using fallback conversion method...");

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Fallback conversion timeout'));
    }, 45000);

    let ffmpegCmd = ffmpeg(inputPath);

    if (isVideo) {
      // Untuk video/animasi - fallback dengan padding transparan
      ffmpegCmd = ffmpegCmd
        .duration(8) // Durasi lebih pendek untuk file bermasalah
        .outputOptions([
          "-c:v", "libwebp_anim",
          "-vf", "format=rgba,scale='if(gt(iw,ih),480,-2)':'if(gt(iw,ih),-2,480)',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0,fps=10",
          "-pix_fmt", "yuva420p",
          "-loop", "0",
          "-an",
          "-lossless", "0",
          "-qscale", "50",
          "-preset", "default",
          "-compression_level", "4"
        ]);
    } else {
      // Untuk gambar statis fallback dengan padding transparan
      ffmpegCmd = ffmpegCmd
        .outputOptions([
          "-c:v", "libwebp",
          "-vf", "format=rgba,scale='if(gt(iw,ih),480,-2)':'if(gt(iw,ih),-2,480)',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0",
          "-pix_fmt", "yuva420p",
          "-lossless", "0",
          "-qscale", "50"
        ]);
    }

    ffmpegCmd
      .save(outputPath)
      .on("start", (commandLine) => {
        console.log('Fallback FFmpeg command:', commandLine);
      })
      .on("end", () => {
        clearTimeout(timeout);
        if (!fs.existsSync(outputPath)) {
          return reject(new Error("Output file was not created."));
        }
        const stats = fs.statSync(outputPath);
        console.log(`Fallback conversion completed: ${stats.size} bytes`);
        resolve(stats.size);
      })
      .on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}

// Fungsi untuk mengecek dan mengompres file jika terlalu besar
async function ensureFileSizeLimit(filePath, maxSize = 950 * 1024, isAnimated = false, originalInputPath = null) {
  const stats = fs.statSync(filePath);

  if (stats.size <= maxSize) {
    return stats.size;
  }

  console.log(`File too large (${stats.size} bytes), applying additional compression...`);

  // Dapatkan FPS asli jika animated
  let originalFPS = null;
  if (isAnimated && originalInputPath && fs.existsSync(originalInputPath)) {
    originalFPS = await getMediaFPS(originalInputPath);
  }

  const tempPath = filePath.replace('.webp', '_compressed.webp');

  // Strategi kompresi bertahap
  const compressionStrategies = [
    // Strategy 1: Kompresi dengan FPS asli, resize ke 450px
    {
      scale: 450,
      fps: originalFPS,
      qscale: 45,
      compression: 6,
      name: 'Light compression with original FPS'
    },
    // Strategy 2: Kompresi sedang dengan FPS asli, resize ke 400px
    {
      scale: 400,
      fps: originalFPS,
      qscale: 35,
      compression: 6,
      name: 'Medium compression with original FPS'
    },
    // Strategy 3: Kompresi agresif dengan FPS dikurangi sedikit
    {
      scale: 380,
      fps: originalFPS ? Math.max(10, Math.floor(originalFPS * 0.75)) : 12,
      qscale: 28,
      compression: 6,
      name: 'Aggressive compression with reduced FPS'
    },
    // Strategy 4: Kompresi sangat agresif
    {
      scale: 360,
      fps: originalFPS ? Math.max(8, Math.floor(originalFPS * 0.6)) : 10,
      qscale: 22,
      compression: 6,
      name: 'Very aggressive compression'
    },
    // Strategy 5: Kompresi ekstrem (last resort)
    {
      scale: 320,
      fps: originalFPS ? Math.max(6, Math.floor(originalFPS * 0.5)) : 8,
      qscale: 18,
      compression: 6,
      name: 'Extreme compression'
    }
  ];

  // Coba setiap strategi secara berurutan
  for (let i = 0; i < compressionStrategies.length; i++) {
    const strategy = compressionStrategies[i];
    console.log(`Trying strategy ${i + 1}: ${strategy.name} (scale=${strategy.scale}, fps=${strategy.fps}, qscale=${strategy.qscale})`);

    try {
      const size = await applyCompressionStrategy(
        originalInputPath || filePath,
        tempPath,
        strategy,
        isAnimated
      );

      if (size <= maxSize) {
        // Success! Replace original file
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        fs.renameSync(tempPath, filePath);
        console.log(`✅ Strategy ${i + 1} succeeded! File compressed to ${size} bytes`);
        return size;
      } else {
        console.log(`Strategy ${i + 1} resulted in ${size} bytes, still too large`);
        // Cleanup and try next strategy
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      }
    } catch (error) {
      console.warn(`Strategy ${i + 1} failed: ${error.message}`);
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      // Continue to next strategy
    }
  }

  // Jika semua strategi gagal, throw error
  throw new Error('Could not compress file below size limit with any strategy');
}

// Fungsi helper untuk menerapkan strategi kompresi
function applyCompressionStrategy(inputPath, outputPath, strategy, isAnimated) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Compression strategy timeout'));
    }, 45000);

    const inputFile = inputPath;
    console.log(`Compressing from: ${path.basename(inputFile)}`);

    let ffmpegCmd = ffmpeg(inputFile);

    if (isAnimated) {
      // Untuk animasi: tambahkan fps jika ada
      const vfFilter = strategy.fps
        ? `format=rgba,scale='if(gt(iw,ih),${strategy.scale},-2)':'if(gt(iw,ih),-2,${strategy.scale})',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0,fps=${strategy.fps}`
        : `format=rgba,scale='if(gt(iw,ih),${strategy.scale},-2)':'if(gt(iw,ih),-2,${strategy.scale})',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0`;

      ffmpegCmd = ffmpegCmd
        .outputOptions([
          "-c:v", "libwebp_anim",
          "-vf", vfFilter,
          "-pix_fmt", "yuva420p",
          "-loop", "0",
          "-preset", "default",
          "-lossless", "0",
          "-qscale", strategy.qscale.toString(),
          "-compression_level", strategy.compression.toString(),
          "-method", "6"
        ]);
    } else {
      // Untuk gambar statis
      ffmpegCmd = ffmpegCmd
        .outputOptions([
          "-c:v", "libwebp",
          "-vf", `format=rgba,scale='if(gt(iw,ih),${strategy.scale},-2)':'if(gt(iw,ih),-2,${strategy.scale})',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0`,
          "-pix_fmt", "yuva420p",
          "-lossless", "0",
          "-qscale", strategy.qscale.toString(),
          "-preset", "default",
          "-compression_level", strategy.compression.toString()
        ]);
    }

    ffmpegCmd
      .save(outputPath)
      .on("start", (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on("end", () => {
        clearTimeout(timeout);
        try {
          if (!fs.existsSync(outputPath)) {
            return reject(new Error("Compressed file was not created"));
          }

          const newStats = fs.statSync(outputPath);
          console.log(`Strategy resulted in ${newStats.size} bytes`);
          resolve(newStats.size);
        } catch (error) {
          reject(error);
        }
      })
      .on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}

module.exports = {
  getMediaFPS,
  hasTransparency,
  handleTransparentGif,
  optimizedConversion,
  fallbackConversion,
  ensureFileSizeLimit,
  applyCompressionStrategy
};
