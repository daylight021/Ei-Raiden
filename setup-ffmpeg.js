const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// FFmpeg download URLs for different platforms
const FFMPEG_URLS = {
  win32: {
    x64: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
    ia32: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
  },
  linux: {
    x64: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz',
    arm64: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz',
    arm: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-armhf-static.tar.xz'
  },
  darwin: {
    x64: 'https://evermeet.cx/ffmpeg/ffmpeg-7.0.1.zip',
    arm64: 'https://evermeet.cx/ffmpeg/ffmpeg-7.0.1.zip'
  }
};

const BIN_DIR = path.join(__dirname, 'bin');

// Ensure bin directory exists
if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

// Detect platform and architecture
const platform = process.platform;
const arch = process.arch;

console.log(`Detected platform: ${platform}, architecture: ${arch}`);

// Get download URL
function getDownloadUrl() {
  if (!FFMPEG_URLS[platform]) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const platformUrls = FFMPEG_URLS[platform];
  const url = platformUrls[arch];

  if (!url) {
    // Fallback to x64 if specific arch not found
    if (platformUrls.x64) {
      console.log(`Specific arch ${arch} not found, using x64`);
      return platformUrls.x64;
    }
    throw new Error(`Unsupported architecture: ${arch} for platform ${platform}`);
  }

  return url;
}

