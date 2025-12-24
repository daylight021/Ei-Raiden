const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

// FFmpeg binary paths
const BIN_DIR = path.join(__dirname, '..', 'bin');
const PLATFORM_BINARIES = {
  win32: {
    x64: path.join(BIN_DIR, 'win32-x64', 'ffmpeg.exe'),
    ia32: path.join(BIN_DIR, 'win32-ia32', 'ffmpeg.exe')
  },
  linux: {
    x64: path.join(BIN_DIR, 'linux-x64', 'ffmpeg'),
    arm64: path.join(BIN_DIR, 'linux-arm64', 'ffmpeg'),
    arm: path.join(BIN_DIR, 'linux-arm', 'ffmpeg')
  },
  darwin: {
    x64: path.join(BIN_DIR, 'darwin-x64', 'ffmpeg'),
    arm64: path.join(BIN_DIR, 'darwin-arm64', 'ffmpeg')
  }
};

// Detect current platform and architecture
const platform = process.platform;
const arch = process.arch;

console.log(`🤖 FFmpeg Config: Detected platform ${platform}-${arch}`);

/**
 * Get the appropriate FFmpeg binary path for current platform
 * @returns {string|null} Path to FFmpeg binary or null if not found
 */
function getFFmpegPath() {
  // First try platform-specific binary
  if (PLATFORM_BINARIES[platform] && PLATFORM_BINARIES[platform][arch]) {
    const platformPath = PLATFORM_BINARIES[platform][arch];
    if (fs.existsSync(platformPath)) {
      console.log(`✅ Using platform-specific FFmpeg: ${platformPath}`);
      return platformPath;
    }
  }

  // Fallback to generic binary in bin directory
  const genericBinary = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const genericPath = path.join(BIN_DIR, genericBinary);

  if (fs.existsSync(genericPath)) {
    console.log(`✅ Using generic FFmpeg: ${genericPath}`);
    return genericPath;
  }

  // Last resort: try to find in PATH
  try {
    const which = require('which');
    const pathBinary = which.sync('ffmpeg');
    if (pathBinary) {
      console.log(`⚠️ Using FFmpeg from PATH: ${pathBinary}`);
      return pathBinary;
    }
  } catch (e) {
    // which module not available or ffmpeg not in PATH
  }

  console.warn(`❌ No FFmpeg binary found for ${platform}-${arch}`);
  return null;
}

/**
 * Configure fluent-ffmpeg to use our custom binary
 */
function configureFFmpeg() {
  const ffmpegPath = getFFmpegPath();

  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
    console.log(`🔧 FFmpeg configured successfully: ${ffmpegPath}`);

    // Test the binary
    testFFmpegBinary(ffmpegPath);
  } else {
    console.error(`❌ FFmpeg configuration failed: No binary found`);
    console.error(`💡 Run 'node setup-ffmpeg.js' to download FFmpeg binaries`);
  }
}

/**
 * Test if FFmpeg binary is working
 * @param {string} binaryPath - Path to FFmpeg binary
 */
function testFFmpegBinary(binaryPath) {
  try {
    const { execSync } = require('child_process');
    const output = execSync(`"${binaryPath}" -version`, { encoding: 'utf8', timeout: 5000 });
    const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';

    console.log(`🎬 FFmpeg test successful - Version: ${version}`);
  } catch (error) {
    console.warn(`⚠️ FFmpeg test failed: ${error.message}`);
    console.warn(`💡 The binary might be corrupted or incompatible`);
  }
}

/**
 * Get FFmpeg capabilities (optional)
 * @returns {Promise<Object>} FFmpeg capabilities
 */
function getCapabilities() {
  return new Promise((resolve, reject) => {
    ffmpeg.getAvailableFormats((err, formats) => {
      if (err) {
        reject(err);
        return;
      }

      ffmpeg.getAvailableCodecs((err, codecs) => {
        if (err) {
          reject(err);
          return;
        }

        ffmpeg.getAvailableEncoders((err, encoders) => {
          if (err) {
            reject(err);
            return;
          }

          resolve({
            formats: Object.keys(formats),
            codecs: Object.keys(codecs),
            encoders: Object.keys(encoders)
          });
        });
      });
    });
  });
}

/**
 * Check if FFmpeg is properly configured
 * @returns {boolean} True if configured
 */
function isConfigured() {
  const ffmpegPath = getFFmpegPath();
  return ffmpegPath !== null && fs.existsSync(ffmpegPath);
}

// Auto-configure on module load
configureFFmpeg();

module.exports = {
  configureFFmpeg,
  getFFmpegPath,
  getCapabilities,
  isConfigured,
  testFFmpegBinary
};
