// Fishing rewards logic
const { FISHING_BOOSTERS } = require('./constants');
const { secureRandomFloat } = require('../../utils/secureRandom');

function calculateFishValue(fish, { boosters, marketBonus = 1, activeBooster, globalMultiplier = 1 }) {
  let value = fish.basePrice;
  
  // Apply legacy boosters (for backward compatibility)
  if (boosters && boosters.valueBoost) {
    value *= (1 + boosters.valueBoost);
  }
  
  // Apply new booster system effects
  if (activeBooster) {
    const booster = FISHING_BOOSTERS.find(b => b.id === activeBooster);
    if (booster && booster.effects.valueBoost) {
      value *= (1 + booster.effects.valueBoost);
    }
  }
  
  // Apply market bonus
  value *= marketBonus;
  
  // Apply global multiplier
  value *= globalMultiplier;
  
  return Math.round(value);
}

function getCollectionReward(rarity) {
  // Example: reward coins for completing a rarity set
  const base = { COMMON: 2000, UNCOMMON: 5000, RARE: 15000, EPIC: 40000, LEGENDARY: 100000, MYTHIC: 500000 };
  return { coins: base[rarity] || 1000 };
}

function getRandomItemReward(rarity) {
  // Example: rare chance for special item
  if (rarity === 'MYTHIC') return { item: 'Mythic Relic', amount: 1 };
  if (rarity === 'LEGENDARY' && secureRandomFloat() < 0.1) return { item: 'Golden Bait', amount: 1 };
  if (rarity === 'EPIC' && secureRandomFloat() < 0.05) return { item: 'Epic Bait', amount: 1 };
  return null;
}

module.exports = { calculateFishValue, getCollectionReward, getRandomItemReward }; 