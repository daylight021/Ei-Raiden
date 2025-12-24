const fs = require('fs');
const path = require('path');

// Helper function to get display name - PRIORITAS: database.json > contacts > nomor
function getDisplayName(bot, userId) {
    // 1. Cek dari database.json terlebih dahulu
    if (bot.db?.data?.users?.[userId]?.name) {
        return bot.db.data.users[userId].name;
    }
    
    // 2. Fallback ke contacts
    if (bot.store?.contacts?.[userId]?.notify) {
        return bot.store.contacts[userId].notify;
    }
    
    // 3. Fallback terakhir: nomor HP
    return userId.split('@')[0];
}

// Helper function to get phone number dari userId
function getPhoneNumber(userId) {
    // userId format: 628xxxxx@s.whatsapp.net
    return userId.split('@')[0];
}

// Helper function untuk format leaderboard: nama (nomor) tanpa mention
function formatLeaderboardEntry(bot, userId) {
    const name = getDisplayName(bot, userId);
    const number = getPhoneNumber(userId);
    
    // Jika nama sama dengan nomor (fallback gagal), hanya tampilkan nomor
    if (name === number) {
        return number;
    }
    
    return `${name} (${number})`;
}

// Path ke file soal
const soalPath = path.join(__dirname, '..', '..', 'lib', 'family100-soal.json');
const allSoal = JSON.parse(fs.readFileSync(soalPath));

const threshold = 0.72; // Nilai similarity untuk jawaban yang hampir benar
const winScore = 1000; // Poin per jawaban benar

// Fungsi untuk mengirim soal baru
async function sendQuestion(bot, groupId) {
    const gameSession = bot.game.family100[groupId];
    if (!gameSession) return;

    // Pilih soal random
    const currentSoal = allSoal[Math.floor(Math.random() * allSoal.length)];
    
    // Tambahkan counter soal
    if (!gameSession.questionCount) gameSession.questionCount = 0;
    gameSession.questionCount++;

    const message = await bot.sendMessage(groupId, {
        text: `🎯 *FAMILY 100* 🎯\n\n` +
              `📊 Soal ke-${gameSession.questionCount}\n` +
              `❓ *Soal:* ${currentSoal.soal}\n\n` +
              `📋 Terdapat *${currentSoal.jawaban.length}* jawaban${currentSoal.jawaban.find(v => v.includes(' ')) ? `\n(beberapa jawaban terdapat spasi)` : ''}\n\n` +
              `💰 *${winScore}* poin per jawaban benar\n` +
              `⏰ Timeout: 90 detik\n\n` +
              `📝 *Ketik jawaban langsung di chat!*\n` +
              `💡 *Ketik "nyerah" untuk menyerah*`
    });

    gameSession.soal = currentSoal.soal;
    gameSession.jawaban = currentSoal.jawaban;
    gameSession.terjawab = Array.from(currentSoal.jawaban, () => false);
    gameSession.questionMsgId = message.key.id;
    gameSession.answeredBy = Array.from(currentSoal.jawaban, () => null);
    gameSession.totalAnswers = currentSoal.jawaban.length;
    gameSession.correctAnswers = 0;

    console.log(`[FAMILY100_QUESTION] Sent question #${gameSession.questionCount}, ID: ${message.key.id}, Answers: ${currentSoal.jawaban.length}`);

    // Clear timeout lama jika ada
    if (gameSession.timeout) {
        clearTimeout(gameSession.timeout);
    }

    // Set timeout untuk mengakhiri game jika tidak ada aktivitas
    gameSession.timeout = setTimeout(() => {
        endGame(bot, groupId, 'timeout');
    }, 90000); // 90 detik
}

// Fungsi untuk menampilkan status jawaban saat ini
async function showCurrentStatus(bot, groupId, isComplete) {
    const gameSession = bot.game.family100[groupId];
    if (!gameSession) return;

    let statusText = `🎯 *FAMILY 100* ${isComplete ? '✅' : '📊'}\n\n`;
    statusText += `❓ *Soal:* ${gameSession.soal}\n\n`;

    // Tampilkan jawaban
    statusText += `📋 *Jawaban* (${gameSession.correctAnswers}/${gameSession.totalAnswers}):\n`;
    gameSession.jawaban.forEach((jawaban, index) => {
        if (gameSession.terjawab[index]) {
            const answererName = formatLeaderboardEntry(bot, gameSession.answeredBy[index]);
            statusText += `✅ (${index + 1}) ${jawaban} - ${answererName}\n`;
        } else {
            statusText += `❌ (${index + 1}) _______________\n`;
        }
    });

    if (isComplete) {
        statusText += `\n🎉 *SEMUA JAWABAN TERJAWAB!*\n`;
        statusText += `🚀 Soal berikutnya akan muncul dalam 3 detik...\n`;
    } else {
        statusText += `\n💰 *${winScore}* poin per jawaban benar\n`;
        statusText += `⏰ Game berlanjut... Cari jawaban yang tersisa!\n`;
    }

    await bot.sendMessage(groupId, { 
        text: statusText, 
    });
}

