/**
 * Welcome Message Helper - Fixed Version
 * - GIF stays as GIF (no conversion to MP4)
 * - MP4 converted to GIF for autoplay/loop
 * - Separate database for welcome messages
 */

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { fileTypeFromBuffer } = require('file-type');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

// LowDB for separate welcome database
var low;
try {
  low = require("lowdb");
} catch {
  low = require("./lowdb");
}
const { Low, JSONFile } = low;

class WelcomeHelper {
  constructor(bot) {
    this.bot = bot;
    this.mediaDir = path.join(__dirname, '..', 'data', 'welcome_media');
    this.dbPath = path.join(__dirname, '..', 'data', 'welcome_database.json');
    this.ensureDirectories();
    
    // Initialize database synchronously if possible
    this.db = null;
    this.dbReady = false;
    this.initPromise = this.initDatabase();
  }

  ensureDirectories() {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.mediaDir)) {
      fs.mkdirSync(this.mediaDir, { recursive: true });
    }
  }

  async initDatabase() {
    try {
      this.db = new Low(new JSONFile(this.dbPath));
      await this.db.read();
      
      if (!this.db.data) {
        this.db.data = { groups: {} };
        await this.db.write();
        console.log('[WELCOME_HELPER] ✅ Welcome database initialized');
      }
      
      this.dbReady = true;
      return true;
    } catch (error) {
      console.error('[WELCOME_HELPER] ❌ Database error:', error);
      this.db.data = { groups: {} };
      try {
        await this.db.write();
        this.dbReady = true;
      } catch (writeError) {
        console.error('[WELCOME_HELPER] ❌ Failed to write database:', writeError);
        this.dbReady = false;
      }
      return false;
    }
  }

  /**
   * Ensure database is ready before operations
   */
  async ensureDatabase() {
    // Wait for initial database load if still in progress
    if (!this.dbReady) {
      console.log('[WELCOME_HELPER] ⏳ Waiting for database to initialize...');
      await this.initPromise;
    }
    
    if (!this.db || !this.db.data) {
      console.log('[WELCOME_HELPER] 🔄 Database not ready, re-initializing...');
      await this.initDatabase();
    }
    
    if (!this.db.data) {
      this.db.data = { groups: {} };
    }
    
    if (!this.db.data.groups) {
      this.db.data.groups = {};
    }
  }

  /**
   * Convert GIF to MP4 video using ffmpeg
   * Optimized for WhatsApp with target size < 1MB
   * @param {Buffer} gifBuffer - GIF buffer
   * @param {string} outputPath - Output path for MP4
   * @returns {Promise<boolean>} - Success status
   */
  async convertGifToMp4(gifBuffer, outputPath) {
    const tempGifPath = path.join(this.mediaDir, `temp_${Date.now()}.gif`);

    try {
      // Save GIF temporarily
      fs.writeFileSync(tempGifPath, gifBuffer);

      // Convert GIF to MP4 with aggressive compression for <1MB
      // -movflags faststart: Optimize for streaming
      // -pix_fmt yuv420p: Ensure compatibility
      // -vf scale: Max 320px width for small size
      // -crf 28: Higher compression (lower quality but smaller size)
      // -preset veryfast: Fast encoding
      const ffmpegCmd = `ffmpeg -i "${tempGifPath}" -movflags faststart -pix_fmt yuv420p -vf "scale='min(320,iw)':'min(320,ih)':force_original_aspect_ratio=decrease,fps=10" -c:v libx264 -preset veryfast -crf 28 -an "${outputPath}" -y`;

      console.log('[WELCOME_HELPER] 🎨 Converting GIF to MP4...');
      await execPromise(ffmpegCmd);

      // Clean up temp file
      if (fs.existsSync(tempGifPath)) {
        fs.unlinkSync(tempGifPath);
      }

      // Check file size
      const stats = fs.statSync(outputPath);
      const sizeMB = stats.size / (1024 * 1024);
      console.log(`[WELCOME_HELPER] ✅ GIF converted to MP4: ${(stats.size / 1024).toFixed(2)} KB`);

      // If still > 1MB, compress more aggressively
      if (stats.size > 1024 * 1024) {
        console.log('[WELCOME_HELPER] ⚠️ File > 1MB, compressing further...');
        const tempMp4 = `${outputPath}.tmp`;
        fs.renameSync(outputPath, tempMp4);

        // More aggressive: 240px, crf 32, fps 8
        const ffmpegCmd2 = `ffmpeg -i "${tempMp4}" -movflags faststart -pix_fmt yuv420p -vf "scale='min(240,iw)':'min(240,ih)':force_original_aspect_ratio=decrease,fps=8" -c:v libx264 -preset veryfast -crf 32 -an "${outputPath}" -y`;
        
        await execPromise(ffmpegCmd2);
        fs.unlinkSync(tempMp4);

        const newStats = fs.statSync(outputPath);
        console.log(`[WELCOME_HELPER] ✅ Further compressed: ${(newStats.size / 1024).toFixed(2)} KB`);
      }

      return true;

    } catch (error) {
      console.error('[WELCOME_HELPER] ❌ Error converting GIF to MP4:', error);

      // Clean up temp file on error
      if (fs.existsSync(tempGifPath)) {
        fs.unlinkSync(tempGifPath);
      }

      return false;
    }
  }

  /**
   * Optimize MP4 video to ensure size < 1MB
   * @param {Buffer} videoBuffer - Video buffer
   * @param {string} outputPath - Output path for optimized MP4
   * @returns {Promise<boolean>} - Success status
   */
  async optimizeMp4ForWhatsApp(videoBuffer, outputPath) {
    const tempVideoPath = path.join(this.mediaDir, `temp_${Date.now()}.mp4`);

    try {
      // Save video temporarily
      fs.writeFileSync(tempVideoPath, videoBuffer);

      // Check original size
      const originalSize = videoBuffer.length;
      const originalMB = originalSize / (1024 * 1024);
      console.log(`[WELCOME_HELPER] 📊 Original video size: ${originalMB.toFixed(2)} MB`);

      // If already < 1MB, just copy
      if (originalSize < 1024 * 1024) {
        fs.copyFileSync(tempVideoPath, outputPath);
        fs.unlinkSync(tempVideoPath);
        console.log('[WELCOME_HELPER] ✅ Video already < 1MB, no optimization needed');
        return true;
      }

      // Optimize: 320px max, 10fps, crf 28
      const ffmpegCmd = `ffmpeg -i "${tempVideoPath}" -movflags faststart -pix_fmt yuv420p -vf "scale='min(320,iw)':'min(320,ih)':force_original_aspect_ratio=decrease,fps=10" -c:v libx264 -preset veryfast -crf 28 -an "${outputPath}" -y`;

      console.log('[WELCOME_HELPER] 🔧 Optimizing MP4 for WhatsApp...');
      await execPromise(ffmpegCmd);

      // Clean up temp file
      if (fs.existsSync(tempVideoPath)) {
        fs.unlinkSync(tempVideoPath);
      }

      // Check output size
      const stats = fs.statSync(outputPath);
      const sizeMB = stats.size / (1024 * 1024);
      console.log(`[WELCOME_HELPER] ✅ MP4 optimized: ${(stats.size / 1024).toFixed(2)} KB`);

      // If still > 1MB, compress more
      if (stats.size > 1024 * 1024) {
        console.log('[WELCOME_HELPER] ⚠️ Still > 1MB, compressing further...');
        const tempOpt = `${outputPath}.tmp`;
        fs.renameSync(outputPath, tempOpt);

        // More aggressive: 240px, fps 8, crf 32
        const ffmpegCmd2 = `ffmpeg -i "${tempOpt}" -movflags faststart -pix_fmt yuv420p -vf "scale='min(240,iw)':'min(240,ih)':force_original_aspect_ratio=decrease,fps=8" -c:v libx264 -preset veryfast -crf 32 -an "${outputPath}" -y`;
        
        await execPromise(ffmpegCmd2);
        fs.unlinkSync(tempOpt);

        const newStats = fs.statSync(outputPath);
        console.log(`[WELCOME_HELPER] ✅ Further compressed: ${(newStats.size / 1024).toFixed(2)} KB`);
      }

      return true;

    } catch (error) {
      console.error('[WELCOME_HELPER] ❌ Error optimizing MP4:', error);

      if (fs.existsSync(tempVideoPath)) {
        fs.unlinkSync(tempVideoPath);
      }

      return false;
    }
  }

  /**
   * Download media from message
   */
  async downloadMedia(messageContent, mediaType, isDocument = false) {
    try {
      console.log(`[WELCOME_HELPER] 📥 Downloading ${mediaType}... (isDocument: ${isDocument})`);

      let mediaMessage = messageContent;

      // Handle wrappers
      if (mediaMessage.ephemeralMessage?.message) {
        mediaMessage = mediaMessage.ephemeralMessage.message;
      }
      if (mediaMessage.documentWithCaptionMessage?.message) {
        mediaMessage = mediaMessage.documentWithCaptionMessage.message;
      }

      let mediaContent;
      let downloadType;

      if (isDocument) {
        mediaContent = mediaMessage.documentMessage || mediaMessage;
        downloadType = 'document';
      } else {
        if (mediaType === 'image') {
          mediaContent = mediaMessage.imageMessage;
          downloadType = 'image';
        } else if (mediaType === 'video') {
          mediaContent = mediaMessage.videoMessage;
          downloadType = 'video';
        }
      }

      if (!mediaContent) {
        throw new Error(`No ${mediaType} content found in message`);
      }

      const stream = await downloadContentFromMessage(mediaContent, downloadType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      if (!buffer || buffer.length === 0) {
        throw new Error('Downloaded buffer is empty');
      }

      const fileType = await fileTypeFromBuffer(buffer);
      console.log(`[WELCOME_HELPER] ✅ Downloaded: ${buffer.length} bytes, type:`, fileType);

      return { buffer, fileType, originalMedia: mediaContent };

    } catch (error) {
      console.error('[WELCOME_HELPER] ❌ Download error:', error);
      throw error;
    }
  }

  /**
   * Save media locally with proper handling
   * NEW STRATEGY:
   * - MP4/Video: Keep as MP4, optimize to <1MB
   * - GIF: Convert to MP4, optimize to <1MB
   */
  async saveMediaLocally(messageContent, mediaType, isDocument = false) {
    try {
      console.log(`[WELCOME_HELPER] 💾 Saving ${mediaType} media... (isDocument: ${isDocument})`);

      const downloadResult = await this.downloadMedia(messageContent, mediaType, isDocument);
      const buffer = downloadResult.buffer;
      const fileType = downloadResult.fileType;

      let extension = 'bin';
      let finalBuffer = buffer;
      let savedPath = null;
      let finalMimetype = 'application/octet-stream';

      if (!fileType) {
        console.warn('[WELCOME_HELPER] ⚠️ Unknown file type, saving as binary');
        const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.bin`;
        savedPath = path.join(this.mediaDir, filename);
        fs.writeFileSync(savedPath, buffer);
        
        return {
          type: 'video',
          path: savedPath,
          filename: path.basename(savedPath),
          size: buffer.length,
          mimetype: 'application/octet-stream',
          extension: 'bin'
        };
      }

      extension = fileType.ext;
      const isGif = fileType.mime === 'image/gif';
      const isVideo = fileType.mime?.startsWith('video/');

      console.log(`[WELCOME_HELPER] 📊 Detected - mime: ${fileType.mime}, ext: ${extension}, isGif: ${isGif}, isVideo: ${isVideo}`);
      console.log(`[WELCOME_HELPER] 📊 Original size: ${(buffer.length / 1024).toFixed(2)} KB`);

      // NEW STRATEGY: GIF → MP4, Video → Optimized MP4
      if (isGif) {
        // ✅ Convert GIF to MP4
        console.log('[WELCOME_HELPER] 🎨 GIF detected - converting to MP4...');
        const mp4Filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
        const mp4Path = path.join(this.mediaDir, mp4Filename);

        const converted = await this.convertGifToMp4(buffer, mp4Path);

        if (converted && fs.existsSync(mp4Path)) {
          finalBuffer = fs.readFileSync(mp4Path);
          savedPath = mp4Path;
          extension = 'mp4';
          finalMimetype = 'video/mp4';
          console.log('[WELCOME_HELPER] ✅ GIF converted to MP4 successfully');
        } else {
          // Fallback: Save original GIF
          console.log('[WELCOME_HELPER] ⚠️ FFmpeg failed, saving original GIF');
          const gifFilename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.gif`;
          savedPath = path.join(this.mediaDir, gifFilename);
          fs.writeFileSync(savedPath, buffer);
          finalBuffer = buffer;
          extension = 'gif';
          finalMimetype = 'image/gif';
        }
        
      } else if (isVideo) {
        // ✅ Optimize MP4 to < 1MB
        console.log('[WELCOME_HELPER] 🎬 Video detected - optimizing to <1MB...');
        const mp4Filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
        const mp4Path = path.join(this.mediaDir, mp4Filename);

        const optimized = await this.optimizeMp4ForWhatsApp(buffer, mp4Path);

        if (optimized && fs.existsSync(mp4Path)) {
          finalBuffer = fs.readFileSync(mp4Path);
          savedPath = mp4Path;
          extension = 'mp4';
          finalMimetype = 'video/mp4';
          console.log('[WELCOME_HELPER] ✅ Video optimized successfully');
        } else {
          // Fallback: Save original
          console.log('[WELCOME_HELPER] ⚠️ Optimization failed, saving original video');
          const videoFilename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${extension}`;
          savedPath = path.join(this.mediaDir, videoFilename);
          fs.writeFileSync(savedPath, buffer);
          finalBuffer = buffer;
          finalMimetype = fileType.mime;
        }
        
      } else {
        // Regular image (jpg, png, etc) - not supported for welcome
        console.log('[WELCOME_HELPER] 🖼️ Regular image detected - not supported for animated welcome');
        const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${extension}`;
        savedPath = path.join(this.mediaDir, filename);
        fs.writeFileSync(savedPath, buffer);
        finalBuffer = buffer;
        finalMimetype = fileType.mime || 'image/jpeg';
      }

      const finalSizeKB = finalBuffer.length / 1024;
      const finalSizeMB = finalBuffer.length / (1024 * 1024);
      
      console.log(`[WELCOME_HELPER] ✅ Media saved: ${path.basename(savedPath)}`);
      console.log(`[WELCOME_HELPER] 📊 Final size: ${finalSizeKB.toFixed(2)} KB (${finalSizeMB.toFixed(3)} MB)`);
      
      if (finalBuffer.length > 1024 * 1024) {
        console.warn(`[WELCOME_HELPER] ⚠️ WARNING: File size (${finalSizeKB.toFixed(2)} KB) exceeds 1MB target!`);
      }

      return {
        type: 'video', // Always treat as video for gifPlayback
        path: savedPath,
        filename: path.basename(savedPath),
        size: finalBuffer.length,
        mimetype: finalMimetype,
        extension: extension
      };

    } catch (error) {
      console.error('[WELCOME_HELPER] ❌ Error saving media:', error);
      return null;
    }
  }

  /**
   * Get welcome message for a group
   */
  getWelcomeMessage(groupId) {
    try {
      // Ensure database is ready
      if (!this.db || !this.db.data || !this.db.data.groups) {
        console.warn('[WELCOME_HELPER] ⚠️ Database not ready for get, using default');
        return {
          text: `🎉 Selamat Datang di grup *{groupName}*!\n\nHi {user}, semoga betah yaa! 🤗 if you need something, just tag the admin, don't be shy :3 dan Jangan lupa baca deskripsi grup.`,
          media: null
        };
      }
      
      const groupData = this.db.data.groups[groupId];
      if (groupData && groupData.welcomeMessage) {
        return groupData.welcomeMessage;
      }
      return {
        text: `🎉 Selamat Datang di grup *{groupName}*!\n\nHi {user}, semoga betah yaa! 🤗 if you need something, just tag the admin, don't be shy :3 dan Jangan lupa baca deskripsi grup.`,
        media: null
      };
    } catch (error) {
      console.error('[WELCOME_HELPER] Error getting welcome message:', error);
      return {
        text: 'Welcome to the group!',
        media: null
      };
    }
  }

  /**
   * Set welcome message for a group
   */
  async setWelcomeMessage(groupId, text, messageContent = null, mediaType = null, isDocument = false) {
    try {
      // Ensure database is ready
      await this.ensureDatabase();
      
      if (!this.db.data.groups[groupId]) {
        this.db.data.groups[groupId] = {};
      }

      // Delete old media if exists
      const oldData = this.db.data.groups[groupId].welcomeMessage;
      if (oldData && oldData.media && oldData.media.path) {
        if (fs.existsSync(oldData.media.path)) {
          try {
            fs.unlinkSync(oldData.media.path);
            console.log('[WELCOME_HELPER] 🗑️ Deleted old media:', oldData.media.filename);
          } catch (unlinkError) {
            console.error('[WELCOME_HELPER] ⚠️ Failed to delete old media:', unlinkError);
          }
        }
      }

      let savedMedia = null;
      if (messageContent && mediaType) {
        console.log('[WELCOME_HELPER] 📸 Processing media for welcome message...');
        savedMedia = await this.saveMediaLocally(messageContent, mediaType, isDocument);

        if (savedMedia) {
          console.log('[WELCOME_HELPER] ✅ Media saved:', savedMedia.filename);
        } else {
          console.error('[WELCOME_HELPER] ❌ Failed to save media');
        }
      }

      this.db.data.groups[groupId].welcomeMessage = {
        text: text,
        media: savedMedia
      };

      await this.db.write();
      console.log('[WELCOME_HELPER] ✅ Welcome message saved to database');
      return true;
    } catch (error) {
      console.error('[WELCOME_HELPER] Error setting welcome message:', error);
      console.error('[WELCOME_HELPER] Stack trace:', error.stack);
      return false;
    }
  }

  /**
   * Delete welcome message for a group
   */
  async deleteWelcomeMessage(groupId) {
    try {
      // Ensure database is ready
      await this.ensureDatabase();
      
      if (this.db.data.groups[groupId] && this.db.data.groups[groupId].welcomeMessage) {
        const media = this.db.data.groups[groupId].welcomeMessage.media;
        if (media && media.path && fs.existsSync(media.path)) {
          try {
            fs.unlinkSync(media.path);
            console.log('[WELCOME_HELPER] 🗑️ Deleted media file:', media.filename);
          } catch (unlinkError) {
            console.error('[WELCOME_HELPER] ⚠️ Failed to delete media:', unlinkError);
          }
        }

        delete this.db.data.groups[groupId].welcomeMessage;
        await this.db.write();
        console.log('[WELCOME_HELPER] ✅ Welcome message deleted from database');
        return true;
      }
      return false;
    } catch (error) {
      console.error('[WELCOME_HELPER] Error deleting welcome message:', error);
      return false;
    }
  }

  /**
   * Format message with placeholders
   */
  formatMessage(text, groupName, userMention) {
    return text
      .replace(/{groupName}/g, groupName)
      .replace(/{user}/g, userMention.startsWith('@') ? userMention : `@${userMention}`);
  }
}

module.exports = WelcomeHelper;