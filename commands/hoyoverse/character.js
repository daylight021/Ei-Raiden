const fs = require("fs");
const axios = require("axios");
const path = require("path");
const sharp = require("sharp");

// Load database dari file JSON
const DB_PATH = path.join(__dirname, "../../lib/char/characterDB.json");
let DISCORD_IMAGE_DB = {};

// Load database saat pertama kali
try {
  DISCORD_IMAGE_DB = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  console.log(`Loaded ${Object.keys(DISCORD_IMAGE_DB).length} characters from database`);
} catch (error) {
  console.error("Error loading character database:", error.message);
  console.log("Creating empty database...");
  DISCORD_IMAGE_DB = {};
}

/**
 * Fungsi untuk reload database (tanpa restart bot)
 */
function reloadDatabase() {
  try {
    const data = fs.readFileSync(DB_PATH, "utf8");
    DISCORD_IMAGE_DB = JSON.parse(data);
    console.log(`Reloaded ${Object.keys(DISCORD_IMAGE_DB).length} characters`);
    return true;
  } catch (error) {
    console.error("Error reloading database:", error.message);
    return false;
  }
}

/**
 * Normalisasi nama character untuk pencarian
 */
function normalizeCharacterName(name) {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Fungsi untuk format nama character dengan kapital di awal kata
 */
function formatCharacterName(name) {
  return name
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Fungsi untuk menghitung similarity antara dua string (Levenshtein distance sederhana)
 */
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  // Hitung similarity berdasarkan common characters
  const longerChars = longer.split('');
  const shorterChars = shorter.split('');
  
  const commonChars = shorterChars.filter(char => longerChars.includes(char));
  const similarity = commonChars.length / Math.max(longer.length, shorter.length);
  
  return similarity;
}

/**
 * Fungsi untuk mencari gambar character dari database dengan fuzzy matching
 */
function findCharacterImage(characterName) {
  const normalizedInput = normalizeCharacterName(characterName);
  
  // Cek exact match dulu
  for (const [dbName, url] of Object.entries(DISCORD_IMAGE_DB)) {
    const normalizedDbName = normalizeCharacterName(dbName);
    if (normalizedInput === normalizedDbName) {
      return url;
    }
  }
  
  // Jika tidak exact match, cari dengan similarity
  let bestMatch = null;
  let highestSimilarity = 0;
  
  for (const [dbName, url] of Object.entries(DISCORD_IMAGE_DB)) {
    const normalizedDbName = normalizeCharacterName(dbName);
    
    // Hitung similarity
    const similarity = calculateSimilarity(normalizedInput, normalizedDbName);
    
    // Jika similarity tinggi (minimal 60%), consider sebagai match
    if (similarity > 0.6 && similarity > highestSimilarity) {
      highestSimilarity = similarity;
      bestMatch = url;
    }
    
    // Juga cek partial match untuk kata individual
    const inputWords = normalizedInput.split(' ');
    const dbWords = normalizedDbName.split(' ');
    
    for (const inputWord of inputWords) {
      for (const dbWord of dbWords) {
        const wordSimilarity = calculateSimilarity(inputWord, dbWord);
        if (wordSimilarity > 0.7 && wordSimilarity > highestSimilarity) {
          highestSimilarity = wordSimilarity;
          bestMatch = url;
        }
      }
    }
  }
  
  return bestMatch;
}

/**
 * Fungsi untuk mencari suggestion character
 */
function findCharacterSuggestions(characterName) {
  const normalizedInput = normalizeCharacterName(characterName);
  const suggestions = [];
  
  for (const dbName of Object.keys(DISCORD_IMAGE_DB)) {
    const normalizedDbName = normalizeCharacterName(dbName);
    
    // Cek similarity
    const similarity = calculateSimilarity(normalizedInput, normalizedDbName);
    if (similarity > 0.4) {
      suggestions.push({ name: dbName, similarity });
      continue;
    }
    
    // Cek word-based similarity
    const inputWords = normalizedInput.split(' ');
    const dbWords = normalizedDbName.split(' ');
    
    let maxWordSimilarity = 0;
    for (const inputWord of inputWords) {
      for (const dbWord of dbWords) {
        const wordSimilarity = calculateSimilarity(inputWord, dbWord);
        if (wordSimilarity > maxWordSimilarity) {
          maxWordSimilarity = wordSimilarity;
        }
      }
    }
    
    if (maxWordSimilarity > 0.6) {
      suggestions.push({ name: dbName, similarity: maxWordSimilarity });
    }
  }
  
  // Sort by similarity (highest first) dan ambil top 5
  return suggestions
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)
    .map(item => formatCharacterName(item.name));
}

