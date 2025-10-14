const { SlashCommandBuilder } = require('discord.js');
const {
  getUser,
  progressQuests,
  reply,
  sanitizeString,
  isSafeDiscordId
} = require('../../utils/utils');
const { validators } = require('../../utils/validation');
const { 
  atomicCoinUpdate, 
  atomicXpUpdate, 
  validateAmount,
  validateItemName 
} = require('../../utils/atomicEconomyOperations');
const { addItemToInventory, isFarmItem } = require('../../utils/inventory');
const { clearUserCache } = require('../../utils/cache');
const logger = require('../../logger');

const { withSafeReply } = require('../../utils/safeReply');
const { checkRateLimit } = require('../../utils/rateLimiting');

const rateLimiter = (userId) => checkRateLimit(userId, 'economy_admin', 10, 5000); // 10 uses per 5 seconds for admin commands

module.exports = {
  data: new SlashCommandBuilder()
    .setName('give')
    .setDescription('OWNER ONLY: Give coins, items, or XP to a user')
    .addUserOption(opt => opt.setName('user').setDescription('User to give to').setRequired(true))
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('What to give')
        .setRequired(true)
        .addChoices(
          { name: 'Coins', value: 'coins' },
          { name: 'XP', value: 'xp' },
          { name: 'Item', value: 'item' }
        )
    )
    .addIntegerOption(opt => opt.setName('amount').setDescription('Amount (for coins/xp or item count)').setRequired(true))
    .addStringOption(opt => opt.setName('item').setDescription('Item name (required if type is item)')),
  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in admin command: ${userId}`);
      return await reply(interaction, {
        content: '❌ Invalid user ID!',
        flags: 1 << 6
      });
    }
    
    // Owner validation
    if (interaction.user.id !== require('../../utils/utils').constants.OWNER_ID) {
      logger.warn(`Unauthorized give command attempt by ${interaction.user.id}`);
      return reply(interaction, 'Only the bot owner can use this command.', { rateLimiter: rateLimiter(interaction.user.id) });
    }

    // Input validation
    const target = interaction.options.getUser('user');
    if (!target || target.bot) {
      return reply(interaction, 'You cannot use this command on bots.', { rateLimiter: rateLimiter(interaction.user.id) });
    }

    if (!isSafeDiscordId(target.id)) {
      return reply(interaction, 'Invalid user ID.', { rateLimiter: rateLimiter(interaction.user.id) });
    }

    const type = interaction.options.getString('type');
    if (!['coins', 'xp', 'item'].includes(type)) {
      return reply(interaction, 'Invalid type. Must be coins, xp, or item.', { rateLimiter: rateLimiter(interaction.user.id) });
    }

    const amount = interaction.options.getInteger('amount');
    const amountValidation = validateAmount(amount, { min: 1, max: 1e9 });
    if (!amountValidation.valid) {
      return reply(interaction, amountValidation.error, { rateLimiter: rateLimiter(interaction.user.id) });
    }

    const itemName = interaction.options.getString('item');
    if (type === 'item') {
      const itemValidation = validateItemName(itemName);
      if (!itemValidation.valid) {
        return reply(interaction, itemValidation.error, { rateLimiter: rateLimiter(interaction.user.id) });
      }
    }

    // Verify target user exists
    let user;
    try {
      user = await getUser(target.id);
      if (!user) {
        return reply(interaction, 'Target user not found in database.', { rateLimiter: rateLimiter(interaction.user.id) });
      }
    } catch (err) {
      logger.error('DB error in /give getUser:', err);
      return reply(interaction, 'Database error: Could not load user data.', { rateLimiter: rateLimiter(interaction.user.id) });
    }

    // Process the give operation
    try {
      if (type === 'coins') {
        const result = await atomicCoinUpdate(target.id, amount, 'add');
        if (!result.success) {
          logger.error('Atomic coin update failed:', result.error);
          return reply(interaction, `Failed to give coins to ${target}.`, { rateLimiter: rateLimiter(interaction.user.id) });
        }

        progressQuests(interaction.user.id, ['give_coins'], interaction).catch(e => logger.error('progressQuests error:', e));
        logger.audit(interaction.user.id, 'give_coins', target.id, `Amount: ${amount}`);
        await reply(interaction, `Gave ${amount} coins to ${target}.`, { rateLimiter: rateLimiter(interaction.user.id) });

      } else if (type === 'xp') {
        const result = await atomicXpUpdate(target.id, amount, 'add');
        if (!result.success) {
          logger.error('Atomic XP update failed:', result.error);
          return reply(interaction, `Failed to give XP to ${target}.`, { rateLimiter: rateLimiter(interaction.user.id) });
        }

        progressQuests(interaction.user.id, ['give_xp'], interaction).catch(e => logger.error('progressQuests error:', e));
        logger.audit(interaction.user.id, 'give_xp', target.id, `Amount: ${amount}`);
        await reply(interaction, `Gave ${amount} XP to ${target}.`, { rateLimiter: rateLimiter(interaction.user.id) });

      } else if (type === 'item') {
        const safeItemName = sanitizeString(itemName);
        try {
          // Use proper inventory routing - farm items go to farm inventory, regular items go to regular inventory
          const result = await addItemToInventory(target.id, safeItemName, amount);
          if (!result) {
            logger.error(`Failed to add item ${safeItemName} to inventory for user ${target.id}`);
            return reply(interaction, `Failed to add ${amount} × ${safeItemName} to ${target}.`, { rateLimiter: rateLimiter(interaction.user.id) });
          }
          
          // Log which inventory the item went to
          const inventoryType = isFarmItem(safeItemName) ? 'farm inventory' : 'regular inventory';
          logger.info(`Added ${amount} × ${safeItemName} to ${target.id}'s ${inventoryType}`);
          
          progressQuests(interaction.user.id, ['give_item'], interaction).catch(e => logger.error('progressQuests error:', e));
          logger.audit(interaction.user.id, 'give_item', target.id, `Item: ${safeItemName}, Amount: ${amount}`);
          await reply(interaction, `Gave ${amount} × ${safeItemName} to ${target}.`, { rateLimiter: rateLimiter(interaction.user.id) });
          clearUserCache(target.id);
        } catch (err) {
          logger.error('DB error in /give item:', err);
          return reply(interaction, `Failed to add ${amount} × ${safeItemName} to ${target}.`, { rateLimiter: rateLimiter(interaction.user.id) });
        }
      }
    } catch (error) {
      logger.error('Error in give command:', error);
      return reply(interaction, 'An error occurred while processing the give command.', { rateLimiter: rateLimiter(interaction.user.id) });
    }
  }, { permission: 'owner', rateLimiter })
};
