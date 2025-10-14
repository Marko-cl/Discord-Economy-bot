const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, isUserBlacklisted, progressQuests, reply } = require('../../utils/utils');
const { withSafeReply } = require('../../utils/safeReply');
const { validators } = require('../../utils/validation');
const { hasItem } = require('../../utils/inventory');
const { atomicUserUpdate } = require('../../utils/atomicEconomyOperations');
const logger = require('../../logger');
const { checkRateLimit } = require('../../utils/rateLimiting');
const { secureRandomInt, secureRandomChoice } = require('../../utils/secureRandom');

const WORK_COOLDOWN_MS = 60 * 1000; // 1 minute cooldown

const workMessages = [
  "You worked at McDonald's and earned some coins!",
  "You delivered pizzas and got a nice tip!",
  "You mowed lawns for your neighbors!",
  "You helped someone move and they paid you!",
  "You did some freelance coding work!",
  "You worked as a waiter and got good tips!",
  "You helped with a construction project!",
  "You did some gardening work!",
  "You worked as a cashier at a store!",
  "You helped with a cleaning job!"
];

const rateLimiter = (userId) => checkRateLimit(userId, 'work', 5, 30000); // 5 uses per 30 seconds for work command

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Work to earn coins'),

  execute: withSafeReply(async (interaction) => {
    // Interaction is already deferred by the global handler
    const userId = interaction.user.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in work command: ${userId}`);
      return await reply(interaction, {
        content: '❌ Invalid user ID!',
        flags: 1 << 6
      });
    }

    try {
      // Get user data
      let user = await getUser(userId);
      
      if (!user) {
        return await reply(interaction, {
          content: '❌ User not found in database!',
          flags: 1 << 6
        });
      }

      // University degree requirement
      if (!hasItem(user, 'University degree')) {
        return await reply(interaction, {
          content: '🎓 You need a **University degree** from the shop to use /work! Purchase it with `/shop`.',
          flags: 1 << 6
        });
      }

      // Check cooldown
      const now = Date.now();
      const lastWork = user.lastWork || 0;
      const timeSinceLastWork = now - lastWork;

      if (timeSinceLastWork < WORK_COOLDOWN_MS) {
        return await reply(interaction, {
          content: `⏰ You need to wait 60 seconds before working again!`,
          flags: 1 << 6
        });
      }

      // Calculate work reward (random between 50-150) using secure random
      const minReward = 50;
      const maxReward = 150;
      const reward = secureRandomInt(minReward, maxReward);

      // Select random work message using secure random
      const workMessage = secureRandomChoice(workMessages);

      // Update user with atomic operation
      const result = await atomicUserUpdate(userId, {
        coins: (user.coins || 0) + reward,
        lastWork: now
      });

      if (!result.success) {
        logger.error('Atomic user update failed in work command:', result.error);
        return await reply(interaction, {
          content: '❌ An error occurred while processing your work!',
          flags: 1 << 6
        });
      }

      // Update quest progress
      progressQuests(userId, ['work', 'work_hard', 'work_legend'], interaction).catch(e => logger.error('progressQuests error:', e));

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('💼 Work Complete!')
        .setDescription(workMessage)
        .addFields(
          { name: '💰 Earnings', value: `${reward} coins`, inline: true },
          { name: '⏰ Next Work', value: 'Available in 1 minute', inline: true }
        )
        .setTimestamp();

      return await reply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('Error in work command:', error);
      return await reply(interaction, {
        content: '❌ An error occurred while processing your work!',
        flags: 1 << 6
      });
    }
  }, { isUserBlacklisted, rateLimiter })
}; 