/**
 * Fungsi untuk kompres gambar berdasarkan ukuran dengan target 1MB - 2MB
 */
async function smartCompressImage(url) {
  try {
    // Download gambar original
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
    });
    
    const originalBuffer = Buffer.from(response.data);
    const originalSizeMB = originalBuffer.length / 1024 / 1024;
    
    console.log(`📊 Original size: ${originalSizeMB.toFixed(2)}MB`);
    
    // LOGIKA KOMPRESI BERDASARKAN UKURAN ASLI:
    
    // 1. Jika gambar > 15MB - Kompres dengan target 500KB-1MB
    if (originalSizeMB > 15) {
      console.log("🔄 Compressing: >15MB (Target 500KB-1MB)");
      let compressed = await sharp(originalBuffer)
        .resize(1800, null, { withoutEnlargement: true, fit: 'inside' })
        .jpeg({ quality: 90, progressive: true, mozjpeg: true })
        .toBuffer();

      let sizeKB = compressed.length / 1024;
      console.log(`📊 Initial compressed size: ${sizeKB.toFixed(2)}KB`);

      // Iteratively adjust quality to reach 500KB-1MB range
      let quality = 90;
      while (sizeKB > 1024 && quality > 50) { // Max 1MB, min quality 50
        quality -= 5;
        compressed = await sharp(originalBuffer)
          .resize(1800, null, { withoutEnlargement: true, fit: 'inside' })
          .jpeg({ quality, progressive: true, mozjpeg: true })
          .toBuffer();
        sizeKB = compressed.length / 1024;
        console.log(`🔄 Adjusted quality to ${quality}, size: ${sizeKB.toFixed(2)}KB`);
      }

      while (sizeKB < 500 && quality < 100) { // Min 500KB, max quality 100
        quality += 5;
        compressed = await sharp(originalBuffer)
          .resize(1800, null, { withoutEnlargement: true, fit: 'inside' })
          .jpeg({ quality, progressive: true, mozjpeg: true })
          .toBuffer();
        sizeKB = compressed.length / 1024;
        console.log(`🔄 Adjusted quality to ${quality}, size: ${sizeKB.toFixed(2)}KB`);
      }

      console.log(`✅ Final compressed to: ${(compressed.length / 1024 / 1024).toFixed(2)}MB (${sizeKB.toFixed(2)}KB)`);
      return compressed;
    }
    
    // 2. Jika gambar > 10MB - Kompres medium
    if (originalSizeMB > 10) {
      console.log("🔄 Compressing: >10MB (Medium)");
      const compressed = await sharp(originalBuffer)
        .resize(1200, null, { withoutEnlargement: true, fit: 'inside' })
        .jpeg({ quality: 80, progressive: true, mozjpeg: true })
        .toBuffer();
      console.log(`✅ Compressed to: ${(compressed.length / 1024 / 1024).toFixed(2)}MB`);
      return compressed;
    }
    
    // 3. Jika gambar > 5MB - Kompres ringan
    if (originalSizeMB > 5) {
      console.log("🔄 Compressing: >5MB (Light)");
      const compressed = await sharp(originalBuffer)
        .resize(1400, null, { withoutEnlargement: true, fit: 'inside' })
        .jpeg({ quality: 85, progressive: true, mozjpeg: true })
        .toBuffer();
      console.log(`✅ Compressed to: ${(compressed.length / 1024 / 1024).toFixed(2)}MB`);
      return compressed;
    }
    
    // 4. Jika gambar > 2MB - Optimasi ringan
    if (originalSizeMB > 2) {
      console.log("🔄 Optimizing: >2MB (Very Light)");
      const optimized = await sharp(originalBuffer)
        .resize(1600, null, { withoutEnlargement: true, fit: 'inside' })
        .jpeg({ quality: 90, progressive: true, mozjpeg: true })
        .toBuffer();
      console.log(`✅ Optimized to: ${(optimized.length / 1024 / 1024).toFixed(2)}MB`);
      return optimized;
    }
    
    // 5. Jika gambar < 1MB - TINGKATKAN kualitas dan ukuran
    if (originalSizeMB < 1) {
      console.log("🔄 Enhancing: <1MB (Increasing quality)");
      const metadata = await sharp(originalBuffer).metadata();
      
      // Naikkan resolution dan quality untuk gambar kecil
      const enhanced = await sharp(originalBuffer)
        .resize(Math.min(metadata.width * 1.5, 1800), null, { 
          withoutEnlargement: false, 
          fit: 'inside' 
        })
        .jpeg({ 
          quality: 95, 
          progressive: true, 
          mozjpeg: true 
        })
        .toBuffer();
      
      console.log(`✅ Enhanced to: ${(enhanced.length / 1024 / 1024).toFixed(2)}MB`);
      
      // Jika masih kecil, coba lagi dengan setting lebih tinggi
      if (enhanced.length / 1024 / 1024 < 1) {
        console.log("🔄 Further enhancing...");
        const furtherEnhanced = await sharp(originalBuffer)
          .resize(Math.min(metadata.width * 2, 2000), null, { 
            withoutEnlargement: false, 
            fit: 'inside' 
          })
          .jpeg({ 
            quality: 98, 
            progressive: true, 
            mozjpeg: true 
          })
          .toBuffer();
        console.log(`✅ Further enhanced to: ${(furtherEnhanced.length / 1024 / 1024).toFixed(2)}MB`);
        return furtherEnhanced;
      }
      
      return enhanced;
    }
    
    // 6. Jika gambar antara 1MB - 2MB - Perfect! Kirim as-is dengan optimasi minimal
    console.log("✅ Perfect size: 1MB-2MB (Minimal optimization)");
    const optimized = await sharp(originalBuffer)
      .jpeg({ quality: 92, progressive: true, mozjpeg: true })
      .toBuffer();
    console.log(`✅ Final size: ${(optimized.length / 1024 / 1024).toFixed(2)}MB`);
    return optimized;
    
  } catch (error) {
    console.error("❌ Error in smartCompressImage:", error.message);
    throw error;
  }
}

