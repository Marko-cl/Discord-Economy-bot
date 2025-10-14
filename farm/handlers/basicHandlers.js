const { reply } = require('../../../utils/formatting');
const { formatDuration } = require('../../../utils/formatting');
const { getOrInitFarm, initializeFarmFields } = require('../database');
const { withSafeReply } = require('../../../utils/safeReply');
const { checkRateLimit } = require('../../../utils/rateLimiting');
const { validators } = require('../../../utils/validation');
const logger = require('../../../logger');
const { progressQuests } = require('../../../utils/utils');
const {
  atomicFarmPlant,
  atomicFarmHarvest,
  atomicFarmSell
} = require('../../../utils/atomicFarmOperations');
const { getEmptyPlots, determineCropQuality, findSeedByName, calculateGrowTime, isPlotReady, calculateSellValue } = require('../logic');
const { createHarvestEmbed, createFarmViewEmbed } = require('../ui');
const { formatKelocoins } = require('../../../utils/utils');

const rateLimiter = (userId) => checkRateLimit(userId, 'farm_basic', 5, 10000);

// Plant seeds handler
const handlePlant = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  const seedName = interaction.options.getString('seed');
  const amount = interaction.options.getInteger('amount');
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm plant: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  if (!seedName || typeof seedName !== 'string' || seedName.length < 1 || seedName.length > 50) {
    return await reply(interaction, {
      content: '❌ Invalid seed name!',
      flags: 1 << 6
    });
  }
  
  if (!amount || amount < 1 || amount > 10) {
    return await reply(interaction, {
      content: '❌ Invalid amount! Must be between 1 and 10.',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  let farm = user.farm;
  farm = await initializeFarmFields(userId, farm);
  
  // Check if user has enough seeds (farmInventory only)
  const seedCount = user.farmInventory && user.farmInventory[seedName] ? user.farmInventory[seedName].count : 0;
  
  if (seedCount < amount) {
    return await reply(interaction, {
      content: `❌ You don't have enough ${seedName}! You have ${seedCount}, need ${amount}.`,
      flags: 1 << 6
    });
  }
  
  // Find empty plots
  const emptyPlots = getEmptyPlots(farm.plots);
  if (emptyPlots.length < amount) {
    return await reply(interaction, {
      content: `❌ You don't have enough empty plots! You have ${emptyPlots.length} empty plots, need ${amount}.`,
      flags: 1 << 6
    });
  }
  
  // Plant seeds with quality system
  let plantedCount = 0;
  const plotIndices = [];
  
  for (let i = 0; i < amount; i++) {
    const plotIdx = emptyPlots[plantedCount];
    const seed = findSeedByName(seedName);
    // Determine crop quality and variant
    const { quality, variant } = determineCropQuality(seed, farm, plotIdx, false);
    // Calculate grow time with quality and weather
    const growTime = await calculateGrowTime(seed, farm, plotIdx, quality, variant);
    farm.plots[plotIdx] = {
      seedKey: seed.key,
      seedName: seed.name,
      plantedAt: Date.now(),
      growTime: growTime,
      ready: false,
      quality: quality,
      variant: variant,
      fertilized: false
    };
    plantedCount++;
    plotIndices.push(plotIdx);
    // Update stats
    if (!farm.stats.grown) farm.stats.grown = {};
    farm.stats.grown[seedName] = (farm.stats.grown[seedName] || 0) + 1;
  }
  
  // Use atomic operation for planting
  const result = await atomicFarmPlant(userId, seedName, amount, plotIndices, farm, user.farmInventory);
  
  if (!result.success) {
    logger.error(`Farm plant failed for user ${userId}:`, result.error);
    return await reply(interaction, {
      content: '❌ Failed to plant seeds! Please try again.',
      flags: 1 << 6
    });
  }
  
  // Update quest progress
  progressQuests(userId, ['farm_plant', 'farm_plant_seeds'], interaction).catch(e => logger.error('progressQuests error:', e));
  
  logger.info(`Farm planting completed for user ${userId}: ${plantedCount} ${seedName}`);
  
  return await reply(interaction, `🌱 Successfully planted ${plantedCount} ${seedName}!`);
}, { rateLimiter });

// Collect crops handler
const handleCollect = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm collect: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  let farm = user.farm;
  farm = await initializeFarmFields(userId, farm);
  
  // Check for ready crops with proper validation
  let harvestedCrops = {};
  let totalValue = 0;
  let collectedCount = 0;
  
  // Initialize harvested crops tracking if missing
  if (!farm.harvestedCrops) farm.harvestedCrops = {};
  if (!farm.harvestedCrops.quality) farm.harvestedCrops.quality = {};
  if (!farm.harvestedCrops.variant) farm.harvestedCrops.variant = {};
  
  for (let i = 0; i < farm.plots.length; i++) {
    const plot = farm.plots[i];
    if (plot && isPlotReady(plot)) {
      const seed = findSeedByName(plot.seedName);
      if (seed) {
        harvestedCrops[plot.seedName] = (harvestedCrops[plot.seedName] || 0) + 1;
        farm.harvestedCrops[plot.seedName] = (farm.harvestedCrops[plot.seedName] || 0) + 1;
        farm.harvestedCrops.quality[plot.seedName] = plot.quality || 'COMMON';
        farm.harvestedCrops.variant[plot.seedName] = plot.variant || null;
        const sellValue = await calculateSellValue(seed, farm, i, plot.quality, plot.variant);
        totalValue += sellValue;
        collectedCount++;
      }
      
      // Remove plot-specific upgrades when crop is harvested
      if (farm.upgrades) {
        if (farm.upgrades.growth && farm.upgrades.growth[i]) {
          delete farm.upgrades.growth[i];
        }
        if (farm.upgrades.value && farm.upgrades.value[i]) {
          delete farm.upgrades.value[i];
        }
        if (farm.upgrades.quality && farm.upgrades.quality[i]) {
          delete farm.upgrades.quality[i];
        }
      }
      
      farm.plots[i] = null;
    }
  }
  
  if (collectedCount === 0) {
    return await reply(interaction, {
      content: '❌ No crops are ready for harvest!',
      flags: 1 << 6
    });
  }
  
  // Update harvested crops
  farm.harvestedCrops = { ...farm.harvestedCrops, ...harvestedCrops };
  
  // Use atomic operation for harvesting
  const result = await atomicFarmHarvest(userId, harvestedCrops, totalValue, farm);
  
  if (!result.success) {
    logger.error(`Farm harvest failed for user ${userId}:`, result.error);
    return await reply(interaction, {
      content: '❌ Failed to harvest crops! Please try again.',
      flags: 1 << 6
    });
  }
  
  // Update quest progress
  progressQuests(userId, ['farm_harvest', 'farm_collect_crops'], interaction).catch(e => logger.error('progressQuests error:', e));
  
  logger.info(`Farm harvest completed for user ${userId}: ${collectedCount} crops, +${totalValue} coins`);
  
  // Create embed
  const embed = createHarvestEmbed(interaction.user, harvestedCrops, totalValue);
  return await reply(interaction, { embeds: [embed] });
}, { rateLimiter });

