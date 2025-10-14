const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, isUserBlacklisted, progressQuests, reply } = require('../../utils/utils');
const { withSafeReply } = require('../../utils/safeReply');
const { validators } = require('../../utils/validation');
const { atomicUserUpdate } = require('../../utils/atomicEconomyOperations');
const { checkRateLimit } = require('../../utils/rateLimiting');
const logger = require('../../logger');
const { secureRandomInt, secureRandomChoice } = require('../../utils/secureRandom');

const rateLimiter = (userId) => checkRateLimit(userId, 'beg', 10, 15000); // 10 uses per 15 seconds for beg command

const BEG_COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown

const begMessages = [
  "Someone felt sorry for you and gave you some coins!",
  "A kind stranger dropped some coins!",
  "You found some loose change on the ground!",
  "Someone donated to your cause!",
  "You begged successfully and got some coins!",
  "A passerby took pity on you!",
  "You found some coins in a fountain!",
  "Someone gave you their spare change!",
  "You received a small donation!",
  "A generous person helped you out!"
];

const failMessages = [
  "Nobody gave you anything this time...",
  "People ignored your begging...",
  "You got nothing but dirty looks...",
  "No one was feeling generous today...",
  "Your begging was unsuccessful...",
  "People walked past without helping...",
  "You got nothing but rejection...",
  "No coins for you this time...",
  "Your begging didn't work out...",
  "Nobody wanted to help you..."
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('beg')
    .setDescription('Beg for coins'),

  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in beg command: ${userId}`);
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
      const lastBeg = user.lastBeg || 0;
      const timeSinceLastBeg = now - lastBeg;
      
      if (timeSinceLastBeg < BEG_COOLDOWN_MS) {
        const timeRemaining = BEG_COOLDOWN_MS - timeSinceLastBeg;
        const seconds = Math.ceil(timeRemaining / 1000);
        return await reply(interaction, {
          content: `⏰ You need to wait ${seconds} seconds before begging again!`,
          flags: 1 << 6
        });
      }

      // 70% chance of success using secure random
      const success = secureRandomInt(1, 100) <= 70;
      
      if (success) {
        // Success: earn 10-50 coins using secure random
        const reward = secureRandomInt(10, 50);
        const message = secureRandomChoice(begMessages);
        
        // Use atomic operation to update user
        const result = await atomicUserUpdate(userId, {
          coins: (user.coins || 0) + reward,
          lastBeg: now
        });
        
        if (!result.success) {
          logger.error('Atomic user update failed in beg command:', result.error);
          return await reply(interaction, {
            content: '❌ An error occurred while processing your begging!',
            flags: 1 << 6
          });
        }

        // Update quest progress
        progressQuests(userId, ['beg', 'beg_success', 'beg_persistent'], interaction).catch(e => logger.error('progressQuests error:', e));
        
        const embed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('🙏 Begging Successful!')
          .setDescription(message)
          .addFields(
            { name: '💰 Earnings', value: `${reward} coins`, inline: true },
            { name: '⏰ Next Beg', value: 'Available in 60 seconds', inline: true }
          )
          .setTimestamp();
        
        return await reply(interaction, { embeds: [embed] });
      } else {
        // Failure: no coins, just update cooldown using secure random
        const message = secureRandomChoice(failMessages);
        
        const result = await atomicUserUpdate(userId, {
          lastBeg: now
        });
        
        if (!result.success) {
          logger.error('Atomic user update failed in beg command (failure):', result.error);
          return await reply(interaction, {
            content: '❌ An error occurred while processing your begging!',
            flags: 1 << 6
          });
        }

        // Update quest progress
        progressQuests(userId, ['beg'], interaction).catch(e => logger.error('progressQuests error:', e));
        
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🙏 Begging Failed')
          .setDescription(message)
          .addFields(
            { name: '💰 Earnings', value: '0 coins', inline: true },
            { name: '⏰ Next Beg', value: 'Available in 60 seconds', inline: true }
          )
          .setTimestamp();
        
        return await reply(interaction, { embeds: [embed] });
      }
    } catch (error) {
      logger.error('Error in beg command:', error);
      return await reply(interaction, {
        content: '❌ An error occurred while begging!',
        flags: 1 << 6
      });
    }
  }, { isUserBlacklisted, rateLimiter })
}; 