// Fungsi untuk mengakhiri game
async function endGame(bot, groupId, reason = 'manual') {
    const gameSession = bot.game.family100[groupId];
    if (!gameSession) return;

    // Clear timeout jika ada
    if (gameSession.timeout) {
        clearTimeout(gameSession.timeout);
    }

    let endGameText = '';
    if (reason === 'timeout') {
        endGameText = `⏰ *WAKTU HABIS!*\n\n` +
                     `❓ Soal terakhir: ${gameSession.soal || 'Belum ada soal'}\n\n`;
        
        // Tampilkan jawaban yang belum terjawab
        if (gameSession.jawaban) {
            endGameText += `📋 *Jawaban yang belum ditemukan:*\n`;
            gameSession.jawaban.forEach((jawaban, index) => {
                if (!gameSession.terjawab[index]) {
                    endGameText += `• ${jawaban}\n`;
                }
            });
            endGameText += `\n`;
        }
        
        endGameText += `🏁 *GAME BERAKHIR KARENA TIDAK ADA AKTIVITAS*\n\n`;
    } else if (reason === 'surrender') {
        endGameText = `🏳️ *GAME DIHENTIKAN - MENYERAH*\n\n`;
        
        // Tampilkan semua jawaban
        if (gameSession.jawaban) {
            endGameText += `📋 *Semua jawaban untuk soal terakhir:*\n`;
            gameSession.jawaban.forEach((jawaban, index) => {
                const status = gameSession.terjawab[index] ? '✅' : '❌';
                const answerer = gameSession.terjawab[index] ? ` - ${formatLeaderboardEntry(bot, gameSession.answeredBy[index])}` : '';
                endGameText += `${status} ${jawaban}${answerer}\n`;
            });
            endGameText += `\n`;
        }
    } else {
        endGameText = `🛑 *GAME DIHENTIKAN SECARA MANUAL*\n\n`;
    }

    let sessionLeaderboardText = '-- LEADERBOARD SESI INI --\n';
    const sessionScores = gameSession.sessionScores;
    const sortedSession = Object.entries(sessionScores).sort(([, a], [, b]) => b - a);

    if (sortedSession.length > 0) {
        sortedSession.forEach(([userId, score], index) => {
            const medal = ['🥇', '🥈', '🥉'][index] || '🏅';
            const entry = formatLeaderboardEntry(bot, userId);
            sessionLeaderboardText += `${medal} ${entry} - *${score}* Poin\n`;
        });

        // Simpan ke database per-group
        const db = bot.db;
        if (!db.data.family100Leaderboard) {
            db.data.family100Leaderboard = {};
        }
        if (!db.data.family100Leaderboard[groupId]) {
            db.data.family100Leaderboard[groupId] = {};
        }
        for (const [userId, score] of sortedSession) {
            db.data.family100Leaderboard[groupId][userId] = (db.data.family100Leaderboard[groupId][userId] || 0) + score;
        }
        await db.write();
    } else {
        sessionLeaderboardText += '_Tidak ada yang berhasil menjawab di sesi ini._\n';
    }

    const groupLeaderboard = (bot.db.data.family100Leaderboard && bot.db.data.family100Leaderboard[groupId]) || {};
    const sortedGroup = Object.entries(groupLeaderboard).sort(([, a], [, b]) => b - a).slice(0, 10);
    let groupLeaderboardText = '\n-- LEADERBOARD GRUP --\n';
    if (sortedGroup.length > 0) {
        sortedGroup.forEach(([userId, score], index) => {
            const medal = index === 0 ? '🏆' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
            const entry = formatLeaderboardEntry(bot, userId);
            groupLeaderboardText += `${medal} ${index + 1}. ${entry} - *${score}* Poin\n`;
        });
    } else {
        groupLeaderboardText += '_Leaderboard grup masih kosong._';
    }

    await bot.sendMessage(groupId, {
        text: `🎮 ${endGameText}` +
              `📊 Total soal dimainkan: ${gameSession.questionCount || 0}\n\n` +
              `${sessionLeaderboardText}${groupLeaderboardText}\n\n` +
              `Terima kasih telah bermain! 🎉\n` +
              `Mulai lagi dengan *.family100 start*`,
    });

    delete bot.game.family100[groupId];
}