// Download file with redirect handling
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading from: ${url}`);
    console.log(`Saving to: ${destPath}`);

    const download = (downloadUrl) => {
      const file = fs.createWriteStream(destPath);
      const request = https.get(downloadUrl, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303) {
          const redirectUrl = response.headers.location;
          console.log(`Redirecting to: ${redirectUrl}`);
          file.close();
          fs.unlink(destPath, () => {}); // Clean up partial file
          download(redirectUrl); // Retry with new URL
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize) {
            const progress = (downloadedSize / totalSize * 100).toFixed(1);
            process.stdout.write(`\rDownload progress: ${progress}%`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log('\nDownload completed!');
          resolve();
        });
      });

      request.on('error', (err) => {
        fs.unlink(destPath, () => {}); // Delete the file on error
        reject(err);
      });

      file.on('error', (err) => {
        fs.unlink(destPath, () => {}); // Delete the file on error
        reject(err);
      });
    };

    download(url);
  });
}

// Extract archives
function extractArchive(archivePath, extractTo) {
  const fileName = path.basename(archivePath).toLowerCase();
  const ext = path.extname(archivePath).toLowerCase();

  console.log(`Extracting ${archivePath} to ${extractTo}`);
  console.log(`File extension detected: ${ext}`);

  if (ext === '.zip' || fileName.endsWith('.zip')) {
    // Use PowerShell for Windows, unzip for others
    if (platform === 'win32') {
      execSync(`powershell -command "Expand-Archive -Path '${archivePath}' -DestinationPath '${extractTo}' -Force"`);
    } else {
      execSync(`unzip -o "${archivePath}" -d "${extractTo}"`);
    }
  } else if (ext === '.xz' || fileName.includes('.tar.xz')) {
    // Handle .xz files (tar.xz)
    if (platform === 'win32') {
      // On Windows, try using tar if available (Windows 10+ has tar), otherwise suggest manual extraction
      try {
        console.log('Trying to extract .xz file on Windows with tar...');
        execSync(`tar -xf "${archivePath}" -C "${extractTo}"`);
      } catch (tarError) {
        console.warn('tar command failed on Windows. Trying 7zip...');
        try {
          execSync(`"C:\\Program Files\\7-Zip\\7z.exe" x "${archivePath}" -o"${extractTo}"`);
        } catch (zipError) {
          console.error('7zip not found. Please install 7zip or extract manually.');
          console.error(`Extract ${archivePath} to ${extractTo} manually, then run setup again.`);
          throw new Error('Cannot extract .xz file on Windows. Please install 7zip or extract manually.');
        }
      }
    } else {
      // On Linux/macOS, use tar
      execSync(`tar -xf "${archivePath}" -C "${extractTo}"`);
    }
  } else if (ext === '.gz' || fileName.includes('.tar.gz')) {
    execSync(`tar -xzf "${archivePath}" -C "${extractTo}"`);
  } else {
    throw new Error(`Unsupported archive format: ${ext} (filename: ${fileName})`);
  }

  console.log('Extraction completed!');
}

// Find ffmpeg binary in extracted files
function findFfmpegBinary(extractDir) {
  const possibleNames = ['ffmpeg', 'ffmpeg.exe'];
  const possiblePaths = [
    path.join(extractDir, 'ffmpeg'),
    path.join(extractDir, 'ffmpeg.exe'),
    path.join(extractDir, 'bin', 'ffmpeg'),
    path.join(extractDir, 'bin', 'ffmpeg.exe')
  ];

  // For Windows Gyan.dev build
  if (platform === 'win32') {
    const gyanPath = path.join(extractDir, 'ffmpeg-*-essentials_build', 'bin', 'ffmpeg.exe');
    const gyanFiles = fs.readdirSync(extractDir).filter(f => f.includes('ffmpeg') && f.includes('essentials'));
    if (gyanFiles.length > 0) {
      possiblePaths.push(path.join(extractDir, gyanFiles[0], 'bin', 'ffmpeg.exe'));
    }
  }

  // For Linux static builds
  if (platform === 'linux') {
    const linuxPath = path.join(extractDir, 'ffmpeg-*-amd64-static', 'ffmpeg');
    const linuxFiles = fs.readdirSync(extractDir).filter(f => f.includes('ffmpeg') && f.includes('static'));
    if (linuxFiles.length > 0) {
      possiblePaths.push(path.join(extractDir, linuxFiles[0], 'ffmpeg'));
    }
  }

  for (const binPath of possiblePaths) {
    if (fs.existsSync(binPath)) {
      console.log(`Found ffmpeg binary: ${binPath}`);
      return binPath;
    }
  }

  // Try to find recursively
  function findRecursive(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        const result = findRecursive(fullPath);
        if (result) return result;
      } else if (possibleNames.includes(item)) {
        return fullPath;
      }
    }
    return null;
  }

  const found = findRecursive(extractDir);
  if (found) {
    console.log(`Found ffmpeg binary recursively: ${found}`);
    return found;
  }

  throw new Error('Could not find ffmpeg binary in extracted files');
}

// Copy binary to bin directory
function copyBinary(sourcePath, destPath) {
  console.log(`Copying ${sourcePath} to ${destPath}`);
  fs.copyFileSync(sourcePath, destPath);

  // Make executable on Unix-like systems
  if (platform !== 'win32') {
    fs.chmodSync(destPath, '755');
  }

  console.log('Binary copied successfully!');
}

// Main setup function
async function setupFFmpeg() {
  try {
    console.log('🚀 Starting FFmpeg setup for all platforms...\n');

    const downloadUrl = getDownloadUrl();
    const archiveName = path.basename(downloadUrl);
    const archivePath = path.join(BIN_DIR, archiveName);
    const extractDir = path.join(BIN_DIR, 'temp_extract');

    // Clean up any existing temp directory
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });

    // Download archive
    console.log('📥 Downloading FFmpeg...');
    await downloadFile(downloadUrl, archivePath);

    // Extract archive
    console.log('📦 Extracting FFmpeg...');
    extractArchive(archivePath, extractDir);

    // Find binary
    console.log('🔍 Finding FFmpeg binary...');
    const ffmpegBinaryPath = findFfmpegBinary(extractDir);

    // Copy to bin directory
    const finalBinaryName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const finalBinaryPath = path.join(BIN_DIR, finalBinaryName);
    copyBinary(ffmpegBinaryPath, finalBinaryPath);

    // Clean up
    console.log('🧹 Cleaning up temporary files...');
    fs.unlinkSync(archivePath);
    fs.rmSync(extractDir, { recursive: true, force: true });

    // Verify installation
    console.log('✅ Verifying FFmpeg installation...');
    const versionOutput = execSync(`"${finalBinaryPath}" -version`, { encoding: 'utf8' });
    const versionMatch = versionOutput.match(/ffmpeg version ([^\s]+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';

    console.log(`\n🎉 FFmpeg setup completed successfully!`);
    console.log(`📍 Binary location: ${finalBinaryPath}`);
    console.log(`📋 Version: ${version}`);
    console.log(`🖥️ Platform: ${platform}-${arch}`);

    // Create platform-specific binaries directory structure
    console.log('\n📁 Creating cross-platform binary structure...');
    createCrossPlatformStructure();

  } catch (error) {
    console.error('❌ FFmpeg setup failed:', error.message);
    process.exit(1);
  }
}

// Create directory structure for cross-platform binaries
function createCrossPlatformStructure() {
  const platforms = ['win32', 'linux', 'darwin'];
  const arches = ['x64', 'arm64', 'ia32', 'arm'];

  platforms.forEach(platform => {
    arches.forEach(arch => {
      const dir = path.join(BIN_DIR, `${platform}-${arch}`);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Create a placeholder or copy existing binary
      const placeholder = path.join(dir, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      if (!fs.existsSync(placeholder)) {
        try {
          // Copy current binary as placeholder (will be replaced when downloaded for that platform)
          const currentBinary = path.join(BIN_DIR, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
          if (fs.existsSync(currentBinary)) {
            fs.copyFileSync(currentBinary, placeholder);
            if (platform !== 'win32') {
              fs.chmodSync(placeholder, '755');
            }
          } else {
            // Create a placeholder script
            const placeholderContent = platform === 'win32'
              ? '@echo off\necho FFmpeg binary not downloaded for this platform. Run setup-ffmpeg.js first.\n'
              : '#!/bin/bash\necho "FFmpeg binary not downloaded for this platform. Run setup-ffmpeg.js first."\n';
            fs.writeFileSync(placeholder, placeholderContent);
            if (platform !== 'win32') {
              fs.chmodSync(placeholder, '755');
            }
          }
        } catch (e) {
          console.warn(`Could not create placeholder for ${platform}-${arch}:`, e.message);
        }
      }
    });
  });

  console.log('✅ Cross-platform structure created!');
}

// Run setup if called directly
if (require.main === module) {
  setupFFmpeg();
}

module.exports = { setupFFmpeg };
