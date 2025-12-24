/**
 * GameHandler.js
 * Handler untuk game
 */

const { handleFamily100Answer } = require("./Family100Handler");

function initializeGameObjects(bot) {
  if (!bot.game) {
    bot.game = {};
  }
  if (!bot.game.tebakkata) {
    bot.game.tebakkata = {};
  }
  if (!bot.game.family100) {
    bot.game.family100 = {};
  }
  
  console.log('[GAME_HANDLER] Game objects initialized');
}

async function handleGameAnswer(msg, bot) {
    initializeGameObjects(bot);

    const botPrefix = /^[/!#$%+£¢€¥^°=¶∆×÷π√✓©®:;?&.\-]/;
    if (msg.text && botPrefix.test(msg.text)) {
        return false;
    }

    const handlers = [
        handleFamily100Answer
    ];

    for (const handler of handlers) {
        try {
            const handled = await handler(msg, bot);
            if (handled) {
                console.log(`[GAME_HANDLER] Answer handled by ${handler.name}`);
                return true;
            }
        } catch (error) {
            console.error(`[GAME_HANDLER] Error in ${handler.name}:`, error);

            if (error.message?.includes('rate-overlimit')) {
                console.log('[GAME_HANDLER] Rate limit error caught, continuing...');
            }
        }
    }

    return false;
}

function endGameSession(bot, chatId, gameType) {
  if (bot.game?.[gameType]?.[chatId]) {
    if (bot.game[gameType][chatId].timeout) {
      clearTimeout(bot.game[gameType][chatId].timeout);
    }
    
    delete bot.game[gameType][chatId];
    
    // Clear processing state
    if (processingAnswers.has(chatId)) {
      processingAnswers.delete(chatId);
    }
    
    console.log(`[GAME_HANDLER] Ended ${gameType} session for ${chatId}`);
    return true;
  }
  return false;
}

function getActiveGameSessions(bot) {
  const sessions = {
    family100: 0,
    tebakkata: 0,
    total: 0
  };

  if (bot.game?.family100) {
    sessions.family100 = Object.keys(bot.game.family100).length;
  }
  
  if (bot.game?.tebakkata) {
    sessions.tebakkata = Object.keys(bot.game.tebakkata).length;
  }

  sessions.total = sessions.family100 + sessions.tebakkata;

  return sessions;
}

function getGameStatistics(bot) {
    const activeSessions = getActiveGameSessions(bot);

    const stats = {
        activeSessions,
        family100Sessions: [],
        tebakkataSessions: []
    };

    if (bot.game?.family100) {
        for (const [chatId, session] of Object.entries(bot.game.family100)) {
            stats.family100Sessions.push({
                chatId,
                correctAnswers: session.correctAnswers || 0,
                totalAnswers: session.totalAnswers || 0,
                players: Object.keys(session.sessionScores || {}).length
            });
        }
    }

    if (bot.game?.tebakkata) {
        for (const [chatId, session] of Object.entries(bot.game.tebakkata)) {
            stats.tebakkataSessions.push({
                chatId,
                level: session.level || 0,
                players: Object.keys(session.sessionScores || {}).length,
                answered: session.isAnswered || false
            });
        }
    }

    return stats;
}

module.exports = {
    handleGameAnswer,
    getGameStatistics,
    initializeGameObjects,
    endGameSession,
    getActiveGameSessions,
};