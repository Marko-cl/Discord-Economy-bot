// Embed builders for Discord bot
const { EmbedBuilder } = require('discord.js');
const { formatKelocoins } = require('./formatting');
const { validators } = require('./validation');
const logger = require('../logger');

/**
 * Enhanced embed builder
 */
function buildEmbed({ title, description, color, fields = [], footer, thumbnail, image, timestamp = true }) {
  const embed = new EmbedBuilder();
  
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (color) embed.setColor(color);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (timestamp) embed.setTimestamp();
  
  if (Array.isArray(fields) && fields.length > 0) {
    embed.addFields(fields);
  }
  
  if (footer) {
    embed.setFooter(footer);
  }
  
  return embed;
}

/**
 * Get user's embed color with fallback
 */
function getUserEmbedColor(user) {
  try {
    if (user?.embedColor && validators.hexColor(user.embedColor)) {
      // Convert hex string to number for Discord.js
      return parseInt(user.embedColor.replace('#', ''), 16);
    }
    if (user?.colorPack) {
      return 0x0099ff; // Default color pack color (blue)
    }
    return 0x5865f2; // Discord default (blurple)
  } catch (error) {
    logger.warn('Error getting user embed color:', error);
    return 0x5865f2; // Discord default (blurple)
  }
}

/**
 * Leaderboard embed builder
 */
function leaderboardEmbed(entries, page, totalPages) {
  const description = entries.length > 0 ? entries.join('\n') : 'No entries found.';
  return buildEmbed({
    title: '🏆 Leaderboard',
    description: description,
    color: 0x00bfff,
    footer: { text: `Page ${page + 1} of ${totalPages} • Top coin earners` }
  });
}

/**
 * Profile embed builder
 */
async function profileEmbed(user, interaction, target) {
  try {
    const embed = new EmbedBuilder()
      .setTitle(`${target.username}'s Profile`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setColor(getUserEmbedColor(user))
      .addFields(
        { name: '🪙 Coins', value: formatKelocoins(user.coins || 0), inline: true },
        { name: '📊 Level', value: `${user.level || 1}`, inline: true },
        { name: '⭐ XP', value: `${user.xp || 0}`, inline: true },
        { name: '🏆 Prestige', value: `${user.prestigeLevel || 0}`, inline: true },
        { name: '⛏️ Mine Level', value: `${user.mining?.level || 1}`, inline: true },
        { name: '🤖 Pet Level', value: (user.petBot && user.petBot.level) ? `${user.petBot.level}` : 'None', inline: true }
      )
      .setTimestamp();
    
    return { embed, files: [] };
  } catch (error) {
    logger.error('Error creating profile embed:', error);
    // Return a fallback embed instead of null
    const fallbackEmbed = new EmbedBuilder()
      .setTitle(`${target.username}'s Profile`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setColor(0x5865f2)
      .setDescription('Profile information could not be loaded.')
      .setTimestamp();
    
    return { embed: fallbackEmbed, files: [] };
  }
}

module.exports = {
  buildEmbed,
  getUserEmbedColor,
  leaderboardEmbed,
  profileEmbed
}; 