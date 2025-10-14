const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  progressQuests,
  reply,
  validators
} = require('../../utils/utils');
const logger = require('../../logger');
const { User } = require('../../database/db');
const { withSafeReply } = require('../../utils/safeReply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the top players by coins')
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('Page number to view')
        .setRequired(false)
        .setMinValue(1)),
  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    const page = interaction.options.getInteger('page') || 1;
    const pageSize = 10;
    const startIndex = (page - 1) * pageSize;

    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in leaderboard command: ${userId}`);
      return await reply(interaction, {
        content: '❌ Invalid user ID!',
        flags: 1 << 6
      });
    }

    try {
      // Get total user count for pagination
      const totalUsers = await User.countDocuments();
      
      if (totalUsers === 0) {
        return await reply(interaction, {
          content: '❌ No users found in database!',
          flags: 1 << 6
        });
      }

      // Calculate total pages
      const totalPages = Math.ceil(totalUsers / pageSize);
      
      if (page > totalPages) {
        return await reply(interaction, {
          content: `❌ Page ${page} does not exist. There are only ${totalPages} pages.`,
          flags: 1 << 6
        });
      }

      // Get paginated users sorted by total coins
      const users = await User.find()
        .sort({ coins: -1 })
        .skip(startIndex)
        .limit(pageSize)
        .lean();

      if (!users || users.length === 0) {
        return await reply(interaction, {
          content: '❌ No users found on this page!',
          flags: 1 << 6
        });
      }

      const embed = new EmbedBuilder()
        .setColor('#ffd700')
        .setTitle('🏆 Leaderboard - Top Players')
        .setDescription(`Page ${page}/${totalPages}`)
        .setTimestamp();

      // Fetch user names from Discord
      const userNames = new Map();
      for (const user of users) {
        try {
          const discordUser = await interaction.client.users.fetch(user._id);
          userNames.set(user._id, discordUser.username);
        } catch (error) {
          logger.warn(`Could not fetch user ${user._id} from Discord:`, error);
          userNames.set(user._id, 'Unknown User');
        }
      }

      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const rank = startIndex + i + 1;
        const totalCoins = (user.coins || 0) + (user.bank || 0);
        const userName = userNames.get(user._id) || 'Unknown User';
        
        let medal = '';
        if (rank === 1) medal = '🥇';
        else if (rank === 2) medal = '🥈';
        else if (rank === 3) medal = '🥉';
        else medal = `${rank}.`;

        embed.addFields({
          name: `${medal} ${userName}`,
          value: `💰 ${totalCoins.toLocaleString()} coins`,
          inline: false
        });
      }

      // Track quest progress
      await progressQuests(interaction.user.id, ['leaderboard_view'], interaction);

      return await reply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('Leaderboard command error:', error);
      return await reply(interaction, {
        content: '❌ An error occurred while fetching leaderboard!',
        flags: 1 << 6
      });
    }
  })
};
