const { SEED_TYPES, FARM_CONSTANTS } = require('./constants');
const { getWeatherEffects } = require('./weather');
const { calculateCropValue, calculateGrowthTime } = require('./quality');

// Find seed by name
function findSeedByName(seedName) {
  return SEED_TYPES.find(s => s.name === seedName);
}

// Find seed by key
function findSeedByKey(seedKey) {
  return SEED_TYPES.find(s => s.key === seedKey);
}

// Calculate grow time with upgrades and fertilizer
async function calculateGrowTime(seed, farm, plotIndex = 0, quality = 'COMMON', variant = null) {
  // Get current weather
  const { getCurrentWeather } = require('./weather');
  const weather = await getCurrentWeather();
  const weatherEffects = getWeatherEffects(weather.currentWeather);
  
  // Use the new quality-based calculation
  return calculateGrowthTime(seed, farm, quality, variant, weatherEffects.growthMultiplier, plotIndex);
}

// Check if plot is ready for harvest
function isPlotReady(plot) {
  if (!plot) return false;
  if (plot.ready) return true;
  
  const readyAt = plot.plantedAt + plot.growTime;
  return Date.now() >= readyAt;
}

// Get empty plot indices
function getEmptyPlots(plots) {
  return plots.map((p, i) => p ? null : i).filter(i => i !== null);
}

// Count seeds in inventory (legacy support)
// DEPRECATED: Do not use for farm commands. Use countSeedsInFarmInventory instead.
function countSeedsInInventory(inventory) {
  const seedCounts = {};
  for (const s of SEED_TYPES) {
    // Skip Box of Seeds as it's not a plantable seed
    if (s.name !== 'Box of Seeds') {
      seedCounts[s.name] = 0;
    }
  }
  
  for (const item of inventory) {
    if (typeof item === 'string' && seedCounts.hasOwnProperty.call(seedCounts, item)) {
      seedCounts[item]++;
    } else if (typeof item === 'object' && item && seedCounts.hasOwnProperty.call(seedCounts, item.name)) {
      seedCounts[item.name]++;
    }
  }
  
  return seedCounts;
}

// Count seeds in farm inventory (new system)
function countSeedsInFarmInventory(farmInventory) {
  const seedCounts = {};
  for (const s of SEED_TYPES) {
    // Skip Box of Seeds as it's not a plantable seed
    if (s.name !== 'Box of Seeds') {
      seedCounts[s.name] = 0;
    }
  }
  
  if (farmInventory) {
    for (const [itemName, itemData] of Object.entries(farmInventory)) {
      if (seedCounts.hasOwnProperty.call(seedCounts, itemName)) {
        seedCounts[itemName] = itemData.count || 0;
      }
    }
  }
  
  return seedCounts;
}

// Remove seed from inventory (legacy support)
// DEPRECATED: Do not use for farm commands. Use removeSeedFromFarmInventory instead.
function removeSeedFromInventory(inventory, seedName) {
  for (let i = 0; i < inventory.length; i++) {
    if ((typeof inventory[i] === 'string' && inventory[i] === seedName) ||
        (typeof inventory[i] === 'object' && inventory[i] && inventory[i].name === seedName)) {
      inventory.splice(i, 1);
      return true;
    }
  }
  return false;
}

// Remove seed from farm inventory (new system)
function removeSeedFromFarmInventory(farmInventory, seedName) {
  if (farmInventory && farmInventory[seedName] && farmInventory[seedName].count > 0) {
    farmInventory[seedName].count--;
    if (farmInventory[seedName].count <= 0) {
      delete farmInventory[seedName];
    }
    return true;
  }
  return false;
}

// Check if user has seed (supports both systems)
function hasSeed(user, seedName) {
  return user.farmInventory && user.farmInventory[seedName] && user.farmInventory[seedName].count > 0;
}

// Count seeds user has (supports both systems)
function countUserSeeds(user, seedName) {
  return user.farmInventory && user.farmInventory[seedName] ? user.farmInventory[seedName].count : 0;
}

// Calculate expansion cost
function calculateExpansionCost(currentPlots) {
  return Math.floor(10000 * Math.pow(FARM_CONSTANTS.EXPANSION_COST_MULTIPLIER, currentPlots - FARM_CONSTANTS.DEFAULT_PLOTS));
}

// Calculate upgrade cost
function calculateUpgradeCost(plotIndex) {
  const baseCost = 5000;
  return Math.floor(baseCost * Math.pow(FARM_CONSTANTS.UPGRADE_COST_MULTIPLIER, plotIndex));
}

// Calculate sell value with upgrades, quality, and weather
async function calculateSellValue(seed, farm, plotIndex, quality = 'COMMON', variant = null) {
  // Get current weather
  const { getCurrentWeather } = require('./weather');
  const weather = await getCurrentWeather();
  const weatherEffects = getWeatherEffects(weather.currentWeather);
  
  // Use the new quality-based calculation
  let value = calculateCropValue(seed, quality, variant, weatherEffects.valueMultiplier);
  
  // Apply value upgrades
  if (farm.upgrades && farm.upgrades.value && farm.upgrades.value[plotIndex]) {
    value = Math.floor(value * (1 + FARM_CONSTANTS.VALUE_UPGRADE_BONUS * farm.upgrades.value[plotIndex]));
  }
  
  return value;
}

module.exports = {
  findSeedByName,
  findSeedByKey,
  calculateGrowTime,
  isPlotReady,
  getEmptyPlots,
  countSeedsInInventory,
  countSeedsInFarmInventory,
  removeSeedFromInventory,
  removeSeedFromFarmInventory,
  hasSeed,
  countUserSeeds,
  calculateExpansionCost,
  calculateUpgradeCost,
  calculateSellValue
}; 