require("dotenv").config();
// Initialize FFmpeg configuration
require("./lib/ffmpeg-config");
const Collection = require("./lib/CommandCollections");
const fs = require("fs");
const path = require("node:path");
const chokidar = require("chokidar");
const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
  useMultiFileAuthState,
  makeInMemoryStore,
} = require("@whiskeysockets/baileys");
const Pino = require("pino");
const NodeCache = require("node-cache");
const { createCustomStore } = require('./lib/CustomStore.js');
const AntiBan = require('./lib/AntiBan');
const GroupMetadataManager = require('./lib/GroupMetadataManager');
require('./utils/register-fonts')();

// external map to store retry counts of messages when decryption/encryption fails
// keep this out of the socket itself, so as to prevent a message decryption/encryption loop across socket restarts
const msgRetryCounterCache = new NodeCache();

// LowDB
var low;
try {
  low = require("lowdb");
} catch {
  low = require("./lib/lowdb");
}
const { LowSync, JSONFileSync } = low;

// Prevent exit if it's closed
process.on("uncaughtException", console.error);

// Global restart attempt counter
let restartAttempts = 0;

async function start() {
  // Client configuration
  const { state, saveCreds } = await useMultiFileAuthState("sessions");
  const { version } = await fetchLatestBaileysVersion();

  // Client store
  const store = createCustomStore({ logger: Pino({ level: "silent" }) });
  // // can be read from a file
  // store.readFromFile("./client_store.json");
  // // saves the state to a file every 1minute
  // setInterval(() => {
  //   store.writeToFile("./client_store.json");
  // }, 60_000);

  // Deploy the client
  const bot = makeWASocket({
    version,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "silent" })),
    },
    msgRetryCounterCache: msgRetryCounterCache,
    getMessage: async (msg) => {
      if (store) {
        const storedMsg = await store.loadMessage(msg.remoteJid, msg.id);
        return storedMsg.message || undefined;
      }
      return proto.Message.fromObject({});
    },
    logger: Pino({ level: "silent" }),
    syncFullHistory: false,
    retryRequestDelayMs: 10,
    transactionOpts: {
      maxCommitRetries: 10,
      delayBetweenTriesMs: 10,
    },
    maxMsgRetryCount: 15,
    appStateMacVerification: {
      patch: true,
      snapshot: true,
    },
  });

  // Bind the store
  store.bind(bot.ev);
  bot.store = store;

  // Initialize group metadata manager
  const metadataManager = new GroupMetadataManager(bot);
  bot.metadataManager = metadataManager;

  // Initialize WelcomeHelper globally and wait for it to be ready
  const WelcomeHelper = require('./lib/welcomeHelper');
  bot.welcomeHelper = new WelcomeHelper(bot);

  // Wait for welcome database to initialize
  try {
    await bot.welcomeHelper.initPromise;
    console.log('[BOT] ✅ Welcome helper initialized');
  } catch (error) {
    console.error('[BOT] ⚠️ Welcome helper initialization failed:', error);
  }

  // Anti-Ban: Wrap sendMessage to include delays between messages
  bot.sendMessage = AntiBan.wrapSendMessage(bot.sendMessage.bind(bot));

  // Command manager
  bot.commands = new Collection();

  // Load the commands
  const loadCommands = (dir) => {
    bot.commands.clear();
    const commandsPath = path.join(__dirname, dir);
    const commandFolders = fs.readdirSync(commandsPath);

    for (const folder of commandFolders) {
      const folderPath = path.join(commandsPath, folder);
      const commandFiles = fs.readdirSync(folderPath).filter((file) => file.endsWith(".js"));
      for (const file of commandFiles) {
        const filePath = path.join(folderPath, file);
        delete require.cache[require.resolve(filePath)];
        try {
          const command = require(filePath);
          command.category = folder;
          bot.commands.set(command.name, command); // Set the main name

          if (command.alias && Array.isArray(command.alias)) {
            command.alias.forEach((alias) => bot.commands.set(alias, command)); // Set aliases
          }
        } catch (error) {
          console.error(`Failed to load command from: ${filePath}:`, error);
        }
      }
    }
    console.log(bot.commands);
    console.log(`All commands has been loaded. Total commands: ${bot.commands.size}`);
  };

  loadCommands("commands");

  // Watch the commands folder if there's some changes
  const watcher = chokidar.watch("./commands", {
    ignored: /^\./, // Abaikan file yang diawali dengan titik (.)
    persistent: true,
    ignoreInitial: true, // Jangan load saat pertama kali dijalankan
  });

  watcher
    .on("add", (filePath) => {
      if (filePath.endsWith(".js")) {
        console.log(`File ${filePath} has been added, reloading commands...`);
        loadCommands("commands");
      }
    })
    .on("change", (filePath) => {
      if (filePath.endsWith(".js")) {
        console.log(`File ${filePath} has been changed, reloading commands...`);
        loadCommands("commands");
      }
    })
    .on("unlink", (filePath) => {
      if (filePath.endsWith(".js")) {
        console.log(`File ${filePath} has been removed, reloading commands...`);
        loadCommands("commands");
      }
    });

  chokidar
    .watch("./.env", {
      persistent: true,
      ignoreInitial: true,
    })
    .on("change", () => {
      console.log("File .env has been changed, reloading configs...");
      require("dotenv").config({ override: true });
    });

  // Database with auto-recovery
  bot.db = new LowSync(new JSONFileSync("./database.json"));

  // Try to load database with error handling
  try {
    bot.db.read();

    // Initialize if null or undefined
    if (!bot.db.data) {
      bot.db.data = {
        users: {},
        groups: {},
      };
      bot.db.write();
      console.log("✅ Database initialized");
    }
  } catch (error) {
    console.error("❌ Database corrupt! Error:", error.message);

    // Backup corrupt database
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `./database.json.corrupt.${timestamp}`;

    if (fs.existsSync("./database.json")) {
      try {
        fs.copyFileSync("./database.json", backupPath);
        console.log(`📦 Corrupt database backed up to: ${backupPath}`);
      } catch (backupError) {
        console.error("Failed to backup corrupt database:", backupError);
      }
    }

    // Initialize fresh database
    bot.db.data = {
      users: {},
      groups: {},
    };

    try {
      bot.db.write();
      console.log("✅ Fresh database created successfully");
    } catch (writeError) {
      console.error("Failed to create new database:", writeError);
    }
  }

  let connectionTimer;

  bot.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    console.log("connection update", update); // Enhanced logging
    if (qr) {
      console.log('------------------------------------------------');
      console.log('📱 Pindai QR Code di bawah ini untuk terhubung:');
      qrcode.generate(qr, { small: true });
      const qrLink = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;
      console.log('\n Atau, jika QR di atas berantakan, buka link ini:\n', qrLink);
      console.log('------------------------------------------------');
    }
    if (connection === "close") {
      console.log("connection closed");
      if (connectionTimer) {
        clearTimeout(connectionTimer);
        connectionTimer = null;
      }
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        restartAttempts++;
        const delay = Math.min(1000 * Math.pow(2, restartAttempts), 30000); // Exponential backoff, max 30s
        console.log(`🔄 Attempting restart ${restartAttempts} in ${delay}ms...`);

        setTimeout(async () => {
          try {
            await start();
            console.log("✅ Restart successful");
          } catch (error) {
            console.error(`❌ Restart attempt ${restartAttempts} failed:`, error);
            // Continue retrying indefinitely until successful connection
            setTimeout(() => start().catch(console.error), 5000);
          }
        }, delay);
      } else {
        console.log("Connection closed. You are logged out.");
        restartAttempts = 0; // Reset on logout
      }
    } else if (connection === "open") {
      console.log("✅ Bot connected successfully!");
      restartAttempts = 0; // Reset restart attempts on successful connection
      if (connectionTimer) {
        clearTimeout(connectionTimer);
        connectionTimer = null;
      }

      // Save database
      if (bot.db.data) {
        setInterval(async () => {
          try {
            await bot.db.write();
          } catch (error) {
            console.error("Database write error:", error);
            // Cek apakah file tmp ada sebelum menghapus
            if (fs.existsSync("./database.json.tmp")) {
              try {
                fs.unlinkSync("./database.json.tmp");
              } catch (unlinkError) {
                console.error("Failed to delete tmp file:", unlinkError);
              }
            }
          }
          // Cleanup tmp file jika masih ada setelah write berhasil
          if (fs.existsSync("./database.json.tmp")) {
            try {
              fs.unlinkSync("./database.json.tmp");
          } catch (unlinkError) {
            console.error("Failed to cleanup tmp file:", unlinkError);
          }
        }
      }, 30 * 1000);
      }

      // Periodic metadata cleanup
      setInterval(() => {
        bot.metadataManager.cleanupCache();
      }, 60 * 60 * 1000); // Clean cache every hour
    } else if (connection === "connecting") {
      console.log("🔄 Bot connecting...");
      // Set a timer to restart if stuck in connecting for too long
      if (connectionTimer) clearTimeout(connectionTimer);
      connectionTimer = setTimeout(async () => {
        console.log("⚠️ Stuck in connecting state, restarting...");
        try {
          await start();
        } catch (error) {
          console.error("Error restarting from connecting state:", error);
          setTimeout(() => start().catch(console.error), 5000);
        }
      }, 30000); // 30 seconds timeout
    }
  });

