const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { withSafeReply } = require('../../utils/safeReply');
const { validators } = require('../../utils/validation');
const { reply } = require('../../utils/formatting');
const logger = require('../../logger');
const { LeaderboardConfig, User } = require('../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('weeklylb')
    .setDescription('View the active weekly leaderboard'),

  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in weeklylb command: ${userId}`);
      return await reply(interaction, {
        content: '❌ Invalid user ID!',
        flags: 1 << 6
      });
    }
    
    try {
      // Check if there's an active weekly leaderboard
      const activeConfig = await LeaderboardConfig.findOne();
      
      if (!activeConfig) {
        return await reply(interaction, {
          content: '❌ No active weekly leaderboard found! Use `/lbcreate` to create one.',
          flags: 1 << 6
        });
      }

      // Check if the leaderboard has ended (1 week duration)
      const now = new Date();
      const startTime = new Date(activeConfig.startTime);
      const endTime = new Date(startTime.getTime() + (7 * 24 * 60 * 60 * 1000)); // 1 week
      
      if (now > endTime) {
        return await reply(interaction, {
          content: '❌ This weekly leaderboard has ended! Use `/lbcreate` to start a new one.',
          flags: 1 << 6
        });
      }

      // Get total user count for pagination
      const totalUsers = await User.countDocuments();
      
      if (totalUsers === 0) {
        return await reply(interaction, {
          content: '❌ No users found in database!',
          flags: 1 << 6
        });
      }

      let sortedUsers;
      let title;
      let valueField;
      const metricNames = {
        coins: 'Coins',
        xp: 'XP',
        multiplier: 'Multiplier'
      };

      // Get top 10 users based on metric
      switch (activeConfig.metric) {
        case 'coins':
          sortedUsers = await User.find()
            .sort({ coins: -1 })
            .limit(10)
            .lean();
          title = `🏆 Weekly Leaderboard - ${metricNames[activeConfig.metric]}`;
          valueField = 'coins';
          break;
        case 'xp':
          sortedUsers = await User.find()
            .sort({ xp: -1 })
            .limit(10)
            .lean();
          title = `🏆 Weekly Leaderboard - ${metricNames[activeConfig.metric]}`;
          valueField = 'xp';
          break;
        case 'multiplier':
          sortedUsers = await User.find()
            .sort({ prestigeLevel: -1 })
            .limit(10)
            .lean();
          title = `🏆 Weekly Leaderboard - ${metricNames[activeConfig.metric]}`;
          valueField = 'prestigeLevel';
          break;
        default:
          return await reply(interaction, {
            content: '❌ Invalid leaderboard metric!',
            flags: 1 << 6
          });
      }

      if (!sortedUsers || sortedUsers.length === 0) {
        return await reply(interaction, {
          content: '❌ No users found for leaderboard!',
          flags: 1 << 6
        });
      }

      const embed = new EmbedBuilder()
        .setColor('#ffd700')
        .setTitle(title)
        .setDescription(`Top 10 players by ${metricNames[activeConfig.metric]}`)
        .addFields(
          { name: '⏰ Started', value: `<t:${Math.floor(startTime.getTime() / 1000)}:R>`, inline: true },
          { name: '⏳ Ends', value: `<t:${Math.floor(endTime.getTime() / 1000)}:R>`, inline: true },
          { name: '🥇 1st Place', value: `${activeConfig.rewards.first.toLocaleString()} coins`, inline: true },
          { name: '🥈 2nd Place', value: `${activeConfig.rewards.second.toLocaleString()} coins`, inline: true },
          { name: '🥉 3rd Place', value: `${activeConfig.rewards.third.toLocaleString()} coins`, inline: true }
        )
        .setTimestamp();

      // Fetch user names from Discord
      const userNames = new Map();
      for (const user of sortedUsers) {
        try {
          const discordUser = await interaction.client.users.fetch(user._id);
          userNames.set(user._id, discordUser.username);
        } catch (error) {
          logger.warn(`Could not fetch user ${user._id} from Discord:`, error);
          userNames.set(user._id, 'Unknown User');
        }
      }

      for (let i = 0; i < sortedUsers.length; i++) {
        const user = sortedUsers[i];
        const rank = i + 1;
        const value = user[valueField] || 0;
        const userName = userNames.get(user._id) || 'Unknown User';
        
        let medal = '';
        if (rank === 1) medal = '🥇';
        else if (rank === 2) medal = '🥈';
        else if (rank === 3) medal = '🥉';
        else medal = `${rank}.`;

        let displayValue = value;
        if (activeConfig.metric === 'coins') {
          displayValue = `${value.toLocaleString()} coins`;
        } else if (activeConfig.metric === 'xp') {
          displayValue = `${value.toLocaleString()} XP`;
        } else if (activeConfig.metric === 'multiplier') {
          displayValue = `Level ${value}`;
        }

        embed.addFields({
          name: `${medal} ${userName}`,
          value: displayValue,
          inline: false
        });
      }

      return await reply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('WeeklyLB command error:', error);
      return await reply(interaction, {
        content: '❌ An error occurred while fetching weekly leaderboard!',
        flags: 1 << 6
      });
    }
  })
}; 