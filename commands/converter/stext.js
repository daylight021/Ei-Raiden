const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { createCanvas, loadImage, registerFont } = require('canvas');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');

const fontsDir = path.join(__dirname, '../../lib/fonts');

function listAvailableFonts() {
    if (!fs.existsSync(fontsDir)) return [];
    return fs.readdirSync(fontsDir)
        .filter(file => /\.(ttf|otf)$/i.test(file))
        .map(file => {
            const name = path.parse(file).name.toLowerCase();
            return { name, file };
        });
}

function formatText(text) {
    const words = text.trim().split(/\s+/);
    const lines = [];
    let i = 0;
    
    while (i < words.length) {
        const currentWord = words[i];
        
        if (/,$/.test(currentWord)) {
            lines.push([currentWord]);
            i++;
        } else if (i + 1 < words.length) {
            lines.push([currentWord, words[i + 1]]);
            i += 2;
        } else {
            lines.push([currentWord]);
            i++;
        }
    }
    
    return lines;
}

async function generateImageWithCanvas(text, fontName, transparent = false) {
    const lines = formatText(text);
    const lineCount = lines.length;
    const fontSize = lineCount > 6 ? 28 : lineCount > 4 ? 36 : 44;
    const lineHeight = fontSize * 1.5;

    let maxWidth = 0;
    let totalHeight = 0;

    const charWidth = fontSize * 0.6;
    lines.forEach(lineWords => {
        if (lineWords.length === 2) {
            const width1 = lineWords[0].length * charWidth;
            const width2 = lineWords[1].length * charWidth;
            const lineWidth = width1 + 20 + width2;
            maxWidth = Math.max(maxWidth, lineWidth);
        } else {
            const lineWidth = lineWords[0].length * charWidth;
            maxWidth = Math.max(maxWidth, lineWidth);
        }
        totalHeight += lineHeight;
    });

    const padding = 20;
    const width = Math.max(200, Math.ceil(maxWidth + padding * 2));
    const height = Math.max(200, Math.ceil(totalHeight + padding * 2));

    // Create canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Set background
    if (!transparent) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
    }

    // Register and set font
    let fontFamily = 'Arial';
    if (fontName) {
        const fonts = listAvailableFonts();
        const matchedFont = fonts.find(f => f.name === fontName.toLowerCase());
        if (matchedFont) {
            const fontPath = path.join(fontsDir, matchedFont.file);
            if (fs.existsSync(fontPath)) {
                try {
                    // Use unique font family name for each font to avoid conflicts
                    const uniqueFontFamily = `Font_${fontName.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    registerFont(fontPath, { family: uniqueFontFamily });
                    fontFamily = uniqueFontFamily;
                } catch (error) {
                    console.warn(`Failed to register font ${fontName}:`, error.message);
                }
            }
        }
    }

    // Set font properties
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = transparent ? '#ffffff' : '#333333';
    ctx.textAlign = 'start';
    ctx.textBaseline = 'top';

    // Draw text
    lines.forEach((lineWords, index) => {
        const y = padding + index * lineHeight;

        if (lineWords.length === 2) {
            // Two words: first at start, second at end
            ctx.textAlign = 'start';
            ctx.fillText(lineWords[0], padding, y);

            ctx.textAlign = 'end';
            ctx.fillText(lineWords[1], width - padding, y);
        } else {
            // Single word: centered or at start
            ctx.textAlign = 'start';
            ctx.fillText(lineWords[0], padding, y);
        }
    });

    // Add stroke for transparent mode
    if (transparent) {
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.strokeText(text, padding, padding);
    }

    return canvas.toBuffer('image/png');
}

function escapeXml(text) {
    return text.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;')
               .replace(/"/g, '&quot;')
               .replace(/'/g, '&apos;');
}

async function generateFontPreviewImage(fonts, maxPerPage = 10, page = 1) {
    const start = (page - 1) * maxPerPage;
    const end = start + maxPerPage;
    const fontsToShow = fonts.slice(start, end);
    
    const padding = 30;
    const itemHeight = 80;
    const fontSize = 28;
    const width = 800;
    const height = padding * 2 + fontsToShow.length * itemHeight;
    
    let fontStyles = '';
    let textElements = '';
    
    fontsToShow.forEach((font, index) => {
        const fontPath = path.join(fontsDir, font.file);
        if (fs.existsSync(fontPath)) {
            const fontBuffer = fs.readFileSync(fontPath);
            const fontBase64 = fontBuffer.toString('base64');
            const mimeType = font.file.endsWith('.otf') ? 'font/opentype' : 'font/truetype';
            const fontId = `font_${font.name.replace(/[^a-z0-9]/gi, '_')}`;
            
            fontStyles += `
            @font-face {
                font-family: '${fontId}';
                src: url(data:${mimeType};charset=utf-8;base64,${fontBase64}) format('${font.file.endsWith('.otf') ? 'opentype' : 'truetype'}');
            }`;
            
            const y = padding + index * itemHeight + fontSize;
            textElements += `
            <text x="${padding}" y="${y - 15}" font-size="22" font-family="Arial, sans-serif" fill="#444">${font.name}</text>
            <text x="${padding}" y="${y + 15}" font-size="${fontSize}" font-family="${fontId}" fill="#000">Preview: ${font.name} ABC abc 123 😎✨</text>`;
        }
    });
    
    const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <style type="text/css">
                ${fontStyles}
            </style>
        </defs>
        <rect width="100%" height="100%" fill="white"/>
        ${textElements}
        ${page > 1 || end < fonts.length ? 
            `<text x="${width - padding}" y="${height - 10}" font-size="16" font-family="Arial" text-anchor="end" fill="#666">
                Page ${page} of ${Math.ceil(fonts.length / maxPerPage)}
            </text>` : ''}
    </svg>`;
    
    const svgBuffer = Buffer.from(svg);
    return await sharp(svgBuffer)
        .png()
        .toBuffer();
}

// Sesi untuk menyimpan data font selection
const fontSessions = new Map();

module.exports = {
    name: "stext",
    alias: ["stickertext", "stikerteks"],
    description: "Buat stiker teks atau lihat daftar font",
    category: "converter",
    execute: async (msg, { bot, args, usedPrefix, command }) => {
        const input = args.join(' ').trim();
        
        // Mode legacy untuk preview font
        if (input === '-font') {
            const fonts = listAvailableFonts();
            if (fonts.length === 0) return msg.reply('❌ Tidak ada font ditemukan di folder assets/fonts.');
            
            await msg.reply('📸 Menghasilkan preview semua font...');
            
            const page = 1;
            const maxPerPage = 10;
            const totalPages = Math.ceil(fonts.length / maxPerPage);
            
            const buffer = await generateFontPreviewImage(fonts, maxPerPage, page);
            
            const caption = `📚 *Preview Font Tersedia* (Page ${page}/${totalPages})\n\n` +
                          `Gunakan mode interaktif:\n` +
                          `*.stext <teks>*\n` +
                          `Lalu pilih font dari menu!`;
            
            return bot.sendMessage(msg.from, {
                image: buffer,
                caption: caption
            });
        }
        
        // Parsing untuk mode legacy (-t, -fontname)
        const flags = [];
        const words = input.trim().split(/\s+/);
        const contentWords = [];
        
        for (const word of words) {
            if (/^-/.test(word) && word.length > 1) {
                flags.push(word.slice(1).toLowerCase());
            } else {
                contentWords.push(word);
            }
        }
        
        const text = contentWords.join(' ').trim();
        
        // Mode Legacy: Jika ada teks dan flags, proses langsung
        if (text && flags.length > 0) {
            const isTransparent = flags.includes('t');
            const fonts = listAvailableFonts();
            const fontFlag = flags.find(f => f !== 't' && fonts.some(ff => ff.name === f));
            const fontToUse = fontFlag || null;
            
            try {
                await msg.react("🎨");
                const imageBuffer = await generateImageWithCanvas(text, fontToUse, isTransparent);
                const sticker = new Sticker(imageBuffer, {
                    pack: process.env.stickerPackname || 'Text Sticker',
                    author: process.env.stickerAuthor || 'Bot',
                    type: StickerTypes.FULL,
                    quality: 90,
                });
                const stickerBuffer = await sticker.toMessage();
                await bot.sendMessage(msg.from, stickerBuffer);
                await msg.react("✅");
            } catch (error) {
                console.error("❌ Error:", error);
                await msg.react("❌");
                msg.reply(`❌ Gagal membuat stiker:\n${error.message}`);
            }
            return;
        }
        
        // MODE BARU: Interactive Message
        if (!text) {
            return msg.reply(`Gunakan:
*${usedPrefix + command} <teks>*
(akan muncul menu pilih font)

*Atau mode legacy:*
${usedPrefix + command} -t -namafont <teks>
Contoh: ${usedPrefix + command} -t -raleway makan dulu 😋`);
        }
        
        const fonts = listAvailableFonts();
        if (fonts.length === 0) {
            return msg.reply('❌ Tidak ada font ditemukan. Gunakan *.stext -font* untuk melihat font.');
        }
        
        // Siapkan pilihan untuk single_select menu
        const fontRows = fonts.map(font => ({
            id: `font_${font.name}`,
            title: font.name,
            description: `Gunakan font ${font.name}`
        }));
        
        // Tambahkan opsi default
        fontRows.unshift({
            id: 'font_default',
            title: 'Default (No Custom Font)',
            description: 'Gunakan font default sistem'
        });
        
        // Hapus sesi lama untuk user ini sebelum membuat yang baru
        for (const [key, session] of fontSessions.entries()) {
            if (session.userId === msg.sender) {
                fontSessions.delete(key);
                console.log(`[STEXT] 🗑️ Deleted previous session for user: ${key}`);
            }
        }

        // Simpan sesi baru
        const sessionId = `${msg.sender}:${Date.now()}`;
        fontSessions.set(sessionId, {
            userId: msg.sender,
            text: text,
            timestamp: Date.now(),
            flags: flags
        });

        console.log(`[STEXT] ✅ Created session: ${sessionId} for text: "${text}"`);

        // Hapus sesi lama (lebih dari 5 menit)
        for (const [key, session] of fontSessions.entries()) {
            if (Date.now() - session.timestamp > 5 * 60 * 1000) {
                fontSessions.delete(key);
                console.log(`[STEXT] 🗑️ Deleted expired session: ${key}`);
            }
        }
        
        // KIRIM INTERACTIVE MESSAGE menggunakan baileys_helper
        try {
            const { sendInteractiveMessage } = require("baileys_helper");
            
            await sendInteractiveMessage(bot, msg.from, {
                text: `Pilih font untuk teks: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
                footer: 'Pilihan akan kadaluarsa dalam 5 menit',
                interactiveButtons: [
                    {
                        name: 'single_select',
                        buttonParamsJson: JSON.stringify({
                            title: 'Pilih Font',
                            sections: [{
                                title: 'Daftar Font Tersedia',
                                rows: fontRows
                            }]
                        })
                    }
                ]
            });
            
            console.log(`[STEXT] ✅ Interactive message sent for session: ${sessionId}`);
            
        } catch (error) {
            console.error('❌ Gagal mengirim InteractiveMessage:', error);
            msg.reply(`Menu interaktif gagal. Menggunakan font default.`);
            
            // Langsung buat stiker dengan font default
            try {
                await msg.react("🎨");
                const imageBuffer = await generateImageWithCanvas(text, null, false);
                const sticker = new Sticker(imageBuffer, {
                    pack: process.env.stickerPackname || 'Text Sticker',
                    author: process.env.stickerAuthor || 'Bot',
                    type: StickerTypes.FULL,
                    quality: 90,
                });
                const stickerBuffer = await sticker.toMessage();
                await bot.sendMessage(msg.from, stickerBuffer);
                await msg.react("✅");
            } catch (stickerError) {
                await msg.react("❌");
                msg.reply(`❌ Gagal membuat stiker: ${stickerError.message}`);
            }
        }
    },
    
    // Handler untuk InteractiveMessage response
    handleInteractiveResponse: async (msg, bot) => {
        // ====== DEBUGGING: Log semua informasi message ======
        console.log(`\n[STEXT_DEBUG] ==================== NEW MESSAGE ====================`);
        console.log(`[STEXT_DEBUG] msg.type: ${msg.type}`);
        console.log(`[STEXT_DEBUG] msg.mtype: ${msg.mtype}`);
        console.log(`[STEXT_DEBUG] msg.text: "${msg.text}"`);
        console.log(`[STEXT_DEBUG] msg.body: "${msg.body}"`);
        console.log(`[STEXT_DEBUG] msg.sender: ${msg.sender}`);
        
        // Log raw message object untuk melihat struktur lengkap
        if (msg.message) {
            console.log(`[STEXT_DEBUG] msg.message keys:`, Object.keys(msg.message));
            
            // Log detail setiap type message yang mungkin
            if (msg.message.interactiveResponseMessage) {
                console.log(`[STEXT_DEBUG] interactiveResponseMessage:`, JSON.stringify(msg.message.interactiveResponseMessage, null, 2));
            }
            if (msg.message.listResponseMessage) {
                console.log(`[STEXT_DEBUG] listResponseMessage:`, JSON.stringify(msg.message.listResponseMessage, null, 2));
            }
            if (msg.message.buttonsResponseMessage) {
                console.log(`[STEXT_DEBUG] buttonsResponseMessage:`, JSON.stringify(msg.message.buttonsResponseMessage, null, 2));
            }
            if (msg.message.templateButtonReplyMessage) {
                console.log(`[STEXT_DEBUG] templateButtonReplyMessage:`, JSON.stringify(msg.message.templateButtonReplyMessage, null, 2));
            }
        }
        
        let selectedFontId = null;

        // ====== METHOD 1: Deteksi dari interactiveResponseMessage ======
        if (msg.message?.interactiveResponseMessage) {
            const interactiveMsg = msg.message.interactiveResponseMessage;
            console.log(`[STEXT_DEBUG] 🔍 Found interactiveResponseMessage`);
            
            // Coba extract dari nativeFlowResponseMessage
            if (interactiveMsg.nativeFlowResponseMessage) {
                const flowMsg = interactiveMsg.nativeFlowResponseMessage;
                console.log(`[STEXT_DEBUG] 🔍 nativeFlowResponseMessage found`);
                
                // Method A: Dari paramsJson (paling umum)
                if (flowMsg.paramsJson) {
                    try {
                        const params = JSON.parse(flowMsg.paramsJson);
                        console.log(`[STEXT_DEBUG] Parsed paramsJson:`, params);
                        selectedFontId = params.id || params.selected_id || params.selectedId;
                    } catch (e) {
                        console.log(`[STEXT_DEBUG] Failed to parse paramsJson:`, e.message);
                    }
                }
                
                // Method B: Dari params array
                if (!selectedFontId && flowMsg.params && flowMsg.params.length > 0) {
                    selectedFontId = flowMsg.params[0];
                    console.log(`[STEXT_DEBUG] Got from params array:`, selectedFontId);
                }
            }
            
            // Fallback: dari body text
            if (!selectedFontId && interactiveMsg.body?.text) {
                selectedFontId = interactiveMsg.body.text;
                console.log(`[STEXT_DEBUG] Got from body.text:`, selectedFontId);
            }
        }
        
        // ====== METHOD 2: Deteksi dari listResponseMessage ======
        if (!selectedFontId && msg.message?.listResponseMessage) {
            const listMsg = msg.message.listResponseMessage;
            console.log(`[STEXT_DEBUG] 🔍 Found listResponseMessage`);
            
            selectedFontId = listMsg.singleSelectReply?.selectedRowId || 
                           listMsg.selectedRowId ||
                           listMsg.title;
            console.log(`[STEXT_DEBUG] Got from listResponseMessage:`, selectedFontId);
        }
        
        // ====== METHOD 3: Deteksi dari buttonsResponseMessage ======
        if (!selectedFontId && msg.message?.buttonsResponseMessage) {
            const buttonMsg = msg.message.buttonsResponseMessage;
            console.log(`[STEXT_DEBUG] 🔍 Found buttonsResponseMessage`);
            
            selectedFontId = buttonMsg.selectedButtonId || buttonMsg.selectedDisplayText;
            console.log(`[STEXT_DEBUG] Got from buttonsResponseMessage:`, selectedFontId);
        }
        
        // ====== METHOD 4: Deteksi dari templateButtonReplyMessage ======
        if (!selectedFontId && msg.message?.templateButtonReplyMessage) {
            const templateMsg = msg.message.templateButtonReplyMessage;
            console.log(`[STEXT_DEBUG] 🔍 Found templateButtonReplyMessage`);
            
            selectedFontId = templateMsg.selectedId || templateMsg.selectedDisplayText;
            console.log(`[STEXT_DEBUG] Got from templateButtonReplyMessage:`, selectedFontId);
        }
        
        // ====== METHOD 5: Parse dari text jika bentuknya khusus ======
        if (!selectedFontId && msg.text) {
            // Pattern 1: "font_name\nGunakan font font_name"
            const match1 = msg.text.match(/^(.+?)\s*\n\s*Gunakan font\s+(.+)/i);
            if (match1) {
                selectedFontId = `font_${match1[1].trim()}`;
                console.log(`[STEXT_DEBUG] Got from text pattern 1:`, selectedFontId);
            }
            
            // Pattern 2: Text yang mengandung "font_" di awal
            if (!selectedFontId && msg.text.startsWith('font_')) {
                selectedFontId = msg.text.split('\n')[0].trim();
                console.log(`[STEXT_DEBUG] Got from text pattern 2:`, selectedFontId);
            }
        }

        console.log(`[STEXT_DEBUG] Final selectedFontId: "${selectedFontId}"`);
        console.log(`[STEXT_DEBUG] =====================================================\n`);

        // Jika tidak ada font yang dipilih, bukan untuk stext
        if (!selectedFontId) {
            return false;
        }
        
        // Verifikasi apakah ini benar-benar response untuk stext (cek format ID)
        if (!selectedFontId.startsWith('font_')) {
            console.log(`[STEXT] ❌ Not a valid font selection (doesn't start with 'font_')`);
            return false;
        }
        
        console.log(`[STEXT] ✅ Valid font selection detected: "${selectedFontId}"`);
        
        // Cari sesi yang sesuai
        let sessionId = null;
        let sessionData = null;
        
        console.log(`[STEXT] 🔍 Searching session for user: ${msg.sender}`);
        console.log(`[STEXT] 📋 Active sessions:`, Array.from(fontSessions.keys()));
        
        for (const [key, session] of fontSessions.entries()) {
            const age = Date.now() - session.timestamp;
            console.log(`[STEXT] Checking session ${key}: userId=${session.userId}, age=${age}ms`);
            
            if (session.userId === msg.sender && age < 5 * 60 * 1000) {
                sessionId = key;
                sessionData = session;
                console.log(`[STEXT] ✅ Found matching session!`);
                break;
            }
        }
        
        if (!sessionData) {
            console.log(`[STEXT] ❌ No active session found for ${msg.sender}`);
            await msg.reply('❌ Sesi sudah kadaluarsa atau tidak ditemukan. Silakan gunakan command *.stext <teks>* lagi.');
            return true;
        }
        
        console.log(`[STEXT] ✅ Session found: ${sessionId}`);
        console.log(`[STEXT] 📝 Session data:`, sessionData);
        
        // Proses pilihan font
        const { text, flags } = sessionData;
        const isTransparent = flags && flags.includes('t');
        
        // Ekstrak nama font dari ID
        let fontToUse = null;
        if (selectedFontId.startsWith('font_')) {
            const fontName = selectedFontId.replace('font_', '');
            fontToUse = (fontName === 'default') ? null : fontName;
        }
        
        console.log(`[STEXT] 🎨 Creating sticker...`);
        console.log(`[STEXT] - Text: "${text}"`);
        console.log(`[STEXT] - Font: "${fontToUse || 'default'}"`);
        console.log(`[STEXT] - Transparent: ${isTransparent}`);
        
        try {
            await msg.react("🎨");

            const imageBuffer = await generateImageWithCanvas(text, fontToUse, isTransparent);

            const sticker = new Sticker(imageBuffer, {
                pack: process.env.stickerPackname || 'Text Sticker',
                author: process.env.stickerAuthor || 'Bot',
                type: StickerTypes.FULL,
                quality: 90,
            });
            
            const stickerBuffer = await sticker.toMessage();
            await bot.sendMessage(msg.from, stickerBuffer);
            await msg.react("✅");
            
            console.log(`[STEXT] ✅ Sticker created and sent successfully`);
            
            // Hapus sesi setelah berhasil
            fontSessions.delete(sessionId);
            console.log(`[STEXT] 🗑️ Session deleted: ${sessionId}`);
            
            return true;
        } catch (error) {
            console.error("[STEXT] ❌ Error creating sticker:", error);
            await msg.react("❌");
            msg.reply(`❌ Gagal membuat stiker:\n${error.message}`);
            
            // Hapus sesi jika error
            fontSessions.delete(sessionId);
            return true;
        }
    }
};