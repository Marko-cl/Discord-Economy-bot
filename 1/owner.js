const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isUserBlacklisted } = require('../utils/utils');
const { checkRateLimit } = require('../utils/rateLimiting');
const { withSafeReply } = require('../utils/safeReply');
const { reply } = require('../utils/formatting');

const rateLimiter = (userId) => checkRateLimit(userId, 'owner', 5, 10000);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('owner')
    .setDescription('OWNER ONLY: View all admin commands and their descriptions'),
  execute: withSafeReply(async (interaction) => {
    const ownerId = require('../utils/utils').constants.OWNER_ID;
    if (interaction.user.id !== ownerId) {
      return reply(interaction, { 
        content: '❌ Only the bot owner can use this command!', 
        flags: 1 << 6 
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('👑 Owner Commands')
      .setDescription('All available admin commands for the bot owner')
      .setColor(0xff6b6b)
      .setTimestamp()
      .setFooter({ text: 'Owner Commands' });

    // Economy Admin Commands
    embed.addFields({
      name: '💰 Economy Admin',
      value: [
        '**/give** - Give coins, XP, or items to any user',
        '**/remove** - Remove coins, XP, or items from any user',
        '**/lbcreate** - Create a new weekly leaderboard',
        '**/lbconfig** - Configure leaderboard announcement channel'
      ].join('\n'),
      inline: false
    });

    // Game Admin Commands
    embed.addFields({
      name: '🎮 Game Admin',
      value: [
        '**/skip** - Skip cooldowns (daily, prestige, pet, farm, quiz)',
        '**/party** - Start/stop party events with custom multipliers',
        '**/timer** - Start/stop cooldown immunity mode'
      ].join('\n'),
      inline: false
    });

    // Command Usage Examples
    embed.addFields({
      name: '📖 Usage Examples',
      value: [
        '`/give @user coins 1000` - Give 1000 coins',
        '`/give @user xp 500` - Give 500 XP',
        '`/give @user item "Box of Seeds" 5` - Give 5 Box of Seeds',
        '`/remove @user coins 500` - Remove 500 coins',
        '`/remove @user item "Box of Seeds"` - Remove 1 Box of Seeds',
        '`/skip daily` - Skip daily cooldown',
        '`/lbcreate xp` - Create XP leaderboard'
      ].join('\n'),
      inline: false
    });

    // Important Notes
    embed.addFields({
      name: '⚠️ Important Notes',
      value: [
        '• All commands are logged for audit purposes',
        '• Use with caution - changes are permanent',
        '• Target users must exist in the database',
        '• Item names are case-sensitive'
      ].join('\n'),
      inline: false
    });

    await reply(interaction, { embeds: [embed] });
  }, { isUserBlacklisted, rateLimiter })
}; 