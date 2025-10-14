const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { withSafeReply } = require('../../utils/safeReply');
const { isUserBlacklisted, progressQuests, getUser } = require('../../utils/utils');
const { validators } = require('../../utils/validation');
const { reply } = require('../../utils/formatting');
const logger = require('../../logger');
const { 
  getCurrentMultiplier, 
  getCurrentSeason, 
  getCurrentSpecialEvent, 
  getNextSeason, 
  getDaysUntilNext,
  applySeasonalMultiplier
} = require('../../utils/seasonalMultiplier');
const { checkRateLimit } = require('../../utils/rateLimiting');

const rateLimiter = (userId) => checkRateLimit(userId, 'seasonal', 1, 3600000); // 1 hour cooldown - KEEPING THIS (it's intentional for seasonal)

module.exports = [
  // /seasonal
  {
    data: new SlashCommandBuilder()
      .setName('seasonal')
      .setDescription('Check current seasonal bonuses and multipliers'),
    execute: withSafeReply(async (interaction) => {
      const userId = interaction.user.id;
      
      // Input validation
      if (!validators.userId(userId)) {
        logger.warn(`Invalid user ID in seasonal command: ${userId}`);
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

        const { multiplier, source, type } = getCurrentMultiplier();
        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const year = now.getFullYear();
        
        // Calculate time until next season/event
        const currentSeason = getCurrentSeason();
        const nextSeason = getNextSeason(currentSeason);
        const daysUntilNext = getDaysUntilNext(currentSeason, nextSeason);
        
        // Get all active bonuses
        const activeBonuses = [];
        activeBonuses.push({
          name: `${source.emoji} ${source.name}`,
          multiplier: multiplier,
          description: source.description
        });
        
        // Check if there are any other active events
        const specialEvent = getCurrentSpecialEvent();
        if (specialEvent && type === 'event') {
          activeBonuses.push({
            name: `${currentSeason.emoji} ${currentSeason.name}`,
            multiplier: currentSeason.multiplier,
            description: `${currentSeason.name} bonus (overridden by ${specialEvent.name})`
          });
        }

        const embed = new EmbedBuilder()
          .setColor(source.color)
          .setTitle(`${source.emoji} Current Seasonal Status`)
          .setDescription(`**${source.description}**\n\nAll commands now give **${Math.round((multiplier - 1) * 100)}% bonus rewards**!`)
          .addFields(
            { 
              name: '🎯 Active Multiplier', 
              value: `**${multiplier}x** (${Math.round((multiplier - 1) * 100)}% bonus)`, 
              inline: true 
            },
            { 
              name: '📅 Current Date', 
              value: `${month}/${day}/${year}`, 
              inline: true 
            },
            { 
              name: '⏰ Next Change', 
              value: `${daysUntilNext} days until ${nextSeason.name}`, 
              inline: true 
            }
          )
          .setTimestamp();

        // Add active bonuses section
        if (activeBonuses.length > 1) {
          const bonusesText = activeBonuses.map(bonus => 
            `• ${bonus.name}: **${bonus.multiplier}x** - ${bonus.description}`
          ).join('\n');
          
          embed.addFields({
            name: '🎁 Active Bonuses',
            value: bonusesText,
            inline: false
          });
        }

        // Add example rewards
        const examples = [
          { base: 100, name: 'Daily Reward' },
          { base: 50, name: 'Work Reward' },
          { base: 25, name: 'Beg Reward' }
        ];
        
        const examplesText = examples.map(example => {
          const boosted = applySeasonalMultiplier(example.base);
          return `• ${example.name}: ${example.base} → **${boosted}** coins`;
        }).join('\n');
        
        embed.addFields({
          name: '💰 Example Rewards',
          value: examplesText,
          inline: false
        });

        // Update quest progress
        progressQuests(userId, ['seasonal_check'], interaction).catch(e => logger.error('progressQuests error:', e));

        return await reply(interaction, { embeds: [embed] });
      } catch (error) {
        logger.error('Seasonal command error:', error);
        return await reply(interaction, {
          content: '❌ An error occurred while checking seasonal status!',
          flags: 1 << 6
        });
      }
    }, { isUserBlacklisted, rateLimiter })
  },
];
