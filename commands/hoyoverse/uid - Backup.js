const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');
const cheerio = require('cheerio');
const { EnkaClient } = require('enka-network-api');

// Setup Enka Client
const enka = new EnkaClient({ timeout: 5000 });

module.exports = {
  name: "uid",
  description: "Cek profil Genshin Impact (Fixed Structure)",
  alias: ["genshin", "ar"],
  category: "game",
  execute: async (msg, { args, bot, usedPrefix }) => {
    
    // Variabel untuk menyimpan data yang akan digambar
    let renderData = null;

    // ==========================================
    // SKENARIO 1: UPDATE DATA (Ada Argumen)
    // ==========================================
    if (args.length > 0) {
      const input = args[0]; // UID

      if (isNaN(input) || input.length < 9) {
        return msg.reply(`⚠️ UID tidak valid! UID harus 9 digit angka.\nContoh: *${usedPrefix}uid 809912345*`);
      }

      try {
        msg.react("⏳"); 

        // 1. Fetch data dari Enka
        const user = await enka.fetchUser(input);

        // 2. Siapkan data bersih
        const uid = user.uid.toString();
        const nickname = user.nickname || "Traveler";
        const ar = user.level || "??";
        
        // 3. Simpan ke database
        if (!bot.db.data.users[msg.sender]) bot.db.data.users[msg.sender] = {};
        
        bot.db.data.users[msg.sender].genshinUid = uid;
        bot.db.data.users[msg.sender].genshinName = nickname;
        bot.db.data.users[msg.sender].genshinAr = ar;
        
        await bot.db.write();

        msg.reply(`✅ *Data Berhasil Disimpan!*\n\n👤 Nama: ${nickname}\n✨ AR: ${ar}\n\nSedang membuat kartu...`);
        
        // Set data untuk dirender
        renderData = { uid, name: nickname, ar };

      } catch (error) {
        console.error("[ENKA ERROR]", error);
        return msg.reply(`❌ Gagal mengambil data player!\nPastikan UID benar dan opsi *"Show Character Details"* di game sudah aktif.`);
      }
    } 
    
    // ==========================================
    // SKENARIO 2: LIHAT DATA (Tanpa Argumen)
    // ==========================================
    else {
      // Tentukan target: Orang yang direply ATAU Pengirim pesan
      let targetJid = msg.quoted ? msg.quoted.sender : msg.sender;

      // Ambil data dari database target
      const userData = bot.db.data.users[targetJid];

      // Validasi Ketat: Jika data target kosong, tolak.
      if (!userData || !userData.genshinUid) {
        if (targetJid === msg.sender) {
          return msg.reply(`❌ Kamu belum menyimpan UID.\nKetik: *${usedPrefix}uid <UID_KAMU>*`);
        } else {
          return msg.reply("❌ User tersebut belum menyimpan data UID Genshin Impact.");
        }
      }

      // Set data untuk dirender dari database
      renderData = {
        uid: userData.genshinUid,
        name: userData.genshinName,
        ar: userData.genshinAr
      };
    }

    // Jika renderData masih null (misal karena error fetch), stop.
    if (!renderData) return;

    // ==========================================
    // PROSES GAMBAR (RENDERING)
    // ==========================================
    try {
      if (!args.length) msg.react("🎨");

      let finalImageUrl = "";
      
      // Backup URL (Safety Net)
      const backupUrls = [
        "https://upload-os-bbs.hoyolab.com/upload/2021/04/28/10427663/b74070a2f447f54c9973274296711835_3675841053077793425.png",
        "https://upload-os-bbs.hoyolab.com/upload/2021/04/28/10427663/732551e737c3858c894200d76964952d_4492728956899737877.png"
      ];

      // --- SCRAPING GAMBAR (UPDATED SELECTOR) ---
      try {
        const targetUrl = 'https://genshindb.org/gallery/genshin-impact-namecards';
        const { data } = await axios.get(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          timeout: 5000
        });

        const $ = cheerio.load(data);
        const imageUrls = [];

        // SELECTOR BARU: Sesuai struktur HTML yang kamu kirim
        // Cari tag <figure> dengan class "wp-block-image", lalu ambil <a> didalamnya
        $('figure.wp-block-image a').each((i, el) => {
          const url = $(el).attr('href');
          
          // Filter Validasi:
          // 1. Harus ada URL
          // 2. Harus gambar (png/jpg)
          // 3. Harus dari folder uploads (menghindari link eksternal aneh)
          if (url && (url.match(/\.(png|jpe?g)$/i)) && url.includes('wp-content/uploads')) {
               imageUrls.push(url);
          }
        });

        console.log(`[UID SCRAPER] Valid images found: ${imageUrls.length}`);

        if (imageUrls.length > 0) {
          finalImageUrl = imageUrls[Math.floor(Math.random() * imageUrls.length)];
        } else {
          // Jika selector baru pun gagal, pakai backup. JANGAN cari img sembarangan.
          throw new Error("No valid namecard images found");
        }

      } catch (scrapeError) {
        console.warn("[UID] Scraping failed, using backup image.");
        finalImageUrl = backupUrls[Math.floor(Math.random() * backupUrls.length)];
      }

      // --- DRAWING ---
      const background = await loadImage(finalImageUrl);
      const canvas = createCanvas(background.width, background.height);
      const ctx = canvas.getContext('2d');

      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

      // Setup Ukuran Font (Responsif)
      const fontSizeUid = Math.floor(canvas.width * 0.05); 
      const fontSizeName = Math.floor(canvas.width * 0.07);
      const fontSizeAr = Math.floor(canvas.width * 0.04);
      const padding = Math.floor(canvas.width * 0.04);

      // Style Outline & Shadow
      ctx.fillStyle = "#ffffff";     
      ctx.strokeStyle = "#000000";   
      ctx.lineWidth = Math.floor(canvas.width * 0.015); 
      ctx.lineJoin = "round";        
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowBlur = 8;

      // 1. UID (Kanan Atas)
      ctx.font = `900 ${fontSizeUid}px sans-serif`; 
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      const textUid = `UID: ${renderData.uid}`;
      ctx.strokeText(textUid, canvas.width - padding, padding); 
      ctx.fillText(textUid, canvas.width - padding, padding);   

      // 2. NAMA (Kiri Bawah)
      ctx.font = `900 ${fontSizeName}px sans-serif`;
      ctx.textAlign = "left";      
      ctx.textBaseline = "bottom"; 
      
      const textName = renderData.name;
      const yName = canvas.height - padding - (fontSizeAr * 1.3); // Naikkan dikit biar ga numpuk AR
      
      ctx.strokeText(textName, padding, yName); 
      ctx.fillText(textName, padding, yName);   

      // 3. AR (Kiri Bawah - Dibawah Nama)
      ctx.font = `900 ${fontSizeAr}px sans-serif`; 
      ctx.fillStyle = "#FFD700"; // Kuning Emas
      
      const textAr = `Adventure Rank: ${renderData.ar}`;
      const yAr = canvas.height - padding;

      ctx.strokeText(textAr, padding, yAr); 
      ctx.fillText(textAr, padding, yAr);

      // Kirim
      const buffer = canvas.toBuffer('image/png');
      
      await bot.sendMessage(msg.from, { 
        image: buffer, 
        caption: `👤 *Genshin Impact Profile*\n\n🏷️ Nickname: ${renderData.name}\n✨ AR: ${renderData.ar}\n🆔 UID: ${renderData.uid}` 
      }, { quoted: msg });

    } catch (error) {
      console.error("[UID RENDER] Error:", error);
      msg.reply("Maaf, terjadi kesalahan saat membuat gambar.");
    }
  },
};