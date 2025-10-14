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

const rateLimiter = (userId) => checkRateLimit(userId, 'lbconfig', 10, 5000);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lbconfig')
    .setDescription('OWNER ONLY: Configure weekly leaderboard settings')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel for leaderboard announcements and rewards')
        .setRequired(true)
    ),

  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in lbconfig command: ${userId}`);
      return await reply(interaction, {
        content: '❌ Invalid user ID!',
        flags: 1 << 6
      });
    }
    
    // Owner validation
    const ownerId = require('../../utils/utils').constants.OWNER_ID;
    if (interaction.user.id !== ownerId) {
      logger.warn(`Unauthorized lbconfig access attempt by ${interaction.user.id}`);
      return await reply(interaction, {
        content: '❌ Only the bot owner can use this command!',
        flags: 1 << 6
      });
    }

    try {
      const channel = interaction.options.getChannel('channel');
      
      // Validate channel
      if (!channel || !channel.isTextBased()) {
        return await reply(interaction, {
          content: '❌ Please select a valid text channel!',
          flags: 1 << 6
        });
      }

      // Check permissions
      if (!channel.permissionsFor(interaction.client.user).has(['SendMessages', 'EmbedLinks'])) {
        return await reply(interaction, {
          content: '❌ I need Send Messages and Embed Links permissions in that channel!',
          flags: 1 << 6
        });
      }
      
      // Use atomic operation to update leaderboard config
      const result = await LeaderboardConfig.findOneAndUpdate(
        {}, // Find any config
        { 
          $set: { 
            announceChannel: channel.id,
            updatedAt: new Date()
          }
        },
        { 
          new: true, 
          upsert: false,
          runValidators: true 
        }
      );
      
      if (!result) {
        return await reply(interaction, {
          content: '❌ No active weekly leaderboard found! Use `/lbcreate` to create one first.',
          flags: 1 << 6
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('⚙️ Leaderboard Configuration Updated')
        .setDescription(`Weekly leaderboard announcements and rewards will now be sent to ${channel}`)
        .addFields(
          { name: '📢 Announcement Channel', value: `${channel}`, inline: true },
          { name: '📊 Current Metric', value: result.metric.charAt(0).toUpperCase() + result.metric.slice(1), inline: true },
          { name: '⏰ Started', value: `<t:${Math.floor(new Date(result.startTime).getTime() / 1000)}:R>`, inline: true }
        )
        .setColor(0x00ff00)
        .setTimestamp();

      logger.audit(interaction.user.id, 'lbconfig', null, `Channel: ${channel.id}`);
      
      return await reply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('Error in /lbconfig:', error);
      return await reply(interaction, {
        content: '❌ An error occurred while configuring the leaderboard. Please try again.',
        flags: 1 << 6
      });
    }
  }, { isUserBlacklisted, rateLimiter })
}; 