bot.ev.on("messages.upsert", require("./events/CommandHandler").chatUpdate.bind(bot));

bot.ev.on("creds.update", async () => {
  await saveCreds();
});

bot.ev.on("group-participants.update", async (update) => {
  const { id, participants, action } = update;

  console.log(`[GROUP_PARTICIPANTS] Event: ${action} in group ${id}`);
  console.log(`[GROUP_PARTICIPANTS] Participants:`, participants);

  try {
    await bot.metadataManager.updateParticipants(id, participants, action);
  } catch (error) {
    console.error(`[GROUP_PARTICIPANTS] Failed to update metadata for group ${id}:`, error);
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  let metadata;
  try {
    metadata = await bot.metadataManager.getGroupMetadata(id, false);
  } catch (e) {
    console.error("[GROUP_PARTICIPANTS] Gagal mengambil metadata grup:", e);
    return;
  }

  // Use global welcomeHelper instance
  const welcomeHelper = bot.welcomeHelper;

  for (const user of participants) {
    let userJid;
    let fullJid;
    let phoneNumber;
    let mentionJid;

    // Parse user information
    if (typeof user === 'string' && user.includes('@')) {
      fullJid = user;
      phoneNumber = bot.metadataManager.extractPhoneNumber(user);
      userJid = phoneNumber || user.split('@')[0];
      mentionJid = phoneNumber ? `${phoneNumber}@s.whatsapp.net` : user;
    } else if (typeof user === 'object' && user !== null) {
      const rawJid = user.phoneNumber || user.id;
      if (!rawJid || typeof rawJid !== 'string' || !rawJid.includes('@')) {
        console.warn("[GROUP_PARTICIPANTS] Invalid JID in user object:", user);
        continue;
      }
      fullJid = rawJid;
      phoneNumber = bot.metadataManager.extractPhoneNumber(rawJid, user.phoneNumber);
      userJid = phoneNumber || rawJid.split('@')[0];
      mentionJid = phoneNumber ? `${phoneNumber}@s.whatsapp.net` : rawJid;
    } else {
      console.warn("[GROUP_PARTICIPANTS] Invalid user in participants update:", user);
      continue;
    }

    console.log(`[GROUP_PARTICIPANTS] Processing user - Phone: ${phoneNumber}, JID: ${fullJid}`);

    if (action === "add") {
      const customWelcome = welcomeHelper.getWelcomeMessage(id);

      // Get user name
      let userName = phoneNumber || userJid;

      try {
        if (metadata && metadata.participants) {
          const memberData = metadata.participants.find(p =>
            (p.phoneNumber && p.phoneNumber === phoneNumber) ||
            p.jid === mentionJid ||
            p.jid === fullJid ||
            p.lid === fullJid
          );

          if (memberData && memberData.name && bot.metadataManager.isValidName(memberData.name)) {
            userName = memberData.name;
            console.log(`[GROUP_PARTICIPANTS] ✅ Got name from metadata: ${userName}`);
          }
        }

        if (!bot.metadataManager.isValidName(userName) && bot.store && bot.store.data && bot.store.data.contacts) {
          if (phoneNumber) {
            const standardJid = `${phoneNumber}@s.whatsapp.net`;
            if (bot.store.data.contacts[standardJid]) {
              const contact = bot.store.data.contacts[standardJid];
              const contactName = contact.notify || contact.name || contact.pushName;
              if (contactName && bot.metadataManager.isValidName(contactName)) {
                userName = contactName;
                console.log(`[GROUP_PARTICIPANTS] ✅ Got name from store: ${userName}`);
              }
            }
          }
        }

        if (!bot.metadataManager.isValidName(userName)) {
          const nameFromManager = await bot.metadataManager.getMemberName(id, mentionJid);
          if (nameFromManager && bot.metadataManager.isValidName(nameFromManager)) {
            userName = nameFromManager;
            console.log(`[GROUP_PARTICIPANTS] ✅ Got name from metadataManager: ${userName}`);
          }
        }

        if (!bot.metadataManager.isValidName(userName)) {
          userName = phoneNumber || userJid;
          console.log(`[GROUP_PARTICIPANTS] ⚠️ Using phone as fallback: ${userName}`);
        }

      } catch (error) {
        console.error("[GROUP_PARTICIPANTS] Error getting user name:", error);
        userName = phoneNumber || userJid;
      }

      const welcomeMessage = welcomeHelper.formatMessage(
        customWelcome.text,
        metadata.subject,
        userName
      );

      const messageOptions = {
        text: welcomeMessage,
        mentions: [mentionJid]
      };

      // ✅ FIXED: Send all media as VIDEO with gifPlayback
      // All media already optimized to MP4 < 1MB by welcomeHelper
      if (customWelcome.media) {
        try {
          const fs = require('fs');

          if (fs.existsSync(customWelcome.media.path)) {
            const mediaBuffer = fs.readFileSync(customWelcome.media.path);
            const mediaType = customWelcome.media.type;
            const mimetype = customWelcome.media.mimetype;
            const extension = customWelcome.media.extension;
            const sizeKB = (mediaBuffer.length / 1024).toFixed(2);

            console.log(`[GROUP_PARTICIPANTS] 📤 Sending media - type: ${mediaType}, mime: ${mimetype}, ext: ${extension}, size: ${sizeKB} KB`);

            // ✅ ALWAYS send as VIDEO with gifPlayback for maximum compatibility
            // welcomeHelper already converted/optimized everything to MP4 < 1MB
            messageOptions.video = mediaBuffer;
            messageOptions.gifPlayback = true;
            messageOptions.caption = welcomeMessage;
            delete messageOptions.text;

            console.log('[GROUP_PARTICIPANTS] 🎨 Sending as VIDEO with gifPlayback (universal compatibility)');

          } else {
            console.warn("[GROUP_PARTICIPANTS] ⚠️ Media file not found:", customWelcome.media.path);
          }
        } catch (error) {
          console.error("[GROUP_PARTICIPANTS] ❌ Error loading media:", error);
        }
      }

      console.log(`[GROUP_PARTICIPANTS] 📤 Sending welcome message to ${userName}...`);
      await bot.sendMessage(id, messageOptions);

    } else if (action === "remove") {
      // Goodbye message
      let userName = phoneNumber || userJid;

      try {
        if (metadata && metadata.participants) {
          const memberData = metadata.participants.find(p =>
            (p.phoneNumber && p.phoneNumber === phoneNumber) ||
            p.jid === mentionJid ||
            p.jid === fullJid ||
            p.lid === fullJid
          );

          if (memberData && memberData.name && bot.metadataManager.isValidName(memberData.name)) {
            userName = memberData.name;
          }
        }

        if (!bot.metadataManager.isValidName(userName) && bot.store && bot.store.data && bot.store.data.contacts) {
          if (phoneNumber) {
            const standardJid = `${phoneNumber}@s.whatsapp.net`;
            if (bot.store.data.contacts[standardJid]) {
              const contact = bot.store.data.contacts[standardJid];
              const contactName = contact.notify || contact.name || contact.pushName;
              if (contactName && bot.metadataManager.isValidName(contactName)) {
                userName = contactName;
              }
            }
          }
        }

      } catch (error) {
        console.error("[GROUP_PARTICIPANTS] Error getting name for goodbye:", error);
      }

      const goodbyeMessage = `👋 Selamat tinggal @${userName}. Sampai jumpa lagi di lain waktu!`;

      console.log(`[GROUP_PARTICIPANTS] 📤 Sending goodbye message to ${userName}...`);
      await bot.sendMessage(id, {
        text: goodbyeMessage,
        mentions: [mentionJid]
      });
    }
  }
});

return bot;
}

start().catch(console.error);