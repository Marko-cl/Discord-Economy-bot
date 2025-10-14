const { reply } = require('../../../utils/formatting');
const { getOrInitFarm } = require('../database');
const { withSafeReply } = require('../../../utils/safeReply');
const { checkRateLimit } = require('../../../utils/rateLimiting');
const { validators } = require('../../../utils/validation');
const logger = require('../../../logger');
const { progressQuests } = require('../../../utils/utils');
const {
  atomicFarmExpand
} = require('../../../utils/atomicFarmOperations');
const { calculateExpansionCost } = require('../logic');
const { formatKelocoins } = require('../../../utils/utils');
const { FARM_CONSTANTS } = require('../constants');
const { createFarmStatsEmbed } = require('../ui');
const { findSeedByName } = require('../logic');
const { EmbedBuilder } = require('discord.js');

const rateLimiter = (userId) => checkRateLimit(userId, 'farm_management', 5, 10000);

// Expand farm handler
const handleExpand = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm expand: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  
  const currentPlots = user.farm.plots.length;
  const expansionCost = calculateExpansionCost(currentPlots);
  
  // Add new plot
  user.farm.plots.push(null);
  
  // Use atomic operation for expansion
  const result = await atomicFarmExpand(userId, expansionCost, user.farm);
  
  if (!result.success) {
    logger.error(`Farm expansion failed for user ${userId}:`, result.error);
    return await reply(interaction, {
      content: '❌ Failed to expand farm! Please try again.',
      flags: 1 << 6
    });
  }
  
  // Update quest progress
  progressQuests(userId, ['farm_expand', 'farm_management'], interaction).catch(e => logger.error('progressQuests error:', e));
  
  logger.info(`Farm expansion completed for user ${userId}: -${expansionCost} coins, new plots: ${user.farm.plots.length}`);
  
  return await reply(interaction, `🏗️ Farm expanded! You now have ${user.farm.plots.length} plots. Cost: ${formatKelocoins(expansionCost)}`);
}, { rateLimiter });

// Remove plot handler
const handleRemovePlot = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm remove plot: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  
  if (user.farm.plots.length <= FARM_CONSTANTS.DEFAULT_PLOTS) {
    return await reply(interaction, {
      content: `❌ You cannot remove plots below the minimum of ${FARM_CONSTANTS.DEFAULT_PLOTS}!`,
      flags: 1 << 6
    });
  }
  
  // Check if last plot has crops
  const lastPlot = user.farm.plots[user.farm.plots.length - 1];
  if (lastPlot) {
    return await reply(interaction, {
      content: '❌ You cannot remove a plot that has crops planted! Harvest or wait for the crops to be ready first.',
      flags: 1 << 6
    });
  }
  
  // Calculate refund
  const currentPlots = user.farm.plots.length;
  const expansionCost = calculateExpansionCost(currentPlots - 1);
  const refund = Math.floor(expansionCost * FARM_CONSTANTS.REMOVAL_REFUND_RATE);
  
  // Get the index of the plot being removed (last plot)
  const removedPlotIndex = user.farm.plots.length - 1;
  
  // Remove plot-specific upgrades for the removed plot
  if (user.farm.upgrades) {
    if (user.farm.upgrades.growth && user.farm.upgrades.growth[removedPlotIndex]) {
      delete user.farm.upgrades.growth[removedPlotIndex];
    }
    if (user.farm.upgrades.value && user.farm.upgrades.value[removedPlotIndex]) {
      delete user.farm.upgrades.value[removedPlotIndex];
    }
    if (user.farm.upgrades.quality && user.farm.upgrades.quality[removedPlotIndex]) {
      delete user.farm.upgrades.quality[removedPlotIndex];
    }
  }
  
  // Remove plot
  user.farm.plots.pop();
  
  // Use atomic operation for plot removal (negative expansion cost = refund)
  const result = await atomicFarmExpand(userId, -refund, user.farm);
  
  if (!result.success) {
    logger.error(`Farm plot removal failed for user ${userId}:`, result.error);
    return await reply(interaction, {
      content: '❌ Failed to remove plot! Please try again.',
      flags: 1 << 6
    });
  }
  
  // Update quest progress
  progressQuests(userId, ['farm_remove_plot', 'farm_management'], interaction).catch(e => logger.error('progressQuests error:', e));
  
  logger.info(`Farm plot removal completed for user ${userId}: +${refund} coins, new plots: ${user.farm.plots.length}`);
  
  return await reply(interaction, `🗑️ Plot removed! You now have ${user.farm.plots.length} plots. Refund: ${formatKelocoins(refund)}`);
}, { rateLimiter });

// Farm stats handler
const handleStats = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm stats: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  
  const embed = createFarmStatsEmbed(interaction.user, user.farm);
  return await reply(interaction, { embeds: [embed] });
}, { rateLimiter });

// Farm inventory handler
const handleInventory = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm inventory: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  
  if (!user.farmInventory || Object.keys(user.farmInventory).length === 0) {
    return await reply(interaction, {
      content: '📦 Your farm inventory is empty! Buy seeds from `/shop` or use `/boxofseeds`.',
      flags: 1 << 6
    });
  }
  
  // Create embed
  const embed = new EmbedBuilder()
    .setTitle('🌾 Farm Inventory')
    .setColor('#00ff00')
    .setTimestamp()
    .setFooter({ text: `${interaction.user.username}'s Farm Inventory` });
  
  // Group items by type
  const seeds = [];
  const workers = [];
  const fertilizer = [];
  const other = [];
  
  for (const [itemName, itemData] of Object.entries(user.farmInventory)) {
    if (itemName.includes('Seed')) {
      const seed = findSeedByName(itemName);
      const emoji = seed?.emoji || '🌱';
      const rarity = seed?.rarity || 'Unknown';
      seeds.push(`${emoji} **${itemName}** (${rarity}) x${itemData.count}`);
    } else if (itemName.includes('Worker')) {
      workers.push(`👨‍🌾 **${itemName}** x${itemData.count}`);
    } else if (itemName.includes('Fertilizer')) {
      fertilizer.push(`🌱 **${itemName}** x${itemData.count}`);
    } else {
      other.push(`📦 **${itemName}** x${itemData.count}`);
    }
  }
  
  // Add fields to embed
  if (seeds.length > 0) {
    embed.addFields({
      name: '🌱 Seeds',
      value: seeds.join('\n'),
      inline: false
    });
  }
  
  if (workers.length > 0) {
    embed.addFields({
      name: '👨‍🌾 Workers',
      value: workers.join('\n'),
      inline: false
    });
  }
  
  if (fertilizer.length > 0) {
    embed.addFields({
      name: '🌿 Fertilizer',
      value: fertilizer.join('\n'),
      inline: false
    });
  }
  
  if (other.length > 0) {
    embed.addFields({
      name: '📦 Other Items',
      value: other.join('\n'),
      inline: false
    });
  }
  
  // Add total count
  const totalItems = Object.values(user.farmInventory).reduce((sum, item) => sum + item.count, 0);
  embed.setDescription(`Total items: **${totalItems}**`);
  
  return await reply(interaction, { embeds: [embed] });
}, { rateLimiter });

module.exports = {
  handleExpand,
  handleRemovePlot,
  handleStats,
  handleInventory
}; 