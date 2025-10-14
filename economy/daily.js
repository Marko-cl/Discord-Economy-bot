const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, isUserBlacklisted, progressQuests, reply } = require('../../utils/utils');
const { withSafeReply } = require('../../utils/safeReply');
const { validators } = require('../../utils/validation');
const { atomicUserUpdate } = require('../../utils/atomicEconomyOperations');
const { checkRateLimit } = require('../../utils/rateLimiting');
const { secureRandomInt } = require('../../utils/secureRandom');
const { atomicInventoryOperation } = require('../../utils/atomicOperations');
const logger = require('../../logger');

const ONE_DAY_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const rateLimiter = (userId) => checkRateLimit(userId, 'daily', 1, 3600000); // 1 hour cooldown - KEEPING THIS (it's intentional for daily)

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Collect your daily reward'),

  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in daily command: ${userId}`);
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

      // Check cooldown
      const now = Date.now();
      const lastDaily = user.lastDaily || 0;
      const timeSinceLastDaily = now - lastDaily;

      if (timeSinceLastDaily < ONE_DAY_MS) {
        const timeRemaining = ONE_DAY_MS - timeSinceLastDaily;
        const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
        const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
        
        return await reply(interaction, {
          content: `⏰ You've already collected your daily reward! Come back in ${hours}h ${minutes}m.`,
          flags: 1 << 6
        });
      }

      // Calculate daily reward (base 1000 + streak bonus)
      const streak = user.dailyStreak || 0;
      const baseReward = 1000;
      const streakBonus = Math.min(streak * 100, 1000); // Max 1000 bonus
      const baseTotalReward = baseReward + streakBonus;
      
      // Apply seasonal multiplier
      const { applySeasonalMultiplier, getCurrentMultiplier } = require('../../utils/utils');
      const totalReward = applySeasonalMultiplier(baseTotalReward);
      const { multiplier, source } = getCurrentMultiplier();

      // Generate random number of crates (1-4)
      const crateCount = secureRandomInt(1, 5); // 1 to 4 crates

      // Update user with atomic operation
      const newStreak = streak + 1;
      const result = await atomicUserUpdate(userId, {
        coins: (user.coins || 0) + totalReward,
        lastDaily: now,
        dailyStreak: newStreak
      });

      if (!result.success) {
        logger.error('Atomic user update failed in daily command:', result.error);
        return await reply(interaction, {
          content: '❌ An error occurred while collecting daily reward!',
          flags: 1 << 6
        });
      }

      // Add crates to inventory
      try {
        await atomicInventoryOperation(userId, 'Loot Crate', crateCount, 'add');
        logger.info(`Successfully added ${crateCount} Loot Crate(s) to user ${userId}`);
      } catch (error) {
        logger.error('Failed to add crates to inventory:', error);
        // Don't fail the entire command, just log the error
      }

      // Update quest progress
      progressQuests(userId, ['daily'], interaction).catch(e => logger.error('progressQuests error:', e));

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('💰 Daily Reward Collected!')
        .setDescription(`You received **${totalReward} coins** and **${crateCount} Loot Crate${crateCount > 1 ? 's' : ''}**!`)
        .addFields(
          { name: '🔥 Streak', value: `${newStreak} days`, inline: true },
          { name: '💎 Base Reward', value: `${baseReward} coins`, inline: true },
          { name: '⚡ Streak Bonus', value: `${streakBonus} coins`, inline: true },
          { name: '📦 Crates', value: `${crateCount} Loot Crate${crateCount > 1 ? 's' : ''}`, inline: true }
        )
        .setTimestamp();

      // Add seasonal bonus info if there's a multiplier
      if (multiplier > 1) {
        const bonusPercent = Math.round((multiplier - 1) * 100);
        embed.addFields({
          name: `${source.emoji} Seasonal Bonus`,
          value: `+${bonusPercent}% bonus applied!`,
          inline: true
        });
      }

      return await reply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('Daily command error:', error);
      return await reply(interaction, {
        content: '❌ An error occurred while collecting daily reward!',
        flags: 1 << 6
      });
    }
  }, { isUserBlacklisted, rateLimiter })
}; 