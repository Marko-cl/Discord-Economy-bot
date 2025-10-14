const { SlashCommandBuilder } = require('discord.js');
const {
  getUser,
  formatKelocoins,
  getSeasonalInfo,
  progressQuests,
  reply,
  safeGetNumber,
  isUserBlacklisted
} = require('../../utils/utils');
const { validators } = require('../../utils/validation');
const { withSafeReply } = require('../../utils/safeReply');
const { atomicCoinUpdate } = require('../../utils/atomicEconomyOperations');
const logger = require('../../logger');
const { checkRateLimit } = require('../../utils/rateLimiting');

const rateLimiter = (userId) => checkRateLimit(userId, 'balance', 10, 5000);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your coin balance'),
  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in balance command: ${userId}`);
      return await reply(interaction, {
        content: '❌ Invalid user ID!',
        flags: 1 << 6
      });
    }

    // Get user data
    let user;
    try {
      user = await getUser(userId, { coins: 1 });
      if (!user) {
        logger.warn(`Failed to load user data for balance check: ${userId}`);
        return reply(interaction, 'Error: Could not load user data. Please try again.');
      }
    } catch (err) {
      logger.error(`DB error on balance check: ${err}`);
      return reply(interaction, 'Database error: Could not load user data. Please try again later.');
    }

    // Validate user data structure
    if (typeof user !== 'object' || user === null) {
      return reply(interaction, 'User data is corrupted.');
    }

    // Update quest progress
    progressQuests(userId, ['balance_check'], interaction).catch(e => logger.error('progressQuests error:', e));
    
    // Get and validate coin balance
    let coins = safeGetNumber(user, 'coins');
    if (coins < 0) {
      logger.warn(`User ${userId} has negative balance: ${coins}, resetting to 0`);
      coins = 0;
      
      // Fix the negative balance using atomic operation
      try {
        const result = await atomicCoinUpdate(userId, 0, 'set');
        if (!result.success) {
          logger.error(`Failed to fix negative balance for user ${userId}:`, result.error);
        }
      } catch (err) {
        logger.error(`Failed to fix negative balance for user ${userId}:`, err);
      }
    }

    // Get seasonal information
    let seasonalMessage = '';
    try {
      const seasonalInfo = getSeasonalInfo();
      if (seasonalInfo) {
        seasonalMessage = `\n🎉 **${seasonalInfo.name}** is active! All rewards are multiplied by x${seasonalInfo.multiplier}!`;
      }
      logger.economy(userId, 'balance_check', `Coins: ${coins}, Seasonal: ${seasonalInfo ? seasonalInfo.name : 'None'}`);
    } catch (err) {
      logger.error('Error getting seasonal info:', err);
    }

    // Send response
    try {
      await reply(interaction, `You have ${formatKelocoins(coins)}.${seasonalMessage}`);
    } catch (err) {
      logger.error('Discord API error in /balance final reply:', err);
      // Fallback response
      await reply(interaction, `You have ${formatKelocoins(coins)} coins.`);
    }
  }, { isUserBlacklisted, rateLimiter })
};
