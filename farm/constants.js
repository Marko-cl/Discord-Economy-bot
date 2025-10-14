// RPG Seed Types
const SEED_TYPES = [
  { key: 'common', name: 'Sunblossom Seed', rarity: 'Common', drop: 0.65, sell: 500, grow: 1 * 60 * 60 * 1000, emoji: '🌻' },
  { key: 'uncommon', name: 'Moonleaf Seed', rarity: 'Uncommon', drop: 0.25, sell: 800, grow: 1.5 * 60 * 60 * 1000, emoji: '🌱' },
  { key: 'rare', name: 'Emberfruit Seed', rarity: 'Rare', drop: 0.07, sell: 1500, grow: 2 * 60 * 60 * 1000, emoji: '🌺' },
  { key: 'epic', name: 'Frostvine Seed', rarity: 'Epic', drop: 0.02, sell: 2500, grow: 3 * 60 * 60 * 1000, emoji: '🪻' },
  { key: 'legendary', name: 'Stormroot Seed', rarity: 'Legendary', drop: 0.007, sell: 4000, grow: 4 * 60 * 60 * 1000, emoji: '🏵️' },
  { key: 'mythic', name: 'Dreamshade Seed', rarity: 'Mythic', drop: 0.002, sell: 6000, grow: 5 * 60 * 60 * 1000, emoji: '🌸' },
  { key: 'divine', name: 'Starpetal Seed', rarity: 'Divine', drop: 0.0005, sell: 8000, grow: 6 * 60 * 60 * 1000, emoji: '💮' },
  { key: 'ancient', name: 'Ironbark Seed', rarity: 'Ancient', drop: 0.0002, sell: 12000, grow: 8 * 60 * 60 * 1000, emoji: '🪴' },
  { key: 'cursed', name: 'Shadowmoss Seed', rarity: 'Cursed', drop: 0.0001, sell: 18000, grow: 10 * 60 * 60 * 1000, emoji: '🥀' },
  { key: 'galactic', name: 'Cosmosprout Seed', rarity: 'Galactic', drop: 0.00005, sell: 25000, grow: 12 * 60 * 60 * 1000, emoji: '🪐' },
  { key: 'boxofseeds', name: 'Box of Seeds', rarity: 'Special', drop: 0, sell: 0, grow: 0, emoji: '🌱', price: 8000 }
];

// Farm constants
const FARM_CONSTANTS = {
  DEFAULT_PLOTS: 3,
  EXPANSION_COST_MULTIPLIER: 1.5,
  REMOVAL_REFUND_RATE: 0.5,
  UPGRADE_COST_MULTIPLIER: 2.0,
  GROWTH_UPGRADE_BONUS: 0.1,
  VALUE_UPGRADE_BONUS: 0.2,
  FERTILIZER_BONUS: 0.5
};

module.exports = {
  SEED_TYPES,
  FARM_CONSTANTS
}; 