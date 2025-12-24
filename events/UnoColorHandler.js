const { proto } = require('@whiskeysockets/baileys');
const axios = require('axios');
const { createSticker } = require('../lib/sticker-helper');

// --- Fungsi Helper ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async (msg, bot) => {
    // Only process if it's a private message (PM)
    if (msg.isGroup) return;

    console.log('[UNO] Private message received');

    // Get sender ID (handle both formats)
    const senderId = msg.sender || msg.key.participant || msg.key.remoteJid;
    console.log('[UNO] Sender ID:', senderId);

    // Check if there's an active UNO game in any group
    bot.uno = bot.uno || {};
    let activeGame = null;
    let playerGroup = null;
    let player = null;

    for (const groupId in bot.uno) {
        const game = bot.uno[groupId];
        if (game && game.isGameRunning) {
            console.log(`[UNO] Checking game in group ${groupId}`);
            console.log('[UNO] Players:', game.players.map(p => ({ id: p.id, hasPending: !!p.pendingWildColor })));
            console.log('[UNO] Phone map:', game.playerPhoneMap);

            // ← UPDATE: Cari player menggunakan mapping atau direct match
            let playerLid = null;

            // Cek apakah ada mapping dari phone number ke LID
            if (game.playerPhoneMap[senderId]) {
                playerLid = game.playerPhoneMap[senderId];
                console.log(`[UNO] Found LID mapping: ${senderId} -> ${playerLid}`);
            } else {
                // Fallback: coba match langsung
                playerLid = senderId;
            }

            player = game.players.find(p => p.id === playerLid && p.pendingWildColor);

            if (player) {
                console.log('[UNO] Found player with pending wild color:', player.name);
                activeGame = game;
                playerGroup = groupId;
                break;
            }
        }
    }

    if (!activeGame || !player) {
        console.log('[UNO] No active UNO game with pending wild color for this player');
        return;
    }

    if (!player || !player.pendingWildColor) {
        console.log('[UNO] Player not found or no pending wild color');
        return;
    }

    const { cardIndex, playedCard } = player.pendingWildColor;
    const colorChoice = msg.text?.trim().toLowerCase();

    // Validate color choice with prefix
    const validColors = ['.red', '.green', '.blue', '.yellow'];
    if (!validColors.includes(colorChoice)) {
        await bot.sendMessage(senderId, {
            text: 'Warna tidak valid! Pilih salah satu:\n\n• .Red\n• .Green\n• .Blue\n• .Yellow\n\nBalas dengan prefix warna (contoh: .Red)'
        });
        return;
    }

    // Remove prefix and capitalize first letter
    const colorName = colorChoice.slice(1); // Remove the dot
    const chosenColor = colorName.charAt(0).toUpperCase() + colorName.slice(1);

    // Play the wild card with chosen color
    player.hand.splice(cardIndex, 1);
    playedCard.color = chosenColor; // Set the chosen color
    activeGame.discardPile.push(playedCard);

    // Clear pending wild color
    delete player.pendingWildColor;

    let announcement = `🃏 ${player.name} memainkan kartu *${playedCard.value}* dan memilih warna *${chosenColor}*.`;

    if (player.hand.length === 1) {
        activeGame.unoCalled[senderId] = true;
        announcement += `\n\n🔥 *UNO!* ${player.name} sisa 1 kartu!`;
    } else {
        activeGame.unoCalled[senderId] = false;
    }

    if (player.hand.length === 0) {
        const winnerRank = activeGame.winners.length + 1;
        player.isActive = false;
        activeGame.winners.push({ rank: winnerRank, name: player.name, id: player.id });

        await bot.sendMessage(playerGroup, {
            text: `${announcement}\n\n🎉 *JUARA ${winnerRank}!* ${player.name} berhasil menghabiskan semua kartu!`
        });

        const remainingActivePlayers = activeGame.players.filter(p => p.isActive);

        if (remainingActivePlayers.length <= 1) {
            if (remainingActivePlayers.length === 1) {
                const lastPlayer = remainingActivePlayers[0];
                lastPlayer.isActive = false;
                activeGame.winners.push({ rank: winnerRank + 1, name: lastPlayer.name, id: lastPlayer.id });
            }

            let finalScoreboard = activeGame.winners
                .map(w => `🏆 Juara ${w.rank}: ${w.name}`)
                .join('\n');

            const totalMoves = activeGame.discardPile.length - 1;

            const groupMessage = `🏁 *PERMAINAN SELESAI!*\n\n${finalScoreboard}\n\n📊 *Statistik Game:*\n• Total gerakan: ${totalMoves}\n• Pemain: ${activeGame.players.length}\n\nTerima kasih sudah bermain! 🎉`;

            await sleep(1000);
            await bot.sendMessage(playerGroup, {
                text: groupMessage,
                mentions: activeGame.winners.map(w => w.id)
            });

            // Send personal messages to all players
            const winnersList = activeGame.winners.map(w => `🏆 Juara ${w.rank}: ${w.name}`).join('\n');

            for (const gamePlayer of activeGame.players) {
                try {
                    let personalMessage;
                    const playerRank = activeGame.winners.find(w => w.id === gamePlayer.id);

                    if (playerRank) {
                        if (playerRank.rank === 1) {
                            personalMessage = `🎊 *SELAMAT!* 🎊\n\nKamu menjadi *JUARA ${playerRank.rank}* dalam permainan UNO!\n\n🏆 *Final Leaderboard:*\n${winnersList}\n\n📊 *Statistik:*\n• Total pemain: ${activeGame.players.length}\n• Total gerakan: ${totalMoves}\n\nKamu yang terbaik! 🌟`;
                        } else {
                            personalMessage = `🎉 *PERMAINAN SELESAI* 🎉\n\nKamu berhasil menempati *Juara ${playerRank.rank}*!\n\n🏆 *Final Leaderboard:*\n${winnersList}\n\n📊 *Statistik:*\n• Total pemain: ${activeGame.players.length}\n• Total gerakan: ${totalMoves}\n\nGood game! 👏`;
                        }
                    } else {
                        personalMessage = `🎮 *PERMAINAN SELESAI* 🎮\n\n🏆 *Final Leaderboard:*\n${winnersList}\n\n📊 *Statistik:*\n• Total pemain: ${activeGame.players.length}\n• Total gerakan: ${totalMoves}\n\nTerima kasih sudah bermain! 🎯`;
                    }

                    await bot.sendMessage(gamePlayer.id, { text: personalMessage });
                    await sleep(300);
                } catch (e) {
                    console.error(`Failed to notify player ${gamePlayer.id}:`, e);
                }
            }

            delete bot.uno[playerGroup];
            return;
        }

        await sleep(1000);
        activeGame.nextTurn();
        const nextPlayer = activeGame.getCurrentPlayer();
        if (nextPlayer) {
            await announceGameState(bot, playerGroup, activeGame, nextPlayer.id,
                `Permainan berlanjut dengan ${remainingActivePlayers.length} pemain tersisa.`);
            await sendPlayerCards(bot, nextPlayer, activeGame);
        }
        return;
    }

    const specialResult = activeGame.handleSpecialCard(playedCard, bot, playerGroup);

    await bot.sendMessage(playerGroup, { text: announcement });

    if (specialResult.message) {
        await sleep(500);
        const mentions = specialResult.mentions || [];
        await bot.sendMessage(playerGroup, {
            text: specialResult.message,
            mentions: mentions
        });

        if (specialResult.affectedPlayer) {
            await sendPlayerCards(bot, specialResult.affectedPlayer, activeGame);
        }
    }

    if (specialResult.skipTurn) {
        activeGame.nextTurn();
    }
    activeGame.nextTurn();

    const nextPlayer = activeGame.getCurrentPlayer();
    if (nextPlayer) {
        await announceGameState(bot, playerGroup, activeGame, nextPlayer.id);
        await sendPlayerCards(bot, nextPlayer, activeGame);
    }

    // Confirm color choice to player
    await bot.sendMessage(senderId, {
        text: `✅ Warna *${chosenColor}* telah dipilih untuk kartu wild!`
    });
};

