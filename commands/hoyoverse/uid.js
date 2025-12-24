const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');
const cheerio = require('cheerio');
const { EnkaClient } = require('enka-network-api');
const { generateWAMessageFromContent, prepareWAMessageMedia } = require("@whiskeysockets/baileys");

// Setup Enka Client
const enka = new EnkaClient({ timeout: 5000 });

module.exports = {
  name: "uid",
  description: "Cek profil Genshin Impact (Multi Account + Carousel)",
  alias: ["genshin", "ar"],
  category: "game",
  execute: async (msg, { args, bot, usedPrefix }) => {
    
    // Helper function untuk mengirim carousel
    const sendCarousel = async (cardsData) => {
      try {
        // PROSES PEMBUATAN KARTU (Mapping)
        const cards = await Promise.all(cardsData.map(async (card) => {
          // Siapkan media (gambar)
          const media = await prepareWAMessageMedia({ image: { url: card.image } }, { upload: bot.waUploadToServer });

          return {
            header: {
              hasMediaAttachment: true,
              ...media
            },
            body: {
              text: card.body
            },
            footer: {
              text: card.footer
            },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "cta_copy",
                  buttonParamsJson: JSON.stringify({
                    display_text: card.btnText,
                    copy_code: card.url,
                    id: card.url
                  })
                }
              ]
            }
          };
        }));

        // SUSUN PESAN UTAMA (Interactive Message)
        const msgContent = generateWAMessageFromContent(msg.chat, {
          viewOnceMessage: {
            message: {
              interactiveMessage: {
                body: {
                  text: "🎮 Genshin Impact Profiles 🎮\n\nSilakan geser kartu di bawah untuk melihat semua akun!"
                },
                footer: {
                  text: "Genshin Impact • Multi Account"
                },
                header: {
                  hasMediaAttachment: false
                },
                carouselMessage: {
                  cards: cards
                }
              }
            }
          }
        }, { quoted: msg });

        // KIRIM PESAN (Relay)
        await bot.relayMessage(msg.from, msgContent.message, { messageId: msgContent.key.id });
        return true;
      } catch (error) {
        console.error("[CAROUSEL ERROR]", error);
        return false;
      }
    };

    // Helper function untuk generate gambar profile
    const generateProfileImage = async (renderData) => {
      try {
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

          // SELECTOR BARU: Sesuai struktur HTML
          $('figure.wp-block-image a').each((i, el) => {
            const url = $(el).attr('href');
            
            if (url && (url.match(/\.(png|jpe?g)$/i)) && url.includes('wp-content/uploads')) {
              imageUrls.push(url);
            }
          });

          if (imageUrls.length > 0) {
            finalImageUrl = imageUrls[Math.floor(Math.random() * imageUrls.length)];
          } else {
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
        const yName = canvas.height - padding - (fontSizeAr * 1.3);
        
        ctx.strokeText(textName, padding, yName); 
        ctx.fillText(textName, padding, yName);   

        // 3. AR (Kiri Bawah - Dibawah Nama)
        ctx.font = `900 ${fontSizeAr}px sans-serif`; 
        ctx.fillStyle = "#FFD700"; // Kuning Emas
        
        const textAr = `Adventure Rank: ${renderData.ar}`;
        const yAr = canvas.height - padding;

        ctx.strokeText(textAr, padding, yAr); 
        ctx.fillText(textAr, padding, yAr);

        return canvas.toBuffer('image/png');
      } catch (error) {
        console.error("[GENERATE IMAGE ERROR]", error);
        throw error;
      }
    };

    // Helper function untuk upload gambar ke server
    const uploadImageToServer = async (imageBuffer) => {
      try {
        // Untuk saat ini, kita akan menggunakan catbox.moe
        // Catatan: Anda perlu mengimplementasikan upload yang sebenarnya sesuai kebutuhan
        const FormData = require('form-data');
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', imageBuffer, {
          filename: 'profile.png',
          contentType: 'image/png'
        });

        const response = await axios.post('https://catbox.moe/user/api.php', form, {
          headers: form.getHeaders(),
          timeout: 10000
        });

        return response.data.trim();
      } catch (error) {
        console.error("[UPLOAD ERROR]", error);
        // Fallback: return base64 data URL
        const base64Image = imageBuffer.toString('base64');
        return `data:image/png;base64,${base64Image}`;
      }
    };

    // Helper function untuk fetch data dari Enka
    const fetchEnkaData = async (uid) => {
      try {
        const user = await enka.fetchUser(uid);
        return {
          uid: user.uid.toString(),
          name: user.nickname || "Traveler",
          ar: user.level || "??"
        };
      } catch (error) {
        console.error(`[ENKA FETCH ERROR] UID ${uid}:`, error);
        throw new Error(`Gagal mengambil data untuk UID ${uid}: ${error.message}`);
      }
    };

    // Helper function untuk parse UID dari argumen
    const parseUIDs = (input) => {
      if (input.includes(',')) {
        return input.split(',').map(u => u.trim()).filter(u => u.length >= 9 && !isNaN(u));
      }
      return [input.trim()];
    };

    // Helper function untuk validasi UID
    const validateUID = (uid) => {
      if (isNaN(uid) || uid.length < 9) {
        return false;
      }
      return true;
    };

    // ==========================================
    // SKENARIO: LIHAT DATA (Tanpa Argumen / Reply)
    // ==========================================
    if (args.length === 0 || args[0] === '-l') {
      // Tentukan target: Orang yang direply ATAU Pengirim pesan
      let targetJid = msg.quoted ? msg.quoted.sender : msg.sender;

      // Ambil data dari database target
      const userData = bot.db.data.users[targetJid];

      // Validasi: Jika tidak ada data atau tidak ada akun
      if (!userData || !userData.genshinAccounts || userData.genshinAccounts.length === 0) {
        if (targetJid === msg.sender) {
          return msg.reply(`❌ Kamu belum menyimpan UID.\n\n*Cara Menyimpan Akun:*\n1. *${usedPrefix}uid <UID>* - Simpan akun baru\n2. *${usedPrefix}uid -t <UID1,UID2>* - Tambah banyak akun\n3. *${usedPrefix}uid -u <UID>* - Update akun terakhir\n\n*Contoh:*\n${usedPrefix}uid 1810856940,823456789`);
        } else {
          return msg.reply("❌ User tersebut belum menyimpan data akun Genshin Impact.");
        }
      }

      const accounts = userData.genshinAccounts;
      const totalAccounts = accounts.length;

      // Jika hanya ada 1 akun, kirim gambar biasa
      if (totalAccounts === 1) {
        const account = accounts[0];
        msg.react("🎨");
        
        try {
          const buffer = await generateProfileImage(account);
          const imageUrl = await uploadImageToServer(buffer);
          
          await bot.sendMessage(msg.from, { 
            image: { url: imageUrl }, 
            caption: `👤 *Genshin Impact Profile*\n\n🏷️ Nickname: ${account.name}\n✨ AR: ${account.ar}\n🆔 UID: ${account.uid}\n\nTotal akun: 1` 
          }, { quoted: msg });
        } catch (error) {
          console.error("[SINGLE PROFILE ERROR]", error);
          msg.reply("Maaf, terjadi kesalahan saat membuat gambar profil.");
        }
        return;
      }

      // Jika lebih dari 1 akun, kirim carousel
      msg.react("🔄");

      try {
        // Siapkan data untuk carousel
        const cardsData = [];
        
        // Generate gambar untuk setiap akun (maksimal 10)
        for (let i = 0; i < Math.min(accounts.length, 10); i++) {
          const account = accounts[i];
          
          try {
            const imageBuffer = await generateProfileImage(account);
            const imageUrl = await uploadImageToServer(imageBuffer);
            
            cardsData.push({
              image: imageUrl,
              title: `${account.name}`,
              body: `Adventure Rank: ${account.ar}`,
              footer: `Akun ${i + 1} dari ${totalAccounts} | UID: ${account.uid}`,
              url: account.uid,
              btnText: "📋 Salin UID"
            });
          } catch (imgError) {
            console.error(`Error generating image for account ${account.uid}:`, imgError);
            // Gunakan gambar fallback
            const fallbackImages = [
              "https://files.catbox.moe/mkna0l.jpeg",
              "https://files.catbox.moe/kz0ier.jpeg",
              "https://files.catbox.moe/rveiuy.jpeg"
            ];
            cardsData.push({
              image: fallbackImages[i % fallbackImages.length],
              title: `${account.name}`,
              body: `Adventure Rank: ${account.ar}`,
              footer: `Akun ${i + 1} dari ${totalAccounts} | UID: ${account.uid}`,
              url: account.uid,
              btnText: "📋 Salin UID"
            });
          }
        }

        // Kirim carousel
        const success = await sendCarousel(cardsData);
        
        if (!success) {
          // Fallback: Kirim data dalam format teks
          let text = `*🎮 Genshin Impact Accounts (${totalAccounts})*\n\n`;
          accounts.forEach((acc, index) => {
            text += `*[${index + 1}]* ${acc.name}\n`;
            text += `├ UID: ${acc.uid}\n`;
            text += `└ AR: ${acc.ar}\n\n`;
          });
          text += `\n*Perintah:*\n`;
          text += `• ${usedPrefix}uid -t <UID1,UID2> - Tambah akun\n`;
          text += `• ${usedPrefix}uid -u <UID> - Update akun terakhir\n`;
          text += `• ${usedPrefix}uid -d <nomor> - Hapus akun\n`;
          
          await bot.sendMessage(msg.from, { text }, { quoted: msg });
        }
        
      } catch (error) {
        console.error("[MULTI ACCOUNT ERROR]", error);
        msg.reply("❌ Gagal menampilkan data akun. Silakan coba lagi.");
      }
      return;
    }

    // ==========================================
    // SKENARIO: TAMBAH AKUN (-t)
    // ==========================================
    if (args[0] === '-t' && args[1]) {
      msg.react("⏳");
      
      const uids = parseUIDs(args[1]);
      if (uids.length === 0) {
        return msg.reply(`⚠️ Format UID tidak valid!\nContoh: *${usedPrefix}uid -t 1810856940,823456789*`);
      }

      // Validasi semua UID
      for (const uid of uids) {
        if (!validateUID(uid)) {
          return msg.reply(`⚠️ UID "${uid}" tidak valid! UID harus 9+ digit angka.`);
        }
      }

      try {
        // Inisialisasi data user jika belum ada
        if (!bot.db.data.users[msg.sender]) {
          bot.db.data.users[msg.sender] = {
            name: msg.pushName || "User",
            afk: -1,
            afkReason: "",
            afkGroups: {},
            genshinAccounts: []
          };
        }
        
        const userData = bot.db.data.users[msg.sender];
        if (!userData.genshinAccounts) {
          userData.genshinAccounts = [];
        }

        const results = [];
        const errors = [];
        const existingUids = userData.genshinAccounts.map(acc => acc.uid);

        // Fetch data untuk setiap UID
        for (const uid of uids) {
          // Cek apakah UID sudah ada
          if (existingUids.includes(uid)) {
            errors.push(`❌ UID ${uid} sudah ada dalam daftar`);
            continue;
          }

          try {
            const accountData = await fetchEnkaData(uid);
            
            // Tambah ke database
            userData.genshinAccounts.push(accountData);
            results.push(`✅ ${accountData.name} (UID: ${uid}, AR: ${accountData.ar})`);
          } catch (error) {
            errors.push(`❌ Gagal fetch UID ${uid}: ${error.message}`);
          }
        }

        // Simpan ke database
        await bot.db.write();

        // Buat laporan
        let report = `*📝 Hasil Penambahan Akun*\n\n`;
        
        if (results.length > 0) {
          report += `*Berhasil Ditambahkan (${results.length}):*\n`;
          report += results.join('\n') + '\n\n';
        }
        
        if (errors.length > 0) {
          report += `*Gagal (${errors.length}):*\n`;
          report += errors.join('\n') + '\n\n';
        }
        
        report += `*Total akun sekarang: ${userData.genshinAccounts.length}*\n`;
        report += `\nKetik *${usedPrefix}uid* untuk melihat semua akun.`;

        await msg.reply(report);
        msg.react("✅");

      } catch (error) {
        console.error("[ADD ACCOUNTS ERROR]", error);
        msg.reply(`❌ Terjadi kesalahan: ${error.message}`);
      }
      return;
    }

    // ==========================================
    // SKENARIO: UPDATE AKUN (-u)
    // ==========================================
    if (args[0] === '-u' && args[1]) {
      const newUid = args[1].trim();
      
      if (!validateUID(newUid)) {
        return msg.reply(`⚠️ UID tidak valid! UID harus 9+ digit angka.\nContoh: *${usedPrefix}uid -u 1810856940*`);
      }

      msg.react("⏳");

      try {
        const userData = bot.db.data.users[msg.sender];
        
        if (!userData || !userData.genshinAccounts || userData.genshinAccounts.length === 0) {
          return msg.reply(`❌ Kamu belum memiliki akun yang bisa diupdate.\nGunakan *${usedPrefix}uid <UID>* untuk menambah akun pertama.`);
        }

        // Ambil akun terakhir (index terakhir)
        const lastIndex = userData.genshinAccounts.length - 1;
        const oldAccount = userData.genshinAccounts[lastIndex];
        
        // Cek jika UID sama dengan yang lama
        if (oldAccount.uid === newUid) {
          return msg.reply(`⚠️ UID sama dengan akun terakhir. Tidak ada perubahan.`);
        }

        // Fetch data baru dari Enka
        const newAccountData = await fetchEnkaData(newUid);
        
        // Update akun terakhir
        userData.genshinAccounts[lastIndex] = newAccountData;
        
        // Simpan ke database
        await bot.db.write();

        await msg.reply(`✅ *Akun Berhasil Diupdate!*\n\n*Sebelum:*\n👤 ${oldAccount.name}\n🆔 ${oldAccount.uid}\n✨ AR ${oldAccount.ar}\n\n*Sesudah:*\n👤 ${newAccountData.name}\n🆔 ${newAccountData.uid}\n✨ AR ${newAccountData.ar}\n\nTotal akun: ${userData.genshinAccounts.length}`);
        msg.react("✅");

      } catch (error) {
        console.error("[UPDATE ACCOUNT ERROR]", error);
        msg.reply(`❌ Gagal update akun: ${error.message}`);
      }
      return;
    }

    // ==========================================
    // SKENARIO: HAPUS AKUN (-d)
    // ==========================================
    if (args[0] === '-d' && args[1]) {
      const index = parseInt(args[1]) - 1;
      
      if (isNaN(index) || index < 0) {
        return msg.reply(`⚠️ Gunakan: *${usedPrefix}uid -d <nomor>*\nContoh: *${usedPrefix}uid -d 1* untuk hapus akun pertama`);
      }

      const userData = bot.db.data.users[msg.sender];
      
      if (!userData || !userData.genshinAccounts || userData.genshinAccounts.length === 0) {
        return msg.reply("❌ Kamu belum menyimpan akun Genshin Impact.");
      }
      
      if (index >= userData.genshinAccounts.length) {
        return msg.reply(`❌ Nomor tidak valid. Kamu hanya punya ${userData.genshinAccounts.length} akun.`);
      }
      
      const deletedAccount = userData.genshinAccounts.splice(index, 1)[0];
      await bot.db.write();
      
      await msg.reply(`✅ *Akun berhasil dihapus!*\n\n👤 Nickname: ${deletedAccount.name}\n🆔 UID: ${deletedAccount.uid}\n✨ AR: ${deletedAccount.ar}\n\nSisa akun: ${userData.genshinAccounts.length}`);
      return;
    }

    // ==========================================
    // SKENARIO: SIMPAN AKUN BARU (Tanpa Flag)
    // Default behavior - simpan satu atau banyak akun
    // ==========================================
    msg.react("⏳");
    
    // Parse UID dari argumen (bisa multiple dengan koma)
    const inputUIDs = parseUIDs(args.join(' '));
    
    if (inputUIDs.length === 0) {
      return msg.reply(`⚠️ Format UID tidak valid!\n\n*Contoh Penggunaan:*\n• ${usedPrefix}uid 1810856940\n• ${usedPrefix}uid 1810856940,823456789\n• ${usedPrefix}uid -t 1810856940,823456789\n• ${usedPrefix}uid -u 823456789\n• ${usedPrefix}uid -d 1`);
    }

    // Validasi semua UID
    for (const uid of inputUIDs) {
      if (!validateUID(uid)) {
        return msg.reply(`⚠️ UID "${uid}" tidak valid! UID harus 9+ digit angka.`);
      }
    }

    try {
      // Inisialisasi data user jika belum ada
      if (!bot.db.data.users[msg.sender]) {
        bot.db.data.users[msg.sender] = {
          name: msg.pushName || "User",
          afk: -1,
          afkReason: "",
          afkGroups: {},
          genshinAccounts: []
        };
      }
      
      const userData = bot.db.data.users[msg.sender];
      if (!userData.genshinAccounts) {
        userData.genshinAccounts = [];
      }

      const results = [];
      const errors = [];
      const existingUids = userData.genshinAccounts.map(acc => acc.uid);

      // Fetch data untuk setiap UID
      for (const uid of inputUIDs) {
        // Cek apakah UID sudah ada
        if (existingUids.includes(uid)) {
          try {
            // Update data yang sudah ada
            const accountData = await fetchEnkaData(uid);
            const existingIndex = userData.genshinAccounts.findIndex(acc => acc.uid === uid);
            
            if (existingIndex !== -1) {
              const oldAccount = userData.genshinAccounts[existingIndex];
              userData.genshinAccounts[existingIndex] = accountData;
              results.push(`🔄 ${accountData.name} (UID: ${uid}) - Diperbarui`);
            }
          } catch (error) {
            errors.push(`❌ Gagal update UID ${uid}: ${error.message}`);
          }
        } else {
          try {
            // Tambah data baru
            const accountData = await fetchEnkaData(uid);
            userData.genshinAccounts.push(accountData);
            results.push(`✅ ${accountData.name} (UID: ${uid}, AR: ${accountData.ar}) - Baru`);
          } catch (error) {
            errors.push(`❌ Gagal fetch UID ${uid}: ${error.message}`);
          }
        }
      }

      // Simpan ke database
      await bot.db.write();

      // Buat laporan
      let report = `*📝 Hasil Penyimpanan Akun*\n\n`;
      
      if (results.length > 0) {
        report += `*Proses Berhasil (${results.length}):*\n`;
        report += results.join('\n') + '\n\n';
      }
      
      if (errors.length > 0) {
        report += `*Gagal (${errors.length}):*\n`;
        report += errors.join('\n') + '\n\n';
      }
      
      report += `*Total akun sekarang: ${userData.genshinAccounts.length}*\n`;
      
      if (userData.genshinAccounts.length === 1) {
        const account = userData.genshinAccounts[0];
        report += `\nKetik *${usedPrefix}uid* untuk melihat profil.`;
      } else if (userData.genshinAccounts.length > 1) {
        report += `\nKetik *${usedPrefix}uid* untuk melihat semua akun dalam carousel.`;
      }
      
      await msg.reply(report);
      msg.react("✅");

    } catch (error) {
      console.error("[SAVE ACCOUNTS ERROR]", error);
      msg.reply(`❌ Terjadi kesalahan: ${error.message}`);
    }
  },
};
