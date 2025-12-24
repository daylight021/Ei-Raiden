const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

// Konfigurasi Sumber Font
// Pastikan path ini mengarah ke folder tempat kamu menyimpan file .ttf/.otf
const SOURCE_DIR = path.join(__dirname, '../lib/fonts'); 

function getSystemFontDir() {
  const platform = os.platform();
  const homedir = os.homedir();

  switch (platform) {
    case 'win32': // Windows
      // Windows 10/11 mendukung install font per-user di AppData
      return path.join(homedir, 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts');
    
    case 'darwin': // macOS
      return path.join(homedir, 'Library', 'Fonts');
    
    case 'linux': // Linux (Ubuntu, Debian, CentOS, dll)
      return path.join(homedir, '.local', 'share', 'fonts');
    
    default:
      console.warn(`⚠️ Platform ${platform} tidak didukung secara otomatis.`);
      return null;
  }
}

function registerFonts() {
  const destDir = getSystemFontDir();
  
  if (!destDir) return;

  // 1. Cek folder sumber
  if (!fs.existsSync(SOURCE_DIR)) {
    console.log('ℹ️  Folder ./lib/fonts tidak ditemukan. Melewati instalasi font.');
    return;
  }

  // 2. Buat folder tujuan jika belum ada
  if (!fs.existsSync(destDir)) {
    try {
      fs.mkdirSync(destDir, { recursive: true });
    } catch (e) {
      console.error('❌ Gagal membuat folder font sistem:', e.message);
      return;
    }
  }

  // 3. Salin Font
  const files = fs.readdirSync(SOURCE_DIR);
  let installedCount = 0;
  const isWindows = os.platform() === 'win32';

  files.forEach(file => {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.ttf' || ext === '.otf') {
      const src = path.join(SOURCE_DIR, file);
      const dest = path.join(destDir, file);

      if (!fs.existsSync(dest)) {
        try {
          fs.copyFileSync(src, dest);
          installedCount++;
          console.log(`✅ [${os.platform()}] Menginstall font: ${file}`);
          
          // KHUSUS WINDOWS: Perlu Registry Update agar terbaca tanpa restart/klik kanan
          if (isWindows) {
            registerWindowsFont(file, dest);
          }

        } catch (e) {
          console.error(`❌ Gagal menyalin ${file}:`, e.message);
        }
      }
    }
  });

  // 4. Post-Install Commands (Refresh Cache)
  if (installedCount > 0) {
    if (os.platform() === 'linux') {
      console.log('🔄 Menyegarkan cache font Linux...');
      exec('fc-cache -f -v', (err) => {
        if (err) console.warn('⚠️ Gagal menjalankan fc-cache, tapi file sudah disalin.');
        else console.log('✨ Cache font berhasil diperbarui!');
      });
    } else {
      console.log('✨ Font berhasil disalin. (Jika belum terbaca, coba restart bot/terminal)');
    }
  } else {
    // console.log('👌 Semua font sudah terinstall.'); 
    // (Dikomentari agar tidak spam log setiap restart)
  }
}

// Helper khusus Windows untuk mendaftarkan Registry
function registerWindowsFont(fileName, fontPath) {
  // Nama font di registry idealnya nama asli font, tapi menggunakan nama file
  // seringkali cukup untuk dikenali oleh library level OS.
  const fontName = path.parse(fileName).name; 
  const command = `powershell -Command "New-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts' -Name '${fontName} (TrueType)' -Value '${fontPath}' -PropertyType String -Force"`;
  
  exec(command, (error) => {
    if (error) console.warn(`⚠️ Gagal update registry Windows untuk ${fileName} (Mungkin butuh run as admin?)`);
  });
}

module.exports = registerFonts;