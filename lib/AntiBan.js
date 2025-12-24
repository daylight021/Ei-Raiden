/**
 * Anti-Ban Module for WhatsApp Bot
 * Implements delays and rate limiting to mimic human behavior and prevent bans.
 */

class AntiBan {
  constructor() {
    // Rate limiting: Map of userId -> array of timestamps
    this.userCommandHistory = new Map();

    // Last message send time for delay between messages
    this.lastMessageTime = 0;

    // New: Command rate limiting for safeguard
    this.commandHistory = new Map(); // userId -> array of timestamps (for 5 in 7 seconds)
    this.consecutiveCommands = new Map(); // userId -> {count, lastTime} (for 5 in a row)

    // Configuration (can be overridden via environment variables)
    this.config = {
      incomingCommandDelay: parseInt(process.env.ANTI_BAN_INCOMING_DELAY) || 1000, // 1 second default
      betweenMessagesDelay: parseInt(process.env.ANTI_BAN_BETWEEN_DELAY) || 2000, // 2 seconds default
      rateLimitMaxCommands: parseInt(process.env.ANTI_BAN_MAX_COMMANDS) || 5, // 5 commands
      rateLimitWindowMs: parseInt(process.env.ANTI_BAN_WINDOW_MS) || 60000, // per minute
    };
  }

  /**
   * Delays processing of incoming commands to simulate human response time.
   * @param {number} delayMs - Delay in milliseconds (optional, uses config default)
   * @returns {Promise<void>}
   */
  async delayIncomingCommand(delayMs = this.config.incomingCommandDelay) {
    return new Promise(resolve => setTimeout(resolve, delayMs));
  }

  /**
   * Delays between bot messages to avoid rapid-fire sends.
   * @param {number} delayMs - Delay in milliseconds (optional, uses config default)
   * @returns {Promise<void>}
   */
  async delayBetweenMessages(delayMs = this.config.betweenMessagesDelay) {
    const now = Date.now();
    const timeSinceLastMessage = now - this.lastMessageTime;
    const requiredDelay = Math.max(0, delayMs - timeSinceLastMessage);

    if (requiredDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, requiredDelay));
    }

    this.lastMessageTime = Date.now();
  }

  /**
   * Checks if a user is within the rate limit for commands.
   * @param {string} userId - The user's ID
   * @param {number} maxCommands - Max commands allowed (optional, uses config default)
   * @param {number} windowMs - Time window in milliseconds (optional, uses config default)
   * @returns {boolean} - True if allowed, false if rate limited
   */
  checkRateLimit(userId, maxCommands = this.config.rateLimitMaxCommands, windowMs = this.config.rateLimitWindowMs) {
    const now = Date.now();
    const userHistory = this.userCommandHistory.get(userId) || [];

    // Filter out timestamps outside the window
    const recentCommands = userHistory.filter(timestamp => now - timestamp < windowMs);

    if (recentCommands.length >= maxCommands) {
      return false; // Rate limited
    }

    // Add current timestamp and update history
    recentCommands.push(now);
    this.userCommandHistory.set(userId, recentCommands);

    return true; // Allowed
  }

  /**
   * Checks command limit: maximum 5 commands within 7 seconds.
   * @param {string} userId - The user's ID
   * @param {number} maxCommands - Max commands allowed (default 5)
   * @param {number} windowMs - Time window in milliseconds (default 7000ms = 7 seconds)
   * @returns {boolean} - True if allowed, false if limit exceeded
   */
  checkCommandLimit(userId, maxCommands = 5, windowMs = 7000) {
    const now = Date.now();
    const history = this.commandHistory.get(userId) || [];

    // Filter out timestamps outside the window
    const recent = history.filter(ts => now - ts < windowMs);

    if (recent.length >= maxCommands) {
      return false; // Limit exceeded
    }

    // Add current timestamp and update history
    recent.push(now);
    this.commandHistory.set(userId, recent);

    return true; // Allowed
  }

  /**
   * Checks consecutive command limit: maximum 5 commands in a row.
   * Resets if no command sent for more than resetMs.
   * @param {string} userId - The user's ID
   * @param {number} maxConsecutive - Max consecutive commands (default 5)
   * @param {number} resetMs - Reset time in milliseconds (default 10000ms = 10 seconds)
   * @returns {boolean} - True if allowed, false if limit exceeded
   */
  checkConsecutiveLimit(userId, maxConsecutive = 5, resetMs = 10000) {
    const now = Date.now();
    const data = this.consecutiveCommands.get(userId) || { count: 0, lastTime: 0 };

    // Reset if time since last command exceeds resetMs
    if (now - data.lastTime > resetMs) {
      data.count = 0;
    }

    data.count++;
    data.lastTime = now;

    this.consecutiveCommands.set(userId, data);

    if (data.count > maxConsecutive) {
      return false; // Limit exceeded
    }

    return true; // Allowed
  }

  /**
   * Wraps the bot's sendMessage function to include delays.
   * @param {Function} originalSendMessage - The original bot.sendMessage function
   * @returns {Function} - Wrapped sendMessage function
   */
  wrapSendMessage(originalSendMessage) {
    const self = this;
    return async function(...args) {
      await self.delayBetweenMessages();
      return originalSendMessage.apply(this, args);
    };
  }
}

module.exports = new AntiBan();