// View farm handler
const handleView = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm view: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  let farm = user.farm;
  farm = await initializeFarmFields(userId, farm);
  
  const embed = createFarmViewEmbed(interaction.user, farm);
  return await reply(interaction, { embeds: [embed] });
}, { rateLimiter });

// Sell crops handler
const handleSell = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm sell: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  let farm = user.farm;
  farm = await initializeFarmFields(userId, farm);
  
  const harvestedCrops = farm.harvestedCrops || {};
  if (Object.keys(harvestedCrops).length === 0) {
    return await reply(interaction, {
      content: '❌ You have no harvested crops to sell!',
      flags: 1 << 6
    });
  }
  
  let totalValue = 0;
  let soldItems = [];
  
  // Filter out quality and variant data for processing
  const cropEntries = Object.entries(harvestedCrops).filter(([key]) => key !== 'quality' && key !== 'variant');
  
  for (const [cropName, count] of cropEntries) {
    const seed = findSeedByName(cropName);
    if (seed) {
      // Get quality and variant for proper value calculation
      const quality = farm.harvestedCrops.quality?.[cropName] || 'COMMON';
      const variant = farm.harvestedCrops.variant?.[cropName] || null;
      const value = await calculateSellValue(seed, farm, 0, quality, variant) * count;
      totalValue += value;
      soldItems.push(`${cropName}: ${count} (${formatKelocoins(value)})`);
    }
  }
  
  // Clear harvested crops
  farm.harvestedCrops = {};
  
  // Update stats
  if (!farm.stats.sold) farm.stats.sold = {};
  if (!farm.stats.coinsEarned) farm.stats.coinsEarned = 0;
  
  for (const [cropName, count] of cropEntries) {
    farm.stats.sold[cropName] = (farm.stats.sold[cropName] || 0) + count;
  }
  farm.stats.coinsEarned += totalValue;
  
  // Use atomic operation for selling
  const result = await atomicFarmSell(userId, totalValue, farm);
  
  if (!result.success) {
    logger.error(`Farm sell failed for user ${userId}:`, result.error);
    return await reply(interaction, {
      content: '❌ Failed to sell crops! Please try again.',
      flags: 1 << 6
    });
  }
  
  // Update quest progress
  progressQuests(userId, ['farm_sell', 'farm_sell_crops'], interaction).catch(e => logger.error('progressQuests error:', e));
  
  logger.info(`Farm sell completed for user ${userId}: +${totalValue} coins`);
  
  return await reply(interaction, `💰 Sold all harvested crops for ${formatKelocoins(totalValue)}!\n\n${soldItems.join('\n')}`);
}, { rateLimiter });

