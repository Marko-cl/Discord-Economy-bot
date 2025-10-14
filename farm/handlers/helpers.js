const { CROP_VARIANTS } = require('../quality');
const { withSafeReply } = require('../../../utils/safeReply');

// Helper to get rarity emoji
function getRarityEmoji(rarity) {
  const rarityEmojis = {
    'Common': '⚪',
    'Uncommon': '🟢',
    'Rare': '🔵',
    'Epic': '🟣',
    'Legendary': '🟡',
    'Mythic': '🟠',
    'Divine': '⚡',
    'Ancient': '🪨',
    'Cursed': '💀',
    'Galactic': '🪐'
  };
  return rarityEmojis[rarity] || '⚪';
}

// Helper to get next quality level
function getNextQuality(currentQuality) {
  const qualities = ['TRASH', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
  const currentIndex = qualities.indexOf(currentQuality);
  return currentIndex < qualities.length - 1 ? qualities[currentIndex + 1] : currentQuality;
}

// Helper to calculate quality upgrade cost
function calculateQualityUpgradeCost(currentQuality) {
  const baseCost = 10000;
  const qualityMultiplier = {
    'TRASH': 0.5, // Cheaper to upgrade from trash
    'COMMON': 1,
    'UNCOMMON': 2,
    'RARE': 4,
    'EPIC': 8
  };
  return baseCost * (qualityMultiplier[currentQuality] || 1);
}

// Helper to get seed rarity multiplier
function getSeedRarityMultiplier(seed) {
  const rarityMultipliers = {
    'Common': 1.0,
    'Uncommon': 1.2,
    'Rare': 1.5,
    'Epic': 2.0,
    'Legendary': 3.0,
    'Mythic': 4.0,
    'Divine': 5.0,
    'Ancient': 6.0,
    'Cursed': 7.0,
    'Galactic': 10.0
  };
  return rarityMultipliers[seed.rarity] || 1.0;
}

// Helper to get buff multiplier
function getBuffMultiplier(plot, farm) {
  let mult = 1;
  if (plot.quality && plot.quality !== 'COMMON') {
    if (plot.quality === 'TRASH') {
      mult -= 0.2; // Trash quality reduces buff
    } else {
      mult += 0.2; // Better qualities increase buff
    }
  }
  if (plot.variant) mult += 0.3;
  if (farm.fertilizer) mult += 0.5;
  return mult;
}

// Helper to get current boosts text for display
function getCurrentBoostsText(plot, farm, plotIndex = 0) {
  const boosts = [];
  
  // Quality boost
  if (plot.quality && plot.quality !== 'COMMON') {
    if (plot.quality === 'TRASH') {
      boosts.push('🗑️ Trash Quality (-20% cost)');
    } else {
      boosts.push(`⭐ ${plot.quality} Quality (+20% cost)`);
    }
  }
  
  // Variant boost
  if (plot.variant) {
    const variantData = CROP_VARIANTS[plot.variant];
    if (variantData) {
      boosts.push(`${variantData.emoji} ${variantData.name} Variant (+30% cost)`);
    }
  }
  
  // Fertilizer boost
  if (farm.fertilizer) {
    boosts.push('🌱 Fertilizer Active (+50% cost)');
  }
  
  // Plot-specific upgrades
  if (farm.upgrades) {
    if (farm.upgrades.growth && farm.upgrades.growth[plotIndex]) {
      boosts.push(`⚡ Plot Growth: +${farm.upgrades.growth[plotIndex] * 10}%`);
    }
    if (farm.upgrades.value && farm.upgrades.value[plotIndex]) {
      boosts.push(`💎 Plot Value: +${farm.upgrades.value[plotIndex] * 20}%`);
    }
  }
  
  return boosts.length > 0 ? boosts.join('\n') : 'No current boosts';
}

module.exports = {
  getRarityEmoji: withSafeReply(getRarityEmoji),
  getNextQuality: withSafeReply(getNextQuality),
  calculateQualityUpgradeCost: withSafeReply(calculateQualityUpgradeCost),
  getSeedRarityMultiplier: withSafeReply(getSeedRarityMultiplier),
  getBuffMultiplier: withSafeReply(getBuffMultiplier),
  getCurrentBoostsText: withSafeReply(getCurrentBoostsText)
}; 