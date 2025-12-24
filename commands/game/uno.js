const { proto, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const { createSticker } = require('../../lib/sticker-helper');
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
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
        const imageBuffer = Buffer.from(response.data);

        // Validasi buffer gambar
        if (!imageBuffer || imageBuffer.length === 0) {
            throw new Error('Buffer gambar kosong atau tidak valid');
        }

        // Buat sticker dengan identifier unik di pack name
        const cardIdentifier = card.isWild ? card.value.replace(/\s+/g, '_') : `${card.color}_${card.value}`.replace(/\s+/g, '_');
        const sticker = await createSticker(imageBuffer, {
            pack: `UNO_${cardIdentifier}`,
            author: 'UNO_GAME'
        });

        // Validasi sticker buffer
        if (!sticker) {
            throw new Error('Sticker object tidak valid');
        }

        const stickerBuffer = await sticker.toBuffer();

        // Validasi buffer sticker
        if (!stickerBuffer || stickerBuffer.length === 0) {
            throw new Error('Buffer sticker kosong atau tidak valid');
        }

        // Pastikan ukuran buffer tidak terlalu besar (maksimal 1MB untuk WA)
        if (stickerBuffer.length > 1024 * 1024) {
            console.warn(`[UNO] Buffer sticker terlalu besar: ${stickerBuffer.length} bytes, mungkin gagal dikirim`);
        }

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

        // Hitung jeda berdasarkan jumlah pemain dan kartu untuk menghindari rate limit
        const totalPlayers = game.players.length;
        const totalCards = player.hand.length;
        const baseDelay = 400; // Jeda dasar
        const playerMultiplier = Math.max(1, totalPlayers / 4); // Tambah jeda jika banyak pemain
        const cardMultiplier = Math.max(1, totalCards / 7); // Tambah jeda jika banyak kartu
        const dynamicDelay = Math.min(2000, baseDelay * playerMultiplier * cardMultiplier); // Maksimal 2 detik

        console.log(`[UNO] Sending ${totalCards} cards to ${player.name} with ${dynamicDelay}ms delay (players: ${totalPlayers})`);

        // Kirim kartu sebagai sticker dengan jeda dinamis
        for (let i = 0; i < player.hand.length; i++) {
            const card = player.hand[i];
            try {
                const sticker = await createCardSticker(card);
                const stickerBuffer = await sticker.toBuffer();
                await bot.sendMessage(player.id, { sticker: stickerBuffer });

                // Jeda lebih lama untuk kartu terakhir atau jika banyak pemain
                if (i < player.hand.length - 1) {
                    await sleep(dynamicDelay);
                } else {
                    await sleep(Math.min(1000, dynamicDelay)); // Jeda minimal untuk kartu terakhir
                }
            } catch (stickerError) {
                console.error(`[UNO] Gagal membuat sticker untuk kartu ${card.color} ${card.value}:`, stickerError);
                // Fallback ke teks jika sticker gagal
                await bot.sendMessage(player.id, {
                    text: `Kartu: *${card.color} ${card.value}* (sticker gagal dibuat)`
                });
                await sleep(200); // Jeda kecil untuk fallback
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

// --- Class Game dan Card ---
class Card {
    constructor(color, value) { this.color = color; this.value = value; }
    get isSpecial() { return ['Draw Two', 'Skip', 'Reverse', 'Wild', 'Wild Draw Four'].includes(this.value); }
    get isWild() { return ['Wild', 'Wild Draw Four'].includes(this.value); }
    get isActionCard() { return ['Draw Two', 'Skip', 'Reverse'].includes(this.value); }
}

class Game {
    constructor(chatId, creatorId) {
        this.chatId = chatId; this.creatorId = creatorId; this.players = []; this.deck = [];
        this.discardPile = []; this.currentPlayerIndex = 0; this.direction = 1;
        this.isGameRunning = false; this.unoCalled = {}; this.winners = []; this.playerPhoneMap = {};
    }
    addPlayer(player) {
        if (!this.isGameRunning && this.players.length < 10) {
            this.players.push({
                id: player.id,
                name: player.name,
                hand: [],
                isActive: true,
                pendingWildColor: null
            });

            if (player.phoneNumber) {
                const phoneId = player.phoneNumber + '@s.whatsapp.net';
                this.playerPhoneMap[phoneId] = player.id;
                console.log(`[UNO] Mapped ${phoneId} to ${player.id}`);
            }

            return true;
        }
        return false;
    }
    shufflePlayers() {
        for (let i = this.players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.players[i], this.players[j]] = [this.players[j], this.players[i]];
        }
    }
    startGame() {
        if (this.players.length < 2) return false;
        this.isGameRunning = true; this.shufflePlayers(); this.createDeck(); this.shuffleDeck(); this.dealCards();

        // Pastikan kartu pertama bukan kartu aksi
        let firstCard = this.deck.pop();
        while (firstCard.isWild || firstCard.isActionCard) {
            this.deck.push(firstCard);
            this.shuffleDeck();
            firstCard = this.deck.pop();
        }
        this.discardPile.push(firstCard);
        return true;
    }
    createDeck() {
        this.deck = [];
        const c = ['Red', 'Green', 'Blue', 'Yellow'], v = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Draw Two', 'Skip', 'Reverse'], w = ['Wild', 'Wild Draw Four'];
        c.forEach(a => v.forEach(b => { this.deck.push(new Card(a, b)); if (b !== '0') this.deck.push(new Card(a, b)); }));
        w.forEach(a => { for (let i = 0; i < 4; i++) this.deck.push(new Card('Wild', a)); });
    }
    shuffleDeck() { for (let i = this.deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]]; } }
    dealCards() { this.players.forEach(p => { p.hand = []; for (let i = 0; i < 7; i++) { if (this.deck.length === 0) this.resetDeck(); p.hand.push(this.deck.pop()); } }); }

    getCurrentPlayer() {
        const activePlayers = this.players.filter(p => p.isActive);
        if (activePlayers.length === 0) return null;

        if (this.currentPlayerIndex >= activePlayers.length) {
            this.currentPlayerIndex = 0;
        }

        return activePlayers[this.currentPlayerIndex];
    }

    getTopCard() { return this.discardPile[this.discardPile.length - 1]; }

    getNextPlayer() {
        const activePlayers = this.players.filter(p => p.isActive);
        if (activePlayers.length <= 1) return null;

        let nextIndex = (this.currentPlayerIndex + this.direction);
        if (nextIndex < 0) nextIndex = activePlayers.length - 1;
        else if (nextIndex >= activePlayers.length) nextIndex = 0;

        return activePlayers[nextIndex];
    }

    nextTurn() {
        const activePlayers = this.players.filter(p => p.isActive);
        if (activePlayers.length <= 1) return;

        this.currentPlayerIndex = (this.currentPlayerIndex + this.direction);
        if (this.currentPlayerIndex < 0) this.currentPlayerIndex = activePlayers.length - 1;
        else if (this.currentPlayerIndex >= activePlayers.length) this.currentPlayerIndex = 0;
    }

    drawCards(playerId, amount) {
        const p = this.players.find(pl => pl.id === playerId);
        if (!p) return;
        for (let i = 0; i < amount; i++) { if (this.deck.length === 0) this.resetDeck(); p.hand.push(this.deck.pop()); }
    }
    resetDeck() { this.deck = this.discardPile.slice(0, -1); this.discardPile = [this.discardPile.pop()]; this.shuffleDeck(); }

    handleSpecialCard(playedCard, bot, fromGroup) {
        const activePlayers = this.players.filter(p => p.isActive);

        if (playedCard.value === 'Reverse') {
            if (activePlayers.length === 2) {
                const nextPlayer = this.getNextPlayer();
                return {
                    skipTurn: true,
                    message: `↩️ Arah permainan dibalik! @${nextPlayer.id.split('@')[0]} dilewati karena hanya 2 pemain!`,
                    mentions: [nextPlayer.id]
                };
            } else {
                this.direction *= -1;
                return { skipTurn: false, message: `↩️ Arah permainan dibalik!` };
            }
        }

        if (playedCard.value === 'Skip') {
            const nextPlayer = this.getNextPlayer();
            return {
                skipTurn: true,
                message: `🚫 Giliran @${nextPlayer.id.split('@')[0]} dilewati!`,
                mentions: [nextPlayer.id]
            };
        }

        if (playedCard.value === 'Draw Two') {
            const nextPlayer = this.getNextPlayer();
            if (nextPlayer) {
                this.drawCards(nextPlayer.id, 2);
                return {
                    skipTurn: true,
                    message: `➕2️⃣ @${nextPlayer.id.split('@')[0]} harus mengambil 2 kartu dan dilewati!`,
                    affectedPlayer: nextPlayer,
                    mentions: [nextPlayer.id]
                };
            }
        }

        if (playedCard.value === 'Wild Draw Four') {
            const nextPlayer = this.getNextPlayer();
            if (nextPlayer) {
                this.drawCards(nextPlayer.id, 4);
                return {
                    skipTurn: true,
                    message: `➕4️⃣ @${nextPlayer.id.split('@')[0]} harus mengambil 4 kartu dan dilewati!`,
                    affectedPlayer: nextPlayer,
                    mentions: [nextPlayer.id]
                };
            }
        }

        return { skipTurn: false, message: null };
    }

    getGameStats() {
        const totalCards = this.players.reduce((sum, p) => sum + p.hand.length, 0);
        const avgCards = Math.round(totalCards / this.players.filter(p => p.isActive).length);
        return { totalCards, avgCards };
    }

    getCurrentLeaderboard() {
        return this.players
            .filter(p => p.isActive)
            .sort((a, b) => a.hand.length - b.hand.length)
            .map((p, i) => `${i + 1}. ${p.name} (${p.hand.length} kartu)`);
    }
}

