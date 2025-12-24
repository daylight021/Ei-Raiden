const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function playYouTube(query) {
    try {
        const url = `https://api.nekolabs.web.id/downloader/youtube/play/v1?q=${encodeURIComponent(query)}`;
        const response = await axios.get(url);
        const data = response.data;

        if (!data.success) {
            throw new Error('API returned unsuccessful response');
        }

        return data.result;
    } catch (err) {
        throw new Error(`Failed to fetch from API: ${err.message}`);
    }
}

async function downloadAudio(url) {
    try {
        // Download the MP3 file
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const mp3Buffer = Buffer.from(response.data);

        // Create temporary files
        const tempDir = os.tmpdir();
        const inputPath = path.join(tempDir, `input_${Date.now()}.mp3`);
        const outputPath = path.join(tempDir, `output_${Date.now()}.ogg`);

        // Write MP3 to temp file
        fs.writeFileSync(inputPath, mp3Buffer);

        // Convert to OGG Opus using ffmpeg
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .toFormat('ogg')
                .audioCodec('libopus')
                .audioChannels(1) // Mono for voice notes
                .audioFrequency(16000) // 16kHz sample rate
                .audioBitrate('64k') // 64k bitrate
                .on('end', resolve)
                .on('error', reject)
                .save(outputPath);
        });

        // Read the converted OGG file
        const oggBuffer = fs.readFileSync(outputPath);

        // Clean up temp files
        try {
            fs.unlinkSync(inputPath);
            fs.unlinkSync(outputPath);
        } catch (cleanupErr) {
            console.warn('Failed to clean up temp files:', cleanupErr.message);
        }

        return oggBuffer;
    } catch (err) {
        throw new Error(`Failed to download and convert audio: ${err.message}`);
    }
}

module.exports = {
  name: "play",
  alias: ["yts", "youtubesearch", "ytsearch"],
  description: "Play music from YouTube.",
  execute: async (msg, { args, bot, usedPrefix, command }) => {
    const query = args.join(' ');

    if (!query) {
      return msg.reply(`❌ Masukkan kata kunci pencarian musik.\n\nContoh: \`${usedPrefix}${command} minecraft tutorial\``);
    }

    try {
        await msg.react("🎵");
        await msg.reply(`🎵 Mencari musik: *${query}*...\n\nMohon tunggu sebentar.`);
        
        console.log(`[PLAY] Searching for: "${query}"`);
        const result = await playYouTube(query);
        
        console.log(`[PLAY] Found: ${result.metadata.title}`);

        const { metadata, downloadUrl } = result;
        const { title, channel, duration, cover, url } = metadata;

        // Download the audio
        const audioBuffer = await downloadAudio(downloadUrl);

        // Send as voice note
        await bot.sendMessage(
            msg.from,
            {
                audio: audioBuffer,
                mimetype: "audio/ogg; codecs=opus",
                ptt: true,
                contextInfo: {
                    externalAdReply: {
                        title,
                        body: channel,
                        thumbnailUrl: cover,
                        mediaUrl: url,
                        mediaType: 2,
                        renderLargerThumbnail: true,
                    },
                },
            },
            { quoted: msg }
        );

        await msg.react("✅");

    } catch (err) {
      console.error("Proses play gagal:", err);
      await msg.react("⚠️");
      return msg.reply(`❌ Gagal memainkan musik.\n\n*Alasan:* ${err.message}`);
    }
  },
};