/**
 * Fungsi untuk mengumumkan status permainan dan mengirim kartu teratas sebagai sticker
 */
async function announceGameState(bot, fromGroup, game, nextPlayerId, actionMessage = null) {
    try {
        await sleep(1000);

        const topCard = game.getTopCard();
        const nextPlayer = game.players.find(p => p.id === nextPlayerId);

        if (!nextPlayer) {
            console.error('[UNO] Next player not found:', nextPlayerId);
            return;
        }

        // Kirim kartu teratas sebagai sticker
        try {
            const topCardSticker = await createCardSticker(topCard);
            const stickerBuffer = await topCardSticker.toBuffer();
            await bot.sendMessage(fromGroup, { sticker: stickerBuffer });
        } catch (stickerError) {
            console.error(`[UNO] Gagal membuat sticker kartu teratas:`, stickerError);
            // Fallback ke teks jika sticker gagal
            await bot.sendMessage(fromGroup, {
                text: `🃏 *Kartu Teratas:* ${topCard.color} ${topCard.value} (sticker gagal dibuat)`
            });
        }

        let caption = `🃏 *Kartu Teratas:* ${topCard.color} ${topCard.value}\n\n`;

        if (actionMessage) {
            caption += `${actionMessage}\n\n`;
        }

        caption += `🎯 *Giliran:* @${nextPlayerId.split('@')[0]}\n`;
        caption += `🃏 *Jumlah kartu:* ${nextPlayer.hand.length}`;

        await bot.sendMessage(fromGroup, {
            text: caption,
            mentions: [nextPlayerId]
        });
    } catch (e) {
        console.error('[UNO] Error in announceGameState:', e);
    }
}