// Harvest specific plot handler
const handleHarvest = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  const plotNumber = interaction.options.getInteger('plot');
  const plotIndex = plotNumber - 1;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm harvest: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  if (!plotNumber || plotNumber < 1 || plotNumber > 20) {
    return await reply(interaction, {
      content: '❌ Invalid plot number! Must be between 1 and 20.',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  let farm = user.farm;
  farm = await initializeFarmFields(userId, farm);
  
  if (plotIndex < 0 || plotIndex >= farm.plots.length) {
    return await reply(interaction, {
      content: `❌ Invalid plot number! You have ${farm.plots.length} plots.`,
      flags: 1 << 6
    });
  }
  
  const plot = farm.plots[plotIndex];
  if (!plot) {
    return await reply(interaction, {
      content: '❌ This plot is empty!',
      flags: 1 << 6
    });
  }
  
  if (!isPlotReady(plot)) {
    const timeLeft = plot.plantedAt + plot.growTime - Date.now();
    const timeString = timeLeft > 0 ? formatDuration(timeLeft) : 'Ready!';
    return await reply(interaction, {
      content: `❌ This crop is not ready yet! Time remaining: ${timeString}`,
      flags: 1 << 6
    });
  }
  
  const seed = findSeedByName(plot.seedName);
  if (!seed) {
    return await reply(interaction, {
      content: '❌ Invalid crop data in this plot!',
      flags: 1 << 6
    });
  }
  
  // Calculate sell value
  const sellValue = await calculateSellValue(seed, farm, plotIndex, plot.quality, plot.variant);
  
  // Add to harvested crops with proper validation
  if (!farm.harvestedCrops) farm.harvestedCrops = {};
  if (!farm.harvestedCrops.quality) farm.harvestedCrops.quality = {};
  if (!farm.harvestedCrops.variant) farm.harvestedCrops.variant = {};
  
  farm.harvestedCrops[plot.seedName] = (farm.harvestedCrops[plot.seedName] || 0) + 1;
  farm.harvestedCrops.quality[plot.seedName] = plot.quality || 'COMMON';
  farm.harvestedCrops.variant[plot.seedName] = plot.variant || null;
  
  // Remove plot-specific upgrades when crop is harvested
  if (farm.upgrades) {
    if (farm.upgrades.growth && farm.upgrades.growth[plotIndex]) {
      delete farm.upgrades.growth[plotIndex];
    }
    if (farm.upgrades.value && farm.upgrades.value[plotIndex]) {
      delete farm.upgrades.value[plotIndex];
    }
    if (farm.upgrades.quality && farm.upgrades.quality[plotIndex]) {
      delete farm.upgrades.quality[plotIndex];
    }
  }
  
  // Clear the plot
  farm.plots[plotIndex] = null;
  
  // Use atomic operation for harvesting
  const harvestedCrops = { [plot.seedName]: 1 };
  const result = await atomicFarmHarvest(userId, harvestedCrops, sellValue, farm);
  
  if (!result.success) {
    logger.error(`Farm harvest failed for user ${userId}:`, result.error);
    return await reply(interaction, {
      content: '❌ Failed to harvest crop! Please try again.',
      flags: 1 << 6
    });
  }
  
  // Update quest progress
  progressQuests(userId, ['farm_harvest', 'farm_harvest_specific'], interaction).catch(e => logger.error('progressQuests error:', e));
  
  logger.info(`Farm harvest completed for user ${userId}: ${plot.seedName} from plot ${plotNumber}, +${sellValue} coins`);
  
  return await reply(interaction, `🌾 Harvested ${plot.seedName} from plot ${plotNumber}! Value: ${formatKelocoins(sellValue)}`);
}, { rateLimiter });

module.exports = {
  handlePlant,
  handleCollect,
  handleView,
  handleSell,
  handleHarvest
}; 