// --- Module Export dan Logika Perintah ---
module.exports = {
    name: 'uno',
    alias: ['uno'],
    description: 'Mainkan game UNO dengan teman-temanmu!',
    category: 'game',
    execute: async (msg, { bot, args, usedPrefix }) => {
        const { from, sender, body } = msg;
        const senderName = msg.pushName || msg.senderName || sender.split('@')[0] || 'Pemain';
        bot.uno = bot.uno || {};
        const command = args[0]?.toLowerCase();
        let game = bot.uno[from];

        // Handle sticker messages in group (card playing)
        if (msg.isGroup && msg.message?.stickerMessage) {
            console.log('[UNO] Sticker message received in group');
            if (!game || !game.isGameRunning) {
                await bot.sendMessage(from, { text: 'Tidak ada permainan UNO yang sedang berjalan.' });
                return;
            }

            // Bypass if sticker is sent by bot itself
            if (msg.key.fromMe) {
                console.log("[UNO] Sticker sent by bot itself, bypassing");
                return;
            }

            const currentPlayer = game.getCurrentPlayer();
            if (!currentPlayer || currentPlayer.id !== sender) {
                await bot.sendMessage(from, {
                    text: 'Sekarang bukan giliranmu!'
                }, {
                    quoted: msg
                });
                console.log(`[UNO] Player ${sender} tried to play card out of turn.`);
                return;
            }

            const sticker = msg.message.stickerMessage;
            console.log('[UNO] Sticker object:', sticker);
            if (sticker.fileSha256) {
                // This is a sticker, try to identify the card from metadata
                try {
                    // Download sticker buffer to extract metadata
                    const stream = await downloadContentFromMessage(sticker, 'sticker');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }

                    // Extract metadata using wa-sticker-formatter
                    const metadata = await extractMetadata(buffer);
                    const packName = metadata.packName || '';
                    const packAuthor = metadata.packAuthor || '';
                    console.log('[UNO] Pack name:', packName);
                    console.log('[UNO] Pack author:', packAuthor);

                    if (packAuthor === 'UNO_GAME' && packName.startsWith('UNO_')) {
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

                        // Find the card in player's hand
                        const normalizeString = (str) => str.trim().toLowerCase().replace(/[\s_]+/g, ' ');

                        let cardIndex = currentPlayer.hand.findIndex(c =>
                            normalizeString(c.color) === normalizeString(color) &&
                            normalizeString(c.value) === normalizeString(value)
                        );

                        if (cardIndex === -1) {
                            console.log(`[UNO] Card not found in hand. Trying partial wild matching. Color: ${color}, Value: ${value}`);
                            // For Wild cards, try to match just by value ignoring color
                            if (color.toLowerCase() === 'wild') {
                                const altCardIndex = currentPlayer.hand.findIndex(c =>
                                    normalizeString(c.value) === normalizeString(value)
                                );
                                if (altCardIndex !== -1) {
                                    console.log('[UNO] Matched wild card by value only.');
                                    cardIndex = altCardIndex;
                                }
                            }

                            if (cardIndex === -1) {
                                await bot.sendMessage(from, { text: 'Kartu tidak ditemukan di tanganmu!' });
                                return;
                            }
                        }

                        const playedCard = currentPlayer.hand[cardIndex];
                        const topCard = game.getTopCard();

                        if (!playedCard.isWild && playedCard.color !== topCard.color && playedCard.value !== topCard.value) {
                            await bot.sendMessage(from, { text: 'Kartu tidak cocok dengan kartu teratas!' });
                            return;
                        }

                        // Handle wild card color selection
                        if (playedCard.isWild) {
                            // Set pending wild color for the player
                            currentPlayer.pendingWildColor = { cardIndex, playedCard };
                            await bot.sendMessage(from, { text: 'Untuk kartu wild, pilih warna dengan mengetik pesan di PM!' });
                            await bot.sendMessage(sender, { text: 'Pilih warna untuk kartu wild:\n\n• .red\n• .green\n• .blue\n• .yellow\n\nBalas dengan prefix warna (contoh: .Red)' });
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

                            await bot.sendMessage(from, {
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
                                await bot.sendMessage(from, {
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
                                                personalMessage = `🎉 *PERMAINAN SELESAI* 🎉\n\nKamu berhasil menempati *Juara ${playerRank.rank}*!\n\n🏆 *Final Leaderboard:*\n${winnersList}\n\n📊 *Statistik:*\n• Total pemain: ${game.players.length}\n• Total gerakan: ${totalMoves}\n\nGood game! 👏`;
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

                                delete bot.uno[from];
                                return;
                            }

                            await sleep(1000);
                            game.nextTurn();
                            const nextPlayer = game.getCurrentPlayer();
                            if (nextPlayer) {
                                await announceGameState(bot, from, game, nextPlayer.id,
                                    `Permainan berlanjut dengan ${remainingActivePlayers.length} pemain tersisa.`);
                                await sendPlayerCards(bot, nextPlayer, game);
                            }
                            return;
                        }

                        const specialResult = game.handleSpecialCard(playedCard, bot, from);

                        await bot.sendMessage(from, { text: announcement });

                        if (specialResult.message) {
                            await sleep(500);
                            const mentions = specialResult.mentions || [];
                            await bot.sendMessage(from, {
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
                            await announceGameState(bot, from, game, nextPlayer.id);
                            await sendPlayerCards(bot, nextPlayer, game);
                        }

                        return;
                    } else {
                        await bot.sendMessage(from, { text: 'Sticker tidak dikenali sebagai kartu UNO. Pastikan menggunakan sticker yang dikirim bot ke PM!' });
                        return;
                    }
                } catch (error) {
                    console.error('[UNO] Error processing sticker:', error);
                }
            }
        }

        // Handle color selection for wild cards in PM
        if (!msg.isGroup && ['.red', '.green', '.blue', '.yellow'].includes(body.toLowerCase())) {
            const activeGames = Object.values(bot.uno);
            game = activeGames.find(g => g.isGameRunning && g.players.some(p => p.id === sender && p.isActive && p.pendingWildColor));
            if (!game) return msg.reply('Tidak ada kartu wild yang menunggu pemilihan warna.');

            const fromGroup = game.chatId;
            const currentPlayer = game.players.find(p => p.id === sender);
            if (!currentPlayer || !currentPlayer.pendingWildColor) return msg.reply('Tidak ada kartu wild yang menunggu pemilihan warna.');

            // Remove prefix and capitalize first letter
            const colorName = body.slice(1).toLowerCase(); // Remove the dot and lowercase
            const chosenColor = colorName.charAt(0).toUpperCase() + colorName.slice(1); // Capitalize: red → Red            const { cardIndex, playedCard } = currentPlayer.pendingWildColor;

            playedCard.color = chosenColor;
            currentPlayer.hand.splice(cardIndex, 1);
            game.discardPile.push(playedCard);

            // Clear pending wild color
            currentPlayer.pendingWildColor = null;

            let announcement = `🃏 ${currentPlayer.name} memainkan *${playedCard.value}* dan memilih warna *${chosenColor}*.`;

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

                await bot.sendMessage(fromGroup, {
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
                    await bot.sendMessage(fromGroup, {
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
                                    personalMessage = `🎉 *PERMAINAN SELESAI* 🎉\n\nKamu berhasil menempati *Juara ${playerRank.rank}*!\n\n🏆 *Final Leaderboard:*\n${winnersList}\n\n📊 *Statistik:*\n• Total pemain: ${game.players.length}\n• Total gerakan: ${totalMoves}\n\nGood game! 👏`;
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

                    delete bot.uno[fromGroup];
                    return;
                }

                await sleep(1000);
                game.nextTurn();
                const nextPlayer = game.getCurrentPlayer();
                if (nextPlayer) {
                    await announceGameState(bot, fromGroup, game, nextPlayer.id,
                        `Permainan berlanjut dengan ${remainingActivePlayers.length} pemain tersisa.`);
                    await sendPlayerCards(bot, nextPlayer, game);
                }
                return;
            }

            const specialResult = game.handleSpecialCard(playedCard, bot, fromGroup);

            await bot.sendMessage(fromGroup, { text: announcement });

            if (specialResult.message) {
                await sleep(500);
                const mentions = specialResult.mentions || [];
                await bot.sendMessage(fromGroup, {
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
                await announceGameState(bot, fromGroup, game, nextPlayer.id);
                await sendPlayerCards(bot, nextPlayer, game);
            }

            return;
        }

        // Removed button-based card playing logic (replaced with sticker forwarding)

        switch (command) {
            case 'create':
                if (game) return msg.reply('Sudah ada sesi UNO di grup ini.');
                bot.uno[from] = new Game(from, sender);
                game = bot.uno[from];

                let phoneNumber = sender.split('@')[0];

                game.addPlayer({
                    id: sender,
                    name: senderName,
                    phoneNumber: phoneNumber 
                });

                const lobby_msg = `✅ Lobi UNO berhasil dibuat oleh ${senderName}!\n\nPemain lain bisa bergabung dengan mengetik \`.uno join\`.`;
                await bot.sendMessage(from, { text: lobby_msg });
                break;

            case 'join': {
                if (!game) return msg.reply('Tidak ada sesi UNO. Ketik `.uno create` untuk memulai.');
                if (game.isGameRunning) return msg.reply('Game sudah dimulai, tidak bisa bergabung.');
                if (game.players.find(p => p.id === sender)) return msg.reply('Kamu sudah bergabung.');

                let phoneNumber = null;
                if (msg.isGroup && msg.participant) {
                    // Coba dapatkan phone number dari participant info
                    phoneNumber = sender.split('@')[0];
                } else {
                    phoneNumber = sender.split('@')[0];
                }

                if (game.addPlayer({
                    id: sender,
                    name: senderName,
                    phoneNumber: phoneNumber
                })) {
                    const playerList = game.players.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
                    msg.reply(`✅ ${senderName} berhasil bergabung!\n\n*Pemain di Lobi (${game.players.length}/10):*\n${playerList}`);
                } else {
                    msg.reply('Gagal bergabung. Lobi sudah penuh.');
                }
                break;
            }

            case 'start': {
                if (!game) return msg.reply('Tidak ada sesi UNO. Buat dulu dengan `.uno create`.');
                if (game.isGameRunning) return msg.reply('Game sudah berjalan. Tidak bisa memulai lagi.');
                if (game.creatorId !== sender) return msg.reply('Hanya pembuat sesi yang bisa memulai game.');
                if (game.players.length < 2) return msg.reply('Minimal butuh 2 pemain untuk memulai!');

                if (game.startGame()) {
                    await msg.reply('🎮 Permainan UNO dimulai! Urutan pemain telah diacak. Mengirim kartu...');

                    for (const player of game.players) {
                        await sendPlayerCards(bot, player, game);
                    }

                    const currentPlayer = game.getCurrentPlayer();
                    await announceGameState(bot, from, game, currentPlayer.id);
                } else {
                    msg.reply('Gagal memulai game.');
                }
                break;
            }

            case 'draw': {
                if (!game || !game.isGameRunning) return msg.reply('Game belum dimulai.');
                const currentPlayer = game.getCurrentPlayer();
                if (!currentPlayer || currentPlayer.id !== sender) return msg.reply('Bukan giliranmu!');

                game.drawCards(sender, 1);
                await msg.reply(`${senderName} mengambil 1 kartu dari dek.`);

                game.nextTurn();
                const nextPlayer = game.getCurrentPlayer();

                if (nextPlayer) {
                    await announceGameState(bot, from, game, nextPlayer.id);
                    await sendPlayerCards(bot, currentPlayer, game);
                    await sendPlayerCards(bot, nextPlayer, game);
                }
                break;
            }

            case 'cards':
            case 'kartu': {
                if (!game || !game.isGameRunning) return msg.reply('Game belum dimulai.');
                const player = game.players.find(p => p.id === sender);
                if (!player) return msg.reply('Kamu tidak ada dalam game ini.');
                await sendPlayerCards(bot, player, game);
                msg.reply('Kartu terbarumu sudah dikirim ulang ke PM.');
                break;
            }

            case 'stats': {
                if (!game || !game.isGameRunning) return msg.reply('Game belum dimulai.');

                const stats = game.getGameStats();
                const leaderboard = game.getCurrentLeaderboard();
                const currentPlayer = game.getCurrentPlayer();

                const statsMessage = `📊 *STATISTIK GAME UNO* 📊\n\n` +
                    `🎯 *Giliran saat ini:* ${currentPlayer ? currentPlayer.name : 'N/A'}\n` +
                    `🃏 *Total kartu tersisa:* ${stats.totalCards}\n` +
                    `📈 *Rata-rata kartu:* ${stats.avgCards}\n` +
                    `👥 *Pemain aktif:* ${game.players.filter(p => p.isActive).length}/${game.players.length}\n\n` +
                    `🏆 *Leaderboard Sementara:*\n${leaderboard.join('\n')}`;

                msg.reply(statsMessage);
                break;
            }

            case 'status': {
                if (!game) return msg.reply('Tidak ada sesi UNO di grup ini.');

                if (game.isGameRunning) {
                    const currentPlayer = game.getCurrentPlayer();
                    const topCard = game.getTopCard();
                    const activePlayers = game.players.filter(p => p.isActive);

                    const statusMessage = `🎮 *STATUS PERMAINAN* 🎮\n\n` +
                        `🃏 *Kartu teratas:* ${topCard.color} ${topCard.value}\n` +
                        `🎯 *Giliran:* ${currentPlayer ? currentPlayer.name : 'N/A'}\n` +
                        `👥 *Pemain aktif:* ${activePlayers.length}\n` +
                        `📊 *Total gerakan:* ${game.discardPile.length - 1}`;

                    msg.reply(statusMessage);
                } else {
                    const playerList = game.players.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
                    msg.reply(`⏳ *LOBI MENUNGGU* ⏳\n\n*Pemain di lobi (${game.players.length}/10):*\n${playerList}\n\nKetik \`.uno start\` untuk memulai!`);
                }
                break;
            }

            case 'end': {
                if (!game) return msg.reply('Tidak ada sesi UNO.');
                if (game.creatorId !== sender) return msg.reply('Hanya pembuat sesi yang bisa mengakhiri game.');

                for (const player of game.players) {
                    if (player.id !== sender) {
                        try {
                            await bot.sendMessage(player.id, { text: 'ℹ️ Permainan telah dihentikan oleh host.' });
                        } catch (e) {
                            console.error(`Failed to notify player ${player.id}:`, e);
                        }
                    }
                }

                delete bot.uno[from];
                msg.reply('🛑 Sesi UNO telah dihentikan.');

                break;
            }

            default:
                msg.reply(
                    '🃏 *Perintah Game UNO* 🃏\n\n' +
                    '`.uno create` - Membuat lobi permainan\n' +
                    '`.uno join` - Bergabung ke lobi\n' +
                    '`.uno start` - Memulai permainan\n' +
                    '`.uno cards` - Meminta kartu dikirim ulang ke PM\n' +
                    '`.uno draw` - Mengambil satu kartu dari dek\n' +
                    '`.uno status` - Melihat status permainan\n' +
                    '`.uno stats` - Melihat statistik dan leaderboard\n' +
                    '`.uno end` - Menghentikan permainan (hanya host)'
                );
                break;
        }
    }
};