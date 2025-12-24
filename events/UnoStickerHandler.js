const { proto, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const { createSticker } = require('../lib/sticker-helper');
const { extractMetadata } = require('wa-sticker-formatter');

// --- Fungsi Helper ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
const cardToFileName = (card) => card.isWild ? `${valueToString(card.value)}.png` : `${colorToString(card.color)}_${valueToString(card.value)}.png`;

/**
 * Fungsi untuk membuat sticker dari kartu UNO
 * @param {object} card Objek kartu
 * @returns {Promise<Buffer>} Buffer sticker
 */
async function createCardSticker(card) {
    try {
        const GITHUB_CARD_URL = 'https://raw.githubusercontent.com/daylight021/lily/main/lib/cards/';
        const fileName = cardToFileName(card);
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

module.exports = async (msg, bot) => {
    // Only process if it's a group sticker message
    if (!msg.isGroup || !msg.message?.stickerMessage) return;

    console.log('[UNO] Sticker message received in group');

    // Check if there's an active UNO game in this group
    bot.uno = bot.uno || {};
    const game = bot.uno[msg.from];
    if (!game || !game.isGameRunning) {
        console.log('[UNO] No active UNO game in this group');
        return;
    }

    const { sender } = msg;

    const sticker = msg.message.stickerMessage;
    console.log('[UNO] Sticker object:', sticker);
    if (!sticker.fileSha256) return;

    try {
        // Download sticker buffer to extract metadata
        const stream = await downloadContentFromMessage(sticker, 'sticker');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        // Extract metadata using wa-sticker-formatter
        const metadata = await extractMetadata(buffer);
        const packName = metadata['sticker-pack-name'] || '';
        const packAuthor = metadata['sticker-pack-publisher'] || '';
        console.log('[UNO] Pack name:', packName);
        console.log('[UNO] Pack author:', packAuthor);

        // Check if this is a UNO game sticker
        if (packAuthor !== 'UNO_GAME' || !packName.startsWith('UNO_')) {
            console.log('[UNO] Sticker is not a UNO game sticker');
            return;
        }

        // Bypass if sticker is sent by bot itself
        if (msg.key.fromMe) {
            console.log("[UNO] Sticker sent by bot itself, bypassing");
            return;
        }

        // Now check if it's the current player's turn
        const currentPlayer = game.getCurrentPlayer();
        if (!currentPlayer || currentPlayer.id !== sender) {
            console.log("[UNO] Not the current player's turn");
            // Reply to the player's message
            await bot.sendMessage(msg.from, {
                text: 'Sekarang bukan giliranmu!'
            }, {
                quoted: msg
            });
            return;
        }

        const cardIdentifier = packName.replace('UNO_', '');
        let color, value;

        if (cardIdentifier.includes('_')) {
            // Colored card OR Wild Draw Four: UNO_Red_5 or UNO_Wild_Draw_Four
            const parts = cardIdentifier.split('_');

            // Check if it's Wild Draw Four
            if (parts[0] === 'Wild' && parts[1] === 'Draw' && parts[2] === 'Four') {
                color = 'Wild';
                value = 'Wild Draw Four';
            } else if (parts[0] === 'Wild') {
                // Regular Wild card
                color = 'Wild';
                value = parts.slice(0).join(' ').replace(/_/g, ' ');
            } else {
                // Colored card
                color = parts[0];
                value = parts.slice(1).join(' ').replace(/_/g, ' ');
            }
        } else {
            // Simple Wild card: UNO_Wild
            color = 'Wild';
            value = 'Wild';
        }

        console.log('[UNO] Parsed card - Color:', color, 'Value:', value);

        // Normalize function for comparison
        const normalizeString = (str) => str.trim().toLowerCase().replace(/[\s_]+/g, ' ');

        // Find the card in player's hand
        const cardIndex = currentPlayer.hand.findIndex(c =>
            normalizeString(c.color) === normalizeString(color) &&
            normalizeString(c.value) === normalizeString(value)
        );

        if (cardIndex === -1) {
            console.log(`[UNO] Card not found in hand. Looking for Color: "${color}", Value: "${value}"`);
            console.log('[UNO] Player hand:', currentPlayer.hand.map(c => `${c.color} ${c.value}`));
            await bot.sendMessage(msg.from, { text: 'Kartu tidak ditemukan di tanganmu!' });
            return;
        }

        const playedCard = currentPlayer.hand[cardIndex];
        const topCard = game.getTopCard();

        if (!playedCard.isWild && playedCard.color !== topCard.color && playedCard.value !== topCard.value) {
            await bot.sendMessage(msg.from, { text: 'Kartu tidak cocok dengan kartu teratas!' });
            return;
        }

        // Handle wild card color selection
        if (playedCard.isWild) {
            // Set pending wild color for the player
            currentPlayer.pendingWildColor = { cardIndex, playedCard };
            await bot.sendMessage(msg.from, { text: 'Untuk kartu wild, pilih warna dengan mengetik pesan di PM!' });
            await bot.sendMessage(sender, { text: 'Pilih warna untuk kartu wild:\n\n• .red\n• .green\n• .blue\n• .yellow\n\nBalas dengan prefix warna (contoh: .red)' });
            return;
        }

        // Play the card
        currentPlayer.hand.splice(cardIndex, 1);
        game.discardPile.push(playedCard);

        let announcement = `🃏 ${currentPlayer.name} memainkan kartu *${playedCard.color} ${playedCard.value}*.`;

        if (currentPlayer.hand.length === 1) {
            game.unoCalled[sender] = true;
            announcement += `\n\n🔥 *UNO!* ${currentPlayer.name} sisa 1 kartu!`;
        } else {
            game.unoCalled[sender] = false;
        }

        if (currentPlayer.hand.length === 0) {
            const winnerRank = game.winners.length + 1;
            currentPlayer.isActive = false;
            game.winners.push({ rank: winnerRank, name: currentPlayer.name, id: currentPlayer.id });

            await bot.sendMessage(msg.from, {
                text: `${announcement}\n\n🎉 *JUARA ${winnerRank}!* ${currentPlayer.name} berhasil menghabiskan semua kartu!`
            });

            const remainingActivePlayers = game.players.filter(p => p.isActive);

            if (remainingActivePlayers.length <= 1) {
                if (remainingActivePlayers.length === 1) {
                    const lastPlayer = remainingActivePlayers[0];
                    lastPlayer.isActive = false;
                    game.winners.push({ rank: winnerRank + 1, name: lastPlayer.name, id: lastPlayer.id });
                }

                let finalScoreboard = game.winners
                    .map(w => `🏆 Juara ${w.rank}: ${w.name}`)
                    .join('\n');

                const gameStats = game.getGameStats();
                const totalMoves = game.discardPile.length - 1;

                const groupMessage = `🏁 *PERMAINAN SELESAI!*\n\n${finalScoreboard}\n\n📊 *Statistik Game:*\n• Total gerakan: ${totalMoves}\n• Pemain: ${game.players.length}\n\nTerima kasih sudah bermain! 🎉`;

                await sleep(1000);
                await bot.sendMessage(msg.from, {
                    text: groupMessage,
                    mentions: game.winners.map(w => w.id)
                });

                const winnersList = game.winners.map(w => `🏆 Juara ${w.rank}: ${w.name}`).join('\n');

                for (const player of game.players) {
                    try {
                        let personalMessage;
                        const playerRank = game.winners.find(w => w.id === player.id);

                        if (playerRank) {
                            if (playerRank.rank === 1) {
                                personalMessage = `🎊 *SELAMAT!* 🎊\n\nKamu menjadi *JUARA ${playerRank.rank}* dalam permainan UNO!\n\n🏆 *Final Leaderboard:*\n${winnersList}\n\n📊 *Statistik:*\n• Total pemain: ${game.players.length}\n• Total gerakan: ${totalMoves}\n\nKamu yang terbaik! 🌟`;
                            } else {
                                personalMessage = `🎉 *PERMAINAN SELESAI* 🎉\n\nKamu berhasil menempati *Juara ${playerRank.rank}*!\n\n🏆 *Final Leaderboard:*\n${winnersList}\n\n📊 *Statistik:*\n• Total pemain: ${game.players.length}\n• Total gerakan: ${totalMoves}\n\nGood game! 👍`;
                            }
                        } else {
                            personalMessage = `🎮 *PERMAINAN SELESAI* 🎮\n\n🏆 *Final Leaderboard:*\n${winnersList}\n\n📊 *Statistik:*\n• Total pemain: ${game.players.length}\n• Total gerakan: ${totalMoves}\n\nTerima kasih sudah bermain! 🎯`;
                        }

                        await bot.sendMessage(player.id, { text: personalMessage });
                        await sleep(300);
                    } catch (e) {
                        console.error(`Failed to notify player ${player.id}:`, e);
                    }
                }

                delete bot.uno[msg.from];
                return;
            }

            await sleep(1000);
            game.nextTurn();
            const nextPlayer = game.getCurrentPlayer();
            if (nextPlayer) {
                await announceGameState(bot, msg.from, game, nextPlayer.id,
                    `Permainan berlanjut dengan ${remainingActivePlayers.length} pemain tersisa.`);
                await sendPlayerCards(bot, nextPlayer, game);
            }
            return;
        }

        const specialResult = game.handleSpecialCard(playedCard, bot, msg.from);

        await bot.sendMessage(msg.from, { text: announcement });

        if (specialResult.message) {
            await sleep(500);
            const mentions = specialResult.mentions || [];
            await bot.sendMessage(msg.from, {
                text: specialResult.message,
                mentions: mentions
            });

            if (specialResult.affectedPlayer) {
                await sendPlayerCards(bot, specialResult.affectedPlayer, game);
            }
        }

        if (specialResult.skipTurn) {
            game.nextTurn();
        }
        game.nextTurn();

        const nextPlayer = game.getCurrentPlayer();
        if (nextPlayer) {
            await announceGameState(bot, msg.from, game, nextPlayer.id);
            await sendPlayerCards(bot, nextPlayer, game);
        }

        return;
    } catch (error) {
        console.error('[UNO] Error processing sticker:', error);
    }
};