const { secureRandomFloat } = require('../../utils/secureRandom');

// Crop quality levels and their effects
const CROP_QUALITIES = {
  TRASH: {
    name: 'Trash',
    emoji: '🗑️',
    valueMultiplier: 0.3,
    growthMultiplier: 0.8,
    chance: 0.01, // 1% chance
    description: 'Poor quality crop, barely worth anything'
  },
  COMMON: {
    name: 'Common',
    emoji: '⚪',
    valueMultiplier: 1.0,
    growthMultiplier: 1.0,
    chance: 0.69, // 69% chance (reduced from 70%)
    description: 'Standard quality crop'
  },
  UNCOMMON: {
    name: 'Uncommon',
    emoji: '🟢',
    valueMultiplier: 1.5,
    growthMultiplier: 1.1,
    chance: 0.20, // 20% chance (unchanged)
    description: 'Better than average quality'
  },
  RARE: {
    name: 'Rare',
    emoji: '🔵',
    valueMultiplier: 2.0,
    growthMultiplier: 1.2,
    chance: 0.08, // 8% chance (unchanged)
    description: 'High quality, valuable crop'
  },
  EPIC: {
    name: 'Epic',
    emoji: '🟣',
    valueMultiplier: 3.0,
    growthMultiplier: 1.3,
    chance: 0.015, // 1.5% chance (unchanged)
    description: 'Exceptional quality, very valuable'
  },
  LEGENDARY: {
    name: 'Legendary',
    emoji: '🟡',
    valueMultiplier: 4.0,
    growthMultiplier: 1.5,
    chance: 0.005, // 0.5% chance (unchanged)
    description: 'Perfect quality, extremely valuable'
  }
};

// Special crop variants (mutations)
const CROP_VARIANTS = {
  GOLDEN: {
    name: 'Golden',
    emoji: '🌟',
    valueMultiplier: 2.0,
    growthMultiplier: 0.8,
    chance: 0.01, // 1% chance when using fertilizer
    description: 'Golden variant - very valuable but slower growth'
  },
  CRYSTAL: {
    name: 'Crystal',
    emoji: '💎',
    valueMultiplier: 3.0,
    growthMultiplier: 0.6,
    chance: 0.005, // 0.5% chance when using fertilizer
    description: 'Crystal variant - extremely valuable but very slow growth'
  },
  GIANT: {
    name: 'Giant',
    emoji: '🌱',
    valueMultiplier: 1.5,
    growthMultiplier: 1.4,
    chance: 0.02, // 2% chance when using fertilizer
    description: 'Giant variant - larger yield, faster growth'
  }
};

// Determine crop quality based on various factors
function determineCropQuality(seed, farm, plotIndex, useFertilizer = false) {
  let baseChance = secureRandomFloat(); // 0-1 range
  let quality = 'COMMON';
  
  // Base quality determination
  for (const [qual, data] of Object.entries(CROP_QUALITIES)) {
    if (baseChance <= data.chance) {
      quality = qual;
      break;
    }
    baseChance -= data.chance;
  }
  
  // Check for variants if using fertilizer
  let variant = null;
  if (useFertilizer) {
    let variantChance = secureRandomFloat(); // 0-1 range
    for (const [varName, varData] of Object.entries(CROP_VARIANTS)) {
      if (variantChance <= varData.chance) {
        variant = varName;
        break;
      }
      variantChance -= varData.chance;
    }
  }
  
  // Apply plot upgrades
  const plotUpgrades = farm.upgrades?.quality?.[plotIndex] || 0;
  if (plotUpgrades > 0) {
    // Each quality upgrade increases chances of better quality
    const upgradeBonus = plotUpgrades * 0.1; // 10% per upgrade
    if (secureRandomFloat() < upgradeBonus) {
      const qualities = Object.keys(CROP_QUALITIES);
      const currentIndex = qualities.indexOf(quality);
      if (currentIndex < qualities.length - 1) {
        quality = qualities[currentIndex + 1];
      }
    }
  }
  
  return { quality, variant };
}

// Calculate final crop value with quality and variant
function calculateCropValue(seed, quality, variant = null, weatherMultiplier = 1.0) {
  const qualityData = CROP_QUALITIES[quality];
  const variantData = variant ? CROP_VARIANTS[variant] : null;
  
  let valueMultiplier = qualityData.valueMultiplier;
  if (variantData) {
    valueMultiplier *= variantData.valueMultiplier;
  }
  
  return Math.floor(seed.sell * valueMultiplier * weatherMultiplier);
}

// Calculate growth time with quality and variant
function calculateGrowthTime(seed, farm, quality, variant = null, weatherMultiplier = 1.0, plotIndex = 0) {
  const qualityData = CROP_QUALITIES[quality];
  const variantData = variant ? CROP_VARIANTS[variant] : null;
  
  let growthMultiplier = qualityData.growthMultiplier;
  if (variantData) {
    growthMultiplier *= variantData.growthMultiplier;
  }
  
  // Apply plot-specific growth upgrades
  const plotUpgrades = farm.upgrades?.growth?.[plotIndex] || 0;
  const upgradeMultiplier = 1 + (plotUpgrades * 0.1); // 10% per upgrade
  
  // Apply fertilizer
  const fertilizerMultiplier = farm.fertilizer ? 0.5 : 1.0; // 50% faster with fertilizer
  
  return Math.floor(seed.grow * growthMultiplier / weatherMultiplier * upgradeMultiplier * fertilizerMultiplier);
}

// Get quality display info
function getQualityDisplay(quality, variant = null) {
  const qualityData = CROP_QUALITIES[quality];
  const variantData = variant ? CROP_VARIANTS[variant] : null;
  
  let display = `${qualityData.emoji} ${qualityData.name}`;
  if (variantData) {
    display += ` (${variantData.emoji} ${variantData.name})`;
  }
  
  return {
    display,
    emoji: variantData ? variantData.emoji : qualityData.emoji,
    description: variantData ? variantData.description : qualityData.description
  };
}

// Check if crop is ready with quality effects
function isCropReadyWithQuality(plot) {
  if (!plot || !plot.plantedAt || !plot.growTime) return false;
  
  const readyAt = plot.plantedAt + plot.growTime;
  return Date.now() >= readyAt;
}

module.exports = {
  CROP_QUALITIES,
  CROP_VARIANTS,
  determineCropQuality,
  calculateCropValue,
  calculateGrowthTime,
  getQualityDisplay,
  isCropReadyWithQuality
}; 