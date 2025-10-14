const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, isUserBlacklisted, isSafeDiscordId } = require('../utils/utils');
const { reply } = require('../utils/formatting');
const logger = require('../logger');
const { checkRateLimit } = require('../utils/rateLimiting');
const { withSafeReply } = require('../utils/safeReply');
const { atomicSetEmbedColor } = require('../utils/atomicOperations');

function isValidHexColor(str) {
  return /^#([0-9A-Fa-f]{6})$/.test(str);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('color')
    .setDescription('Set your custom embed color (requires Color Pack)')
    .addStringOption(opt =>
      opt.setName('hex')
        .setDescription('Hex color code (e.g. #ff0000)')
        .setRequired(true)
    ),
  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    if (!isSafeDiscordId(userId)) {
      return reply(interaction, 'Invalid user ID.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'color', 5, 10000) });
    }
    
    let user;
    try {
      user = await getUser(userId);
      if (!user) {
        return reply(interaction, 'User not found.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'color', 5, 10000) });
      }
    } catch (err) {
      logger.error('Database error in /color getUser:', err);
      return reply(interaction, 'Database error. Please try again later.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'color', 5, 10000) });
    }
    
    if (!user.colorPack) {
      return reply(interaction, 'You need to activate a Color Pack to use this command!', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'color', 5, 10000) });
    }
    
    const hex = interaction.options.getString('hex');
    if (!isValidHexColor(hex)) {
      return reply(interaction, 'Please provide a valid hex color code (e.g. #ff0000).', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'color', 5, 10000) });
    }
    
    try {
      await atomicSetEmbedColor(userId, hex);
    } catch (err) {
      logger.error('Database error in /color update:', err);
      return reply(interaction, 'Database error. Please try again later.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'color', 5, 10000) });
    }
    
    const embed = new EmbedBuilder()
      .setTitle('🎨 Embed Color Set!')
      .setDescription(`Your custom embed color is now set to \`${hex}\`.`)
      .setColor(parseInt(hex.replace('#', ''), 16))
      .setFooter({ text: 'Color Pack' })
      .setTimestamp();
    
    return reply(interaction, '', { embeds: [embed], isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'color', 5, 10000) });
  }, { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'color', 5, 10000) })
}; 