module.exports = {
  name: "character",
  alias: ["char"],
  description: "Get character builds (HSR/Genshin)",
  execute: async (msg, { bot, args }) => {
    let text = args.join(" ");
    msg.react("⚡");

    if (!text) return msg.reply("Insert the character?");

    // Special command untuk reload database
    if (text.toLowerCase() === "reload" || text.toLowerCase() === "refresh") {
      const success = reloadDatabase();
      if (success) {
        return msg.reply(`✅ Database reloaded!\n📊 Total characters: ${Object.keys(DISCORD_IMAGE_DB).length}`);
      } else {
        return msg.reply("❌ Failed to reload database!");
      }
    }

    // Special command untuk list characters
    if (text.toLowerCase() === "list") {
      const chars = Object.keys(DISCORD_IMAGE_DB);
      if (chars.length === 0) {
        return msg.reply("Database kosong. Tambahkan character di characterDB.json!");
      }
      
      // Urutkan character sesuai abjad (ascending) dan format dengan kapital di awal kata
      const sortedChars = chars
        .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
        .map(char => formatCharacterName(char));
      
      // Format list dengan poin-poin
      const charList = sortedChars.map(char => `• ${char}`).join('\n');
      return msg.reply(`📋 Available characters (${chars.length}):\n\n${charList}`);
    }

    // Default: Cari gambar dari Discord CDN
    try {
      const imageUrl = findCharacterImage(text);

      if (imageUrl) {
        msg.react("🔍");

        console.log(`🔍 Processing character: ${text}`);
        console.log(`🌐 Image URL: ${imageUrl}`);

        // Proses gambar dengan logika kompresi yang pintar
        const processedBuffer = await smartCompressImage(imageUrl);

        // Simpan ke file sementara
        const tempPath = path.join(__dirname, '../../temp/`temp_${Date.now()}.jpg`');
        fs.writeFileSync(tempPath, processedBuffer);

        const finalSizeMB = (processedBuffer.length / 1024 / 1024).toFixed(2);
        
        await bot.sendMessage(msg.from, {
          image: { url: tempPath },
          caption: `${process.env.stickerAuthor}\n\n📝 Character: ${formatCharacterName(text)}`,
        });

        // Hapus file sementara
        fs.unlinkSync(tempPath);
        msg.react("✅");

      } else {
        // Character tidak ditemukan di database
        const suggestions = findCharacterSuggestions(text);

        let suggestionText = "";
        if (suggestions.length > 0) {
          suggestionText = `\n\n🔍 Mungkin maksud kamu:\n${suggestions.map(char => `• ${char}`).join('\n')}`;
        }

        msg.reply(
          `Hmm... Character "${formatCharacterName(text)}" tidak ditemukan.\n\n` +
          `💡 Gunakan: .char list untuk melihat daftar character${suggestionText}\n\n` +
          `⚠️ Atau laporkan ke owner untuk menambahkan character baru!`
        );
      }
    } catch (error) {
      console.error("❌ Error executing character command:", error);
      msg.reply(
        `Terjadi error saat memproses gambar: ${error.message}\n\n` +
        `Silakan coba lagi atau laporkan ke owner.`
      );
    }
  },
};