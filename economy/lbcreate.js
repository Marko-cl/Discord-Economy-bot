const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  reply,
  isUserBlacklisted
} = require('../../utils/utils');
const { validators } = require('../../utils/validation');
const logger = require('../../logger');
const { LeaderboardConfig } = require('../../database/db');
const { checkRateLimit } = require('../../utils/rateLimiting');
const { withSafeReply } = require('../../utils/safeReply');

const rateLimiter = (userId) => checkRateLimit(userId, 'lbcreate', 10, 5000); // 10 uses per 5 seconds for admin commands

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lbcreate')
    .setDescription('OWNER ONLY: Create a new weekly leaderboard')
    .addStringOption(opt =>
      opt.setName('metric')
        .setDescription('Leaderboard metric')
        .setRequired(true)
        .addChoices(
          { name: 'Coins', value: 'coins' },
          { name: 'XP', value: 'xp' },
          { name: 'Multiplier', value: 'multiplier' }
        )
    )
    .addIntegerOption(opt =>
      opt.setName('first')
        .setDescription('Reward for 1st place (coins)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000000)
    )
    .addIntegerOption(opt =>
      opt.setName('second')
        .setDescription('Reward for 2nd place (coins)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000000)
    )
    .addIntegerOption(opt =>
      opt.setName('third')
        .setDescription('Reward for 3rd place (coins)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000000)
    ),
  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in lbcreate command: ${userId}`);
      return await reply(interaction, {
        content: '❌ Invalid user ID!',
        flags: 1 << 6
      });
    }
    
    // Owner validation
    const ownerId = require('../../utils/utils').constants.OWNER_ID;
    if (interaction.user.id !== ownerId) {
      logger.warn(`Unauthorized lbcreate access attempt by ${interaction.user.id}`);
      return await reply(interaction, {
        content: '❌ Only the bot owner can use this command.',
        flags: 1 << 6
      });
    }

    try {
      const metric = interaction.options.getString('metric');
      const first = interaction.options.getInteger('first');
      const second = interaction.options.getInteger('second');
      const third = interaction.options.getInteger('third');

      // Validate reward amounts
      if (first < second || second < third) {
        return await reply(interaction, {
          content: '❌ Rewards must be in descending order: 1st place should have the highest reward.',
          flags: 1 << 6
        });
      }

      // Use atomic operation to create leaderboard config
      const result = await LeaderboardConfig.findOneAndUpdate(
        {}, // Find any existing config
        {
          $setOnInsert: {
            metric: metric,
            startTime: new Date(),
            rewards: {
              first: first,
              second: second,
              third: third
            },
            createdAt: new Date(),
            updatedAt: new Date()
          }
        },
        {
          new: true,
          upsert: false, // Don't create if exists
          runValidators: true
        }
      );

      if (result) {
        return await reply(interaction, {
          content: '❌ A weekly leaderboard is already active. Wait for it to finish before creating a new one.',
          flags: 1 << 6
        });
      }

      // Create new leaderboard config using atomic operation
      await LeaderboardConfig.create({
        metric: metric,
        startTime: new Date(),
        rewards: {
          first: first,
          second: second,
          third: third
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const metricNames = {
        coins: 'Coins',
        xp: 'XP',
        multiplier: 'Multiplier'
      };

      const embed = new EmbedBuilder()
        .setTitle('🏆 Weekly Leaderboard Created!')
        .setDescription(`A new weekly leaderboard has been created successfully!`)
        .addFields(
          { name: '📊 Metric', value: metricNames[metric], inline: true },
          { name: '⏰ Start Time', value: new Date().toLocaleString(), inline: true },
          { name: '⏳ Duration', value: '1 week', inline: true },
          { name: '🥇 1st Place', value: `${first.toLocaleString()} coins`, inline: true },
          { name: '🥈 2nd Place', value: `${second.toLocaleString()} coins`, inline: true },
          { name: '🥉 3rd Place', value: `${third.toLocaleString()} coins`, inline: true }
        )
        .setColor(0x00ff00)
        .setFooter({ text: 'Use /weeklylb to view the current standings!' })
        .setTimestamp();

      logger.audit(interaction.user.id, 'lbcreate', null, `Metric: ${metric}, Rewards: ${first}/${second}/${third}`);
      
      return await reply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('Error in /lbcreate:', error);
      return await reply(interaction, {
        content: '❌ An error occurred while creating the weekly leaderboard. Please try again.',
        flags: 1 << 6
      });
    }
  }, { isUserBlacklisted, rateLimiter })
}; 