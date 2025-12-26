module.exports = {
  name: "iqc",
  alias: ["fakechat", "iphonechat"],
  description: "Membuat fake chat style iPhone dengan kustomisasi lengkap.",
  execute: async (msg, { bot, usedPrefix }) => {
    try {
      // 1. Ambil body pesan
      const body = msg.body || msg.text || (msg.message && (msg.message.conversation || msg.message.extendedTextMessage?.text)) || "";
      // Hapus command dari depan
      const text = body.slice(usedPrefix.length + 3).trim(); // +3 untuk panjang "iqc"

      // 2. Default Values & Parsing
      // Format: text|chatTime|statusBarTime|bubbleColor|menuColor|textColor|fontName|signalName
      
      if (!text) {
        return await bot.sendMessage(msg.from, { 
          text: `⚠️ *Format Salah!*\n\nGunakan format:\n${usedPrefix}iqc text|jam_chat|jam_status|warna_bubble|warna_menu|warna_teks|nama_profil|sinyal\n\n*Contoh Simpel:*\n${usedPrefix}iqc Halo sayang|10:00\n\n*Contoh Lengkap:*\n${usedPrefix}iqc Halo min|11:02|17:01|#00ffff|#000000|#ffffff|vitaal|Telkomsel` 
        }, { quoted: msg });
      }

      const parts = text.split('|').map(p => p.trim());
      const [
        txt,
        chatTime = '11:02',
        statusBarTime = '17:01',
        bubbleColorInput = '#363638',
        menuColor = '#212123ff',
        textColorInput = '#ffffff',
        fontName = 'vitaal',
        signalName = 'Telkomsel'
      ] = parts;

      if (txt.length > 200) {
        return await bot.sendMessage(msg.from, { text: '🚩 Teks terlalu panjang (Maks 200 karakter).' }, { quoted: msg });
      }

      await msg.react("🎨");

      // --- LOGIKA WARNA & KONTRAS (Dipertahankan dari kode asli) ---
      const normColor = c => (c && typeof c === 'string' && c.startsWith('#')) ? c : (c ? `#${c.replace(/^#+/, '')}` : c);
      const bubble = normColor(bubbleColorInput || '#363638');
      let textColor = normColor(textColorInput || '#ffffff');

      const hexToRgb = (hex) => {
        try {
          hex = hex.replace('#', '');
          if (hex.length === 3) hex = hex.split('').map(h => h + h).join('');
          const bigint = parseInt(hex, 16);
          return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
        } catch (e) { return null; }
      };

      const luminance = ({ r, g, b }) => {
        const a = [r, g, b].map(v => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
      };

      const contrast = (c1, c2) => {
        const rgb1 = hexToRgb(c1), rgb2 = hexToRgb(c2);
        if (!rgb1 || !rgb2) return 1;
        const L1 = luminance(rgb1), L2 = luminance(rgb2);
        const bright = Math.max(L1, L2), dark = Math.min(L1, L2);
        return (bright + 0.05) / (dark + 0.05);
      };

      // Auto-adjust text color jika kontras terlalu rendah
      try {
        const con = contrast(bubble, textColor);
        if (!textColor || textColor.toLowerCase() === bubble.toLowerCase() || con < 2) {
          const bubRgb = hexToRgb(bubble);
          const bubLum = bubRgb ? luminance(bubRgb) : 0.5;
          textColor = (bubLum > 0.5) ? '#000000' : '#ffffff';
        }
      } catch (e) { /* ignore */ }
      // --- END LOGIKA WARNA ---

      // 3. Panggil API
      const API_KEY = '1NhvxjupkX';
      const apiUrl = `https://anabot.my.id/api/maker/iqc?text=${encodeURIComponent(txt)}&chatTime=${encodeURIComponent(chatTime)}&statusBarTime=${encodeURIComponent(statusBarTime)}&bubbleColor=${encodeURIComponent(bubble)}&menuColor=${encodeURIComponent(menuColor)}&textColor=${encodeURIComponent(textColor)}&fontName=${encodeURIComponent(fontName)}&signalName=${encodeURIComponent(signalName)}&apikey=${encodeURIComponent(API_KEY)}`;

      const response = await fetch(apiUrl);
      const contentType = response.headers.get('content-type');

      // Cek jika response JSON (biasanya error atau mengembalikan URL gambar)
      if (contentType.includes('application/json')) {
        const json = await response.json();
        if (!json.status) {
           return await bot.sendMessage(msg.from, { text: '❌ API Error: Gagal membuat gambar.' }, { quoted: msg });
        }
        // Jika API mengembalikan URL gambar dalam JSON
        if (json.data && json.data.url) {
            await bot.sendMessage(msg.from, { 
                image: { url: json.data.url }, 
                caption: 'Done ya kak! ✨' 
            }, { quoted: msg });
            return;
        }
      }

      // 4. Jika response langsung Image Buffer
      const buffer = await response.arrayBuffer();
      
      await bot.sendMessage(msg.from, { 
        image: Buffer.from(buffer), 
        caption: 'Done ya kak!' 
      }, { quoted: msg });

      await msg.react("✅");

    } catch (e) {
      console.error(e);
      await msg.react("❌");
      await bot.sendMessage(msg.from, { text: `Terjadi kesalahan: ${e.message}` }, { quoted: msg });
    }
  },
};

