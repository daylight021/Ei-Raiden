/**
 * Family100Handler.js
 * Handler untuk game Family100
 */

const similarity = require('similarity');

// ========== ANSWER TRACKING ==========
// Track answers yang sedang diproses untuk prevent race condition
const processingAnswers = new Map(); // chatId -> Set of userIds

// Track message IDs yang sudah diproses
const processedMessageIds = new Set();

// Cleanup every 5 minutes
setInterval(() => {
  processedMessageIds.clear();
  processingAnswers.clear();
  console.log('[GAME_HANDLER] Cleared processing cache');
}, 5 * 60 * 1000);

// ========== FAMILY 100 HANDLER ==========
const FAMILY100_CONFIG = {
  SIMILARITY_THRESHOLD: 0.72,
  TIMEOUT_DURATION: 120000,
  NEXT_QUESTION_DELAY: 3000
};

async function handleFamily100Answer(msg, bot) {
  try {
    if (!bot.game?.family100?.[msg.from]) {
      return false;
    }

    const gameSession = bot.game.family100[msg.from];
    if (!gameSession?.jawaban) return false;

    const userAnswer = msg.body.toLowerCase().replace(/[^\w\s\-]+/g, '').trim();
    const isSurrender = /^((me)?nyerah|surr?ender)$/i.test(msg.body);

    if (isSurrender) {
      const family100Command = bot.commands.get('family100');
      if (family100Command) {
        await family100Command.endGame(bot, msg.from, 'surrender');
      }
      return true;
    }

    let answerIndex = gameSession.jawaban.findIndex(jawaban =>
      jawaban.toLowerCase().replace(/[^\w\s\-]+/g, '') === userAnswer
    );

    if (answerIndex < 0) {
      const similarities = gameSession.jawaban.map(jawaban =>
        similarity(jawaban.toLowerCase().replace(/[^\w\s\-]+/g, ''), userAnswer)
      );
      const maxSimilarity = Math.max(...similarities);

      if (maxSimilarity >= FAMILY100_CONFIG.SIMILARITY_THRESHOLD) {
        answerIndex = similarities.indexOf(maxSimilarity);
        
        await bot.sendMessage(msg.from, {
          text: `💡 Hampir benar! Coba lagi dengan kata yang lebih tepat!`
        });
      }

      if (answerIndex < 0 || gameSession.terjawab[answerIndex]) {
        return false;
      }
    }

    if (gameSession.terjawab[answerIndex]) {
      await bot.sendMessage(msg.from, {
        text: `❌ Jawaban "${gameSession.jawaban[answerIndex]}" sudah dijawab oleh @${gameSession.answeredBy[answerIndex].split('@')[0]}!`,
        mentions: [gameSession.answeredBy[answerIndex]]
      });
      return true;
    }

    gameSession.terjawab[answerIndex] = true;
    gameSession.answeredBy[answerIndex] = msg.sender;
    gameSession.correctAnswers++;

    if (!gameSession.sessionScores[msg.sender]) {
      gameSession.sessionScores[msg.sender] = 0;
    }
    gameSession.sessionScores[msg.sender] += 1000;

    if (gameSession.timeout) {
      clearTimeout(gameSession.timeout);
      gameSession.timeout = setTimeout(() => {
        const family100Command = bot.commands.get('family100');
        if (family100Command) {
          family100Command.endGame(bot, msg.from, 'timeout');
        }
      }, FAMILY100_CONFIG.TIMEOUT_DURATION);
    }

    const isComplete = gameSession.terjawab.every(Boolean);

    let statusText = `🎯 *FAMILY 100* ${isComplete ? '✅' : '📊'}\n\n`;
    statusText += `❓ *Soal:* ${gameSession.soal}\n\n`;
    statusText += `📋 *Jawaban* (${gameSession.correctAnswers}/${gameSession.totalAnswers}):\n`;
    
    gameSession.jawaban.forEach((jawaban, index) => {
      if (gameSession.terjawab[index]) {
        statusText += `✅ (${index + 1}) ${jawaban} - @${gameSession.answeredBy[index].split('@')[0]}\n`;
      } else {
        statusText += `❌ (${index + 1}) _______________\n`;
      }
    });

    if (isComplete) {
      statusText += `\n🎉 *SEMUA JAWABAN TERJAWAB!*\n`;
      statusText += `🚀 Soal berikutnya akan muncul dalam ${FAMILY100_CONFIG.NEXT_QUESTION_DELAY / 1000} detik...\n`;
    } else {
      statusText += `\n💰 *1000* poin per jawaban benar\n`;
      statusText += `⏰ Game berlanjut... Cari jawaban yang tersisa!\n`;
    }

    const mentions = gameSession.answeredBy.filter(Boolean);
    
    await bot.sendMessage(msg.from, {
      text: statusText,
      mentions: [...new Set(mentions)]
    });

    if (isComplete) {
      setTimeout(() => {
        if (bot.game.family100[msg.from]) {
          const family100Command = bot.commands.get('family100');
          if (family100Command) {
            family100Command.sendQuestion(bot, msg.from);
          }
        }
      }, FAMILY100_CONFIG.NEXT_QUESTION_DELAY);
    }

    return true;

  } catch (error) {
    console.error('[GAME_HANDLER] Error handling Family100 answer:', error);
    return false;
  }
}

module.exports = {
  handleFamily100Answer,
  FAMILY100_CONFIG,
};