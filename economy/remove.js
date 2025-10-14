const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, hasItem, formatKelocoins } = require('../../utils/utils');
const { isUserBlacklisted } = require('../../utils/utils');
const { withSafeReply } = require('../../utils/safeReply');
const { validators } = require('../../utils/validation');
const { reply } = require('../../utils/formatting');
const { 
  atomicCoinUpdate, 
  atomicXpUpdate, 
  atomicItemRemoval,
  validateAmount,
  validateItemName 
} = require('../../utils/atomicEconomyOperations');
const { checkRateLimit } = require('../../utils/rateLimiting');
const logger = require('../../logger');

const rateLimiter = (userId) => checkRateLimit(userId, 'remove', 10, 5000); // 10 uses per 5 seconds for admin commands

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('OWNER ONLY: Remove items, XP, or coins from any user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to remove from')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('type')
        .setDescription('What to remove')
        .setRequired(true)
        .addChoices(
          { name: 'Coins', value: 'coins' },
          { name: 'XP', value: 'xp' },
          { name: 'Item', value: 'item' }
        ))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Amount of coins/XP to remove (required for coins/xp)')
        .setMinValue(1)
        .setMaxValue(1000000000))
    .addStringOption(option =>
      option.setName('target')
        .setDescription('Item name (required when type is item)')),

  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in remove command: ${userId}`);
      return await reply(interaction, {
        content: '❌ Invalid user ID!',
        flags: 1 << 6
      });
    }
    
    // Owner validation
    const ownerId = require('../../utils/utils').constants.OWNER_ID;
    if (interaction.user.id !== ownerId) {
      return reply(interaction, '❌ Only the bot owner can use this command!', { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
    }

    // Input validation
    const targetUser = interaction.options.getUser('user');
    if (!targetUser || targetUser.bot) {
      return reply(interaction, '❌ Cannot remove from bots!', { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
    }

    const type = interaction.options.getString('type');
    if (!['coins', 'xp', 'item'].includes(type)) {
      return reply(interaction, '❌ Invalid removal type!', { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
    }

    const amount = interaction.options.getInteger('amount');
    const target = interaction.options.getString('target');

    try {
      // Get target user data
      let targetUserData = await getUser(targetUser.id);
      
      if (!targetUserData) {
        return reply(interaction, '❌ Target user not found in database!', { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
      }

      let embed = new EmbedBuilder()
        .setColor('#ff6b6b')
        .setTitle('⚙️ Admin Removal')
        .addFields(
          { name: '👤 Target User', value: targetUser.username, inline: true },
          { name: '👮 Admin', value: interaction.user.username, inline: true }
        )
        .setTimestamp();

      switch (type) {
        case 'coins': {
          // Validate amount
          if (!amount) {
            return reply(interaction, '❌ Amount is required when removing coins!', { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
          }

          const amountValidation = validateAmount(amount, { min: 1, max: 1e9 });
          if (!amountValidation.valid) {
            return reply(interaction, amountValidation.error, { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
          }

          const currentCoins = targetUserData.coins || 0;
          const newAmount = Math.max(0, currentCoins - amount);

          // Use atomic operation
          const result = await atomicCoinUpdate(targetUser.id, newAmount, 'set');
          if (!result.success) {
            logger.error('Atomic coin update failed in remove command:', result.error);
            return reply(interaction, '❌ Failed to remove coins!', { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
          }

          embed.setDescription(`${formatKelocoins(amount)} removed from ${targetUser.username}`)
            .addFields(
              { name: '💰 Previous Balance', value: formatKelocoins(currentCoins), inline: true },
              { name: '💰 New Balance', value: formatKelocoins(newAmount), inline: true },
              { name: '📊 Type', value: 'Coins', inline: true }
            );

          logger.audit(interaction.user.id, 'remove_coins', targetUser.id, `Removed ${amount} coins`);
          break;
        }

        case 'xp': {
          // Validate amount
          if (!amount) {
            return reply(interaction, '❌ Amount is required when removing XP!', { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
          }

          const amountValidation = validateAmount(amount, { min: 1, max: 1e9 });
          if (!amountValidation.valid) {
            return reply(interaction, amountValidation.error, { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
          }

          const currentXp = targetUserData.xp || 0;
          const newXp = Math.max(0, currentXp - amount);

          // Use atomic operation
          const result = await atomicXpUpdate(targetUser.id, newXp, 'set');
          if (!result.success) {
            logger.error('Atomic XP update failed in remove command:', result.error);
            return reply(interaction, '❌ Failed to remove XP!', { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
          }

          embed.setDescription(`${amount.toLocaleString()} XP removed from ${targetUser.username}`)
            .addFields(
              { name: '⭐ Previous XP', value: currentXp.toLocaleString(), inline: true },
              { name: '⭐ New XP', value: newXp.toLocaleString(), inline: true },
              { name: '📊 Type', value: 'XP', inline: true }
            );

          logger.audit(interaction.user.id, 'remove_xp', targetUser.id, `Removed ${amount} XP`);
          break;
        }

        case 'item': {
          // Validate item name
          if (!target || !target.trim()) {
            return reply(interaction, '❌ Item name is required when removing items!', { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
          }

          const itemValidation = validateItemName(target);
          if (!itemValidation.valid) {
            return reply(interaction, itemValidation.error, { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
          }

          const itemName = itemValidation.sanitized;
          
          // Check if user has the item
          if (!hasItem(targetUserData, itemName)) {
            return reply(interaction, `❌ ${targetUser.username} doesn't have the item "${itemName}"!`, { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
          }

          // Remove the item (amount defaults to 1 if not specified)
          const removeAmount = amount || 1;
          const amountValidation = validateAmount(removeAmount, { min: 1, max: 1000 });
          if (!amountValidation.valid) {
            return reply(interaction, amountValidation.error, { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
          }

          // Use atomic operation
          const result = await atomicItemRemoval(targetUser.id, itemName, removeAmount);
          if (!result.success) {
            logger.error('Atomic item removal failed in remove command:', result.error);
            return reply(interaction, `❌ Failed to remove item "${itemName}" from ${targetUser.username}!`, { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
          }

          embed.setDescription(`Item "${itemName}" (x${removeAmount}) removed from ${targetUser.username}`)
            .addFields(
              { name: '📦 Item Removed', value: `${itemName} x${removeAmount}`, inline: true },
              { name: '📊 Type', value: 'Item', inline: true }
            );

          logger.audit(interaction.user.id, 'remove_item', targetUser.id, `Removed item: ${itemName} x${removeAmount}`);
          break;
        }

        default:
          return reply(interaction, '❌ Invalid removal type!', { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
      }

      return reply(interaction, '', { embeds: [embed] });
    } catch (error) {
      logger.error('Remove command error:', error);
      return reply(interaction, '❌ An error occurred while processing the removal!', { flags: 1 << 6, isUserBlacklisted, rateLimiter: rateLimiter(interaction.user.id) });
    }
  }, { deferReply: true, isUserBlacklisted, rateLimiter })
}; 