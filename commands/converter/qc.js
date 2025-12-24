const quote = require("@neoxr/quote-api");
const PhoneNumber = require("awesome-phonenumber");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");

module.exports = {
  name: "qc",
  description: "Convert a message into sticker.",
  execute: async (msg, { bot, args }) => {
    let q = msg.quoted ? msg.quoted : msg;
    let text = q.text && msg.quoted ? q.text : args.join(" ");

    if (!text) {
      msg.react("⚠️").then(() => {
        return msg.reply("Type a text or reply to a message!");
      });
      return;
    }

    // ===== SIMPLIFIKASI: PAKAI NAMA DARI DATABASE USERS =====
    const senderJid = q.sender || msg.sender;
    let pushName = "";

    console.log(`[QC] Getting name for: ${senderJid}`);

    // METHOD 1: Langsung dari database users (sudah ada WA name yang benar)
    const userId = senderJid.includes('@lid') ? senderJid : senderJid;
    const dbUser = bot.db.data.users?.[userId];

    if (dbUser?.name && dbUser.name !== userId.split('@')[0]) {
      pushName = dbUser.name;
      console.log(`[QC] ✅ Using name from users database: ${pushName}`);
    }

    // METHOD 2: Jika tidak ada di users, coba GroupMetadataManager
    if (!pushName && bot.metadataManager) {
      try {
        // Ambil dari metadata dengan auto-update
        pushName = await bot.metadataManager.getMemberName(msg.from, senderJid, true);
        console.log(`[QC] Got from metadataManager: ${pushName}`);
      } catch (e) {
        console.log(`[QC] metadataManager error:`, e.message);
      }
    }

    // METHOD 3: Fallback ke nomor
    if (!pushName || /^\d+$/.test(pushName)) {
      const phone = senderJid.split('@')[0];
      pushName = `User (${phone})`;
      console.log(`[QC] Using fallback name: ${pushName}`);
    }

    console.log(`[QC] FINAL name: ${pushName}`);

    // PERBAIKAN 3: Coba berbagai cara untuk mendapatkan foto profil
    let pp = "https://telegra.ph/file/2b1ed079ea221a4ea3237.png";

    try {
      // Method 1: Coba dengan 'image' parameter
      let ppUrl = await bot.profilePictureUrl(q.sender, "image");
      if (ppUrl) pp = ppUrl;
    } catch (e1) {
      try {
        // Method 2: Coba tanpa parameter
        let ppUrl = await bot.profilePictureUrl(q.sender);
        if (ppUrl) pp = ppUrl;
      } catch (e2) {
        try {
          // Method 3: Coba dengan query direct
          let ppData = await bot.query({
            tag: 'iq',
            attrs: {
              to: q.sender,
              type: 'get',
              xmlns: 'w:profile:picture'
            },
            content: [{ tag: 'picture', attrs: { type: 'image' } }]
          });
          if (ppData?.picture) pp = ppData.picture;
        } catch (e3) {
          console.log("All profile picture methods failed, using default");
        }
      }
    }

    const request = {
      type: "quote",
      format: "png",
      backgroundColor: "#202c33",
      width: 512,
      height: 768,
      scale: 2,
      messages: [
        {
          entities: [],
          avatar: true,
          from: {
            id: 1,
            name: pushName,
            photo: {
              url: pp,
            },
          },
          text: text,
          replyMessage: {},
        },
      ],
    };

    msg.react("⏳");

    try {
      const res = await quote(request);
      const buffer = Buffer.from(res.image, "base64");

      const sticker = new Sticker(buffer, {
        pack: process.env.stickerPackname || "xyzbot's stickers.",
        author: process.env.stickerAuthor || "xyzuniverse - rexprjkt on github.",
        type: StickerTypes.FULL,
        quality: 50,
      });

      const stickerBuffer = await sticker.toBuffer();

      msg.react("✅");

      // Kirim sticker
      await bot.sendMessage(msg.from, {
        sticker: stickerBuffer
      }, { quoted: msg });

    } catch (error) {
      console.error("Error creating sticker:", error);
      msg.react("❌");
      msg.reply("Failed to create sticker. Please try again.");
    }
  },
};