/**
 * Fungsi untuk membuat sticker dari kartu UNO
 * @param {object} card Objek kartu
 * @returns {Promise<Buffer>} Buffer sticker
 */
async function createCardSticker(card) {
    try {
        const GITHUB_CARD_URL = 'https://raw.githubusercontent.com/daylight021/lily/main/lib/cards/';
        const fileName = card.isWild ? `${valueToString(card.value)}.png` : `${colorToString(card.color)}_${valueToString(card.value)}.png`;
        const imageUrl = GITHUB_CARD_URL + fileName;

        // Download gambar kartu
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data);

        // Buat sticker dengan identifier unik di pack name
        const cardIdentifier = card.isWild ? card.value.replace(/\s+/g, '_') : `${card.color}_${card.value}`.replace(/\s+/g, '_');
        const sticker = await createSticker(imageBuffer, {
            pack: `UNO_${cardIdentifier}`,
            author: 'UNO_GAME'
        });

        return sticker;
    } catch (error) {
        console.error(`[UNO] Gagal membuat sticker untuk kartu ${card.color} ${card.value}:`, error);
        throw error;
    }
}

/**
 * Fungsi untuk mengirim kartu pemain ke private message (PM) sebagai sticker
 * @param {object} bot Objek bot Baileys
 * @param {object} player Objek pemain (id, name, hand)
 * @param {object} game Objek game saat ini
 */
async function sendPlayerCards(bot, player, game) {
    try {
        const topCard = game.getTopCard();
        const initialMessage = player.id === game.getCurrentPlayer().id
            ? `====================\n\n🃏 Giliranmu! Kartu teratas di meja adalah *${topCard.color} ${topCard.value}*.\n\nForward sticker kartu yang ingin dimainkan ke grup!\n\nIni dek kartumu:\n\n====================`
            : `====================\n\n⏳ Menunggu giliran. Kartu teratas adalah *${topCard.color} ${topCard.value}*.\n\nIni dek kartumu:\n\n====================`;

        await bot.sendMessage(player.id, { text: initialMessage });

        // Kirim kartu sebagai sticker
        for (const card of player.hand) {
            try {
                const sticker = await createCardSticker(card);
                const stickerBuffer = await sticker.toBuffer();
                await bot.sendMessage(player.id, { sticker: stickerBuffer });
                await sleep(400); // Jeda untuk stabilitas
            } catch (stickerError) {
                console.error(`[UNO] Gagal membuat sticker untuk kartu ${card.color} ${card.value}:`, stickerError);
                // Fallback ke teks jika sticker gagal
                await bot.sendMessage(player.id, {
                    text: `Kartu: *${card.color} ${card.value}* (sticker gagal dibuat)`
                });
            }
        }
    } catch (e) {
        console.error(`[UNO] Gagal mengirim kartu ke ${player.id}:`, e);
    }
}

// Helper functions
const valueToString = (value) => {
    switch (value) {
        case '0': return 'zero'; case '1': return 'one'; case '2': return 'two'; case '3': return 'three'; case '4': return 'four'; case '5': return 'five';
        case '6': return 'six'; case '7': return 'seven'; case '8': return 'eight'; case '9': return 'nine';
        case 'Draw Two': return 'draw-two'; case 'Wild Draw Four': return 'wild-draw-four'; case 'Wild': return 'wild';
        case 'Skip': return 'skip'; case 'Reverse': return 'reverse';
        default: return value.toLowerCase().replace(/\s+/g, '-');
    }
};
const colorToString = (color) => color.toLowerCase();