module.exports = {
    name: 'family100',
    category: 'game',
    aliases: ['f100'],
    description: 'Mini-game Family 100 seru!',
    group: true,
    async execute(msg, extra) {
        const { from } = msg;
        const { bot, args } = extra;
        const subCommand = args[0]?.toLowerCase();

        // Inisialisasi game object jika belum ada
        if (!bot.game) {
            bot.game = {};
        }
        if (!bot.game.family100) {
            bot.game.family100 = {};
        }

        if (subCommand === 'start') {
            if (bot.game.family100?.[from]) {
                return bot.sendMessage(from, { 
                    text: '⚠️ Sesi "Family 100" sudah berjalan di grup ini!\n\n' +
                          'Sesi akan berakhir otomatis jika tidak ada aktivitas dalam 90 detik.\n\n' +
                          'Gunakan `.family100 status` untuk melihat status game saat ini.' 
                });
            }
            
            // Inisialisasi sesi game baru
            bot.game.family100[from] = {
                sessionScores: {},
                soal: null,
                jawaban: null,
                terjawab: [],
                answeredBy: [],
                timeout: null,
                questionCount: 0,
                questionMsgId: null,
                totalAnswers: 0,
                correctAnswers: 0
            };

            const challengeMessages = [
                `🎯 *GAME FAMILY 100 DIMULAI!* 🎯\n\n` +
                `🔥 Siapa yang jago survei dan tebak jawaban populer?\n` +
                `💪 Tantangan untuk semua member grup!\n` +
                `🏆 Kumpulkan poin sebanyak-banyaknya!\n\n` +
                `🚀 *Soal pertama akan segera muncul...*\n` +
                `📝 Langsung ketik jawaban di chat!`,
                
                `🎪 *ARENA FAMILY 100 TERBUKA!* 🎭\n\n` +
                `⚡ Ayo tebak jawaban yang paling populer!\n` +
                `🎊 Game survey seru untuk semua!\n` +
                `💎 Setiap jawaban benar = ${winScore} poin!\n\n` +
                `🎲 *Mari mulai permainan survey...*\n` +
                `📝 Pikirkan jawaban yang paling umum!`,
                
                `🌟 *FAMILY 100 CHALLENGE!* 🌟\n\n` +
                `🧠 Uji pengetahuan dan logika kalian!\n` +
                `🎯 Cari jawaban yang paling masuk akal!\n` +
                `🏅 Siapa yang akan jadi master survey?\n\n` +
                `🎨 *Get ready for the ultimate survey game!*\n` +
                `💡 Ingat, jawaban terpopuler yang dicari!`
            ];
            
            const randomMessage = challengeMessages[Math.floor(Math.random() * challengeMessages.length)];
            
            await bot.sendMessage(from, { 
                text: randomMessage,
            });
            
            // Delay 3 detik sebelum soal pertama
            setTimeout(() => {
                if (bot.game.family100[from]) {
                    sendQuestion(bot, from);
                }
            }, 3000);

        } else if (subCommand === 'leaderboard' || subCommand === 'lb') {
            const groupLeaderboard = (bot.db.data.family100Leaderboard && bot.db.data.family100Leaderboard[from]) || {};
            const sortedGroup = Object.entries(groupLeaderboard).sort(([, a], [, b]) => b - a).slice(0, 10);

            if (sortedGroup.length === 0) {
                return bot.sendMessage(from, { 
                    text: '🏆 Leaderboard "Family 100" di grup ini masih kosong.\n\n' +
                          'Mulai bermain dengan `.family100 start`!' 
                });
            }

            let text = '🏆 *LEADERBOARD GRUP FAMILY 100*\n\n';
            sortedGroup.forEach(([userId, score], index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
                const entry = formatLeaderboardEntry(bot, userId);
                text += `${medal} ${index + 1}. ${entry} - *${score}* Poin\n`;
            });

            text += `\n💡 *Tip:* Setiap jawaban benar memberikan ${winScore} poin!`;
            await bot.sendMessage(from, { text });

        } else if (subCommand === 'status') {
            const gameSession = bot.game.family100?.[from];
            if (!gameSession) {
                return bot.sendMessage(from, { 
                    text: '❌ Tidak ada sesi game yang aktif.\n\n' +
                          'Mulai dengan `.family100 start`!' 
                });
            }

            if (!gameSession.soal) {
                return bot.sendMessage(from, { 
                    text: '🎯 Game sudah dimulai tapi belum ada soal.\nMenunggu soal pertama...' 
                });
            }

            await showCurrentStatus(bot, from, false);

        } else {
            const helpText = `🎯 *BANTUAN GAME FAMILY 100* 🎯\n\n` +
                           `📋 *Perintah yang tersedia:*\n\n` +
                           `1️⃣ \`.family100 start\`\n   🚀 Memulai sesi permainan baru\n\n` +
                           `2️⃣ \`.family100 leaderboard\`\n   🏆 Melihat peringkat poin grup\n\n` +
                           `3️⃣ \`.family100 status\`\n   📊 Melihat status game saat ini\n\n` +
                           `🎮 *Cara Bermain:*\n` +
                           `• Bot akan mengirimkan pertanyaan survey\n` +
                           `• Langsung ketik jawaban di chat (tanpa reply)\n` +
                           `• Cari semua jawaban yang tersedia\n` +
                           `• Setiap jawaban benar = ${winScore} poin\n` +
                           `• Game berlanjut ke soal berikutnya otomatis\n` +
                           `• Game berakhir jika tidak ada aktivitas 90 detik\n` +
                           `• Ketik "nyerah" untuk mengakhiri game\n\n` +
                           `💡 *Tips:* Pikirkan jawaban yang paling umum dan populer!`;
            await bot.sendMessage(from, { text: helpText });
        }
    },
    sendQuestion,
    endGame
};