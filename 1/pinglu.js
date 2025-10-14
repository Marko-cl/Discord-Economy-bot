const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { progressQuests, isUserBlacklisted } = require('../utils/utils');
const { withSafeReply } = require('../utils/safeReply');
const { reply } = require('../utils/formatting');
const { checkRateLimit } = require('../utils/rateLimiting');

const rateLimiter = (userId) => checkRateLimit(userId, 'pinglu', 5, 10000);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pinglu')
    .setDescription('Check bot latency and response time'),

  execute: withSafeReply(async (interaction) => {
    try {
      // Track quest progress
      await progressQuests(interaction.user.id, ['ping_command'], interaction);
      
      const sent = Date.now();
      
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🏓 Pong!')
        .setDescription('Bot is online and responding!')
        .addFields(
          { name: '📡 API Latency', value: `${Math.round(interaction.client.ws.ping)}ms`, inline: true },
          { name: '⚡ Response Time', value: `${Date.now() - sent}ms`, inline: true },
          { name: '🕐 Uptime', value: formatUptime(interaction.client.uptime), inline: true }
        )
        .setTimestamp();

      return await reply(interaction, { embeds: [embed] });
    } catch (error) {
      console.error('Pinglu command error:', error);
      return await reply(interaction, {
        content: '❌ An error occurred while checking bot status!',
        flags: 1 << 6
      });
    }
  }, { isUserBlacklisted, rateLimiter })
};

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}