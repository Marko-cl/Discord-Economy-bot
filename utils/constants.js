// Constants and configuration for Discord bot economy
const constants = {
  COOLDOWNS: {
    beg: 60000,
    work: 600000,
    slots: 60000,
    rob: 300000,
    quest: 3600000,
    fishing: 10000,
    duel: 60000,
    heist: 600000,
    daily: 3600000,
    gift: 10000,
    trade: 10000,
    bet: 10000,
  },
  CURRENCY: {
    name: 'Kelocoin',
    plural: 'Kelocoins',
    symbol: '🪙',
  },
  OWNER_ID: '779738803630768148',
  CACHE_TTL: 60 * 60 * 1000, // 1 hour
  RATE_LIMIT_DEFAULT: { max: 5, windowMs: 10000 },
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
};

// Cosmetics definition for easy future expansion
const COSMETICS = {
  hasGoldenPetBot: {
    name: 'Golden Pet Bot',
    icon: '🌟🤖',
    multiplier: 0.05
  },
  hasDiamondShovel: {
    name: 'Diamond Shovel',
    icon: '💎⛏️',
    multiplier: 0.03
  }
};

module.exports = {
  constants,
  COSMETICS
}; 