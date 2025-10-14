/**
 * Centralized Configuration Management
 * Handles all bot configuration, environment variables, and constants
 */

const path = require('path');
const fs = require('fs');

// ============================================================================
// ENVIRONMENT VALIDATION
// ============================================================================

const requiredEnvVars = [
  'DISCORD_TOKEN',
  'CLIENT_ID', 
  'MONGODB_URI'
];

function validateEnvironment() {
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  
  // Set defaults for optional vars
  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';
  if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'info';
  if (!process.env.OWNER_ID) process.env.OWNER_ID = '779738803630768148';
}

// ============================================================================
// BOT CONFIGURATION
// ============================================================================

const botConfig = {
  // Discord Bot Settings
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    intents: [
      'Guilds',
      'GuildMessages', 
      'MessageContent',
      'GuildMembers',
      'DirectMessages'
    ]
  },
  
  // Database Settings
  database: {
    uri: process.env.MONGODB_URI,
    options: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferMaxEntries: 0,
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },
  
  // Performance Settings
  performance: {
    cacheTTL: 60 * 60 * 1000, // 1 hour
    rateLimitDefault: { max: 5, windowMs: 10000 },
    maxRetries: 3,
    retryDelay: 1000,
    commandTimeout: 30000, // 30 seconds
    bulkOperationLimit: 100
  },
  
  // Security Settings
  security: {
    ownerId: process.env.OWNER_ID,
    maxGiftAmount: 500,
    maxTradeAmount: 10000,
    transactionTaxRate: 0.02, // 2%
    blacklistEnabled: true
  },
  
  // Logging Settings
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    fileRotation: {
      maxSize: '10m',
      maxFiles: '7d'
    },
    sensitiveFields: ['token', 'password', 'secret', 'key']
  },
  
  // Feature Flags
  features: {
    quests: true,
    guilds: true,
    farming: true,
    gambling: true,
    seasonalEvents: true,
    petSystem: true,
    shopSystem: true
  }
};

// ============================================================================
// GAME CONSTANTS
// ============================================================================

const gameConstants = {
  // Currency
  currency: {
    name: 'Kelocoin',
    plural: 'Kelocoins',
    symbol: '🪙',
    maxAmount: 999999999
  },
  
  // Cooldowns (in milliseconds)
  cooldowns: {
    beg: 30000, // 30 seconds
    work: 60000, // 1 minute
    slots: 60000, // 1 minute
    rob: 300000, // 5 minutes
    quest: 3600000, // 1 hour
    fishing: 10000, // 10 seconds
    duel: 60000, // 1 minute
    heist: 600000, // 10 minutes
    daily: 3600000, // 1 hour
    gift: 10000, // 10 seconds
    trade: 10000, // 10 seconds
    bet: 10000, // 10 seconds
    dig: 30000, // 30 seconds
    gamble: 5000, // 5 seconds
    mine: 0, // Handled internally by the 12-hour mining system
    prestige: 86400000, // 24 hours
    party: 300000, // 5 minutes
    afk: 60000, // 1 minute
    quiz: 30000, // 30 seconds
    pet: 3600000, // 1 hour (pet collection)
    farm: 1800000, // 30 minutes (farm collection)
    guild: 10000, // 10 seconds
    shop: 5000, // 5 seconds
    use: 5000, // 5 seconds
    sell: 5000, // 5 seconds
    boosters: 5000, // 5 seconds
    help: 5000, // 5 seconds
    ping: 5000, // 5 seconds
    profile: 5000, // 5 seconds
    inventory: 5000, // 5 seconds
    balance: 5000, // 5 seconds
    meme: 300000, // 5 minutes
    color: 10000, // 10 seconds
    // Admin commands - no cooldown
    give: 0,
    remove: 0,
    resetprestige: 0,
    resetlevel: 0,
    lbcreate: 0,
    weeklylb: 0,
    lbannounce: 0,
    collectdrop: 0,
    owner: 0,
    seasonal: 0,
    skip: 0
  },
  
  // Shop Prices
  shopPrices: {
    'Shovel': 5000,
    'Fishing Rod': 8000,
    'University degree': 25000,
    'Pet Bot': 75000,
    'Meme Pack': 7500,
    'Color Pack': 20000,
    'Loot Crate': 7500,
    'Double Drop Card': 100000,
    'Event Pass': 20000,
    'Auto Collector': 1500000,
    'Gamble Token': 2500,
    'XP Booster': 3000,
    'Coin Booster': 5000,
    'Luck Booster': 4000,
    'Speed Booster': 6000,
    'Mega Booster': 15000,
    'Mystery Box': 10000,
    'Gift Coins': 1000,
    'AFK Shield': 8000,
    'Joke Generator': 6000,
    'Pickaxe': 125000,
    'Guild Ticket': 50000,
    'Box of Seeds': 15000,
    '👨‍🌾 Worker': 35000,
    'Fertilizer': 3500
  },
  
  // XP System
  xp: {
    baseXpPerCommand: 10,
    levelFormula: (level) => 1000 + 250 * level,
    maxLevel: 1000
  },
  
  // Prestige System
  prestige: {
    ranks: [
      { level: 1, name: 'Novice', multiplier: 1.0, coinsRequired: 0, milestoneReward: 0 },
      { level: 2, name: 'Apprentice', multiplier: 1.2, coinsRequired: 25000, milestoneReward: 25000 },
      { level: 3, name: 'Adept', multiplier: 1.4, coinsRequired: 75000, milestoneReward: 75000 },
      { level: 4, name: 'Expert', multiplier: 1.6, coinsRequired: 200000, milestoneReward: 200000 },
      { level: 5, name: 'Master', multiplier: 1.8, coinsRequired: 500000, milestoneReward: 500000 },
      { level: 6, name: 'Grandmaster', multiplier: 2.0, coinsRequired: 1000000, milestoneReward: 1000000 },
      { level: 7, name: 'Legend', multiplier: 2.3, coinsRequired: 2500000, milestoneReward: 2500000 },
      { level: 8, name: 'Mythic', multiplier: 2.6, coinsRequired: 5000000, milestoneReward: 5000000 },
      { level: 9, name: 'Ascendant', multiplier: 3.0, coinsRequired: 10000000, milestoneReward: 10000000 },
      { level: 10, name: 'Eternal', multiplier: 3.5, coinsRequired: 20000000, milestoneReward: 20000000 }
    ]
  },
  
  // Guild System
  guild: {
    maxMembers: 50,
    maxNameLength: 32,
    maxDescriptionLength: 200,
    creationCost: 50000,
    ticketPrice: 50000,
    warCost: 100000,
    vaultTaxRate: 0.05,
    leaveCooldown: 12 * 60 * 60 * 1000 // 12 hours
  },
  
  // Farming System
  farming: {
    maxPlots: 3,
    growthTime: {
      wheat: 5 * 60 * 1000, // 5 minutes
      corn: 10 * 60 * 1000, // 10 minutes
      tomato: 15 * 60 * 1000, // 15 minutes
      potato: 20 * 60 * 1000, // 20 minutes
      carrot: 25 * 60 * 1000, // 25 minutes
      strawberry: 30 * 60 * 1000 // 30 minutes
    },
    seedCosts: {
      wheat: 50,
      corn: 100,
      tomato: 200,
      potato: 400,
      carrot: 800,
      strawberry: 1600
    },
    harvestRewards: {
      wheat: 100,
      corn: 250,
      tomato: 500,
      potato: 1000,
      carrot: 2000,
      strawberry: 4000
    }
  },
  
  // Pet System
  pet: {
    collectionCooldown: 60 * 60 * 1000, // 1 hour
    baseReward: 100,
    rewardPerLevel: 10,
    baseXpGain: 20,
    xpPerLevel: 2,
    maxLevel: 100
  },
  
  // Mining System
  mining: {
    sessionDuration: 12 * 60 * 60 * 1000, // 12 hours
    baseReward: 1000,
    rewardPerLevel: 100,
    xpPerLevel: 50,
    maxLevel: 100
  }
};

// ============================================================================
// SEASONAL EVENTS
// ============================================================================

const seasonalEvents = {
  christmas: {
    name: 'Christmas Season',
    startDate: '12-01',
    endDate: '01-06',
    multiplier: 2.0,
    specialItems: ['Christmas Tree', 'Santa Hat', 'Gift Box'],
    description: '🎄 Double rewards during Christmas! Special holiday items available.',
    color: 0xff0000
  },
  halloween: {
    name: 'Halloween Spooktacular',
    startDate: '10-15',
    endDate: '11-05',
    multiplier: 1.5,
    specialItems: ['Pumpkin', 'Ghost Costume', 'Witch Hat'],
    description: '🎃 Spooky rewards and Halloween items!',
    color: 0xff6600
  },
  easter: {
    name: 'Easter Egg Hunt',
    startDate: '03-20',
    endDate: '04-20',
    multiplier: 1.3,
    specialItems: ['Easter Egg', 'Bunny Ears', 'Chocolate Bar'],
    description: '🥚 Easter egg hunt rewards and spring items!',
    color: 0xff69b4
  },
  valentines: {
    name: 'Valentine\'s Day',
    startDate: '02-10',
    endDate: '02-20',
    multiplier: 1.4,
    specialItems: ['Rose', 'Heart Box', 'Love Letter'],
    description: '💕 Love is in the air! Special Valentine rewards.',
    color: 0xff1493
  },
  newyear: {
    name: 'New Year Celebration',
    startDate: '12-30',
    endDate: '01-05',
    multiplier: 2.5,
    specialItems: ['Firework', 'Party Hat', 'Champagne'],
    description: '🎆 New Year special! Highest rewards of the year!',
    color: 0x00ffff
  },
  summer: {
    name: 'Summer Festival',
    startDate: '06-15',
    endDate: '08-15',
    multiplier: 1.2,
    specialItems: ['Beach Ball', 'Sunglasses', 'Ice Cream'],
    description: '☀️ Summer fun with special rewards!',
    color: 0xffd700
  }
};

// ============================================================================
// COMMAND CATEGORIES
// ============================================================================

const commandCategories = {
  Economy: ['balance', 'daily', 'beg', 'work', 'leaderboard', 'inventory', 'profile', 'xp', 'mine', 'prestige', 'mysteryrewards', 'craterewards', 'goldmine'],
  Shop: ['shop', 'use', 'boosters', 'boosterinfo'],
  Games: ['quiz', 'slots', 'duel', 'heist', 'bet', 'party', 'quest', 'fishing', 'dig', 'coinflip', 'dice', 'rps', '8ball', 'battle'],
  Social: ['trade', 'gift', 'rob', 'afk', 'social'],
  Pet: ['pet'],
  Premium: ['meme', 'color', 'boxofseeds'],
  Fishing: ['fish', 'lbfish'],
  Utility: ['help', 'ping', 'timer'],
  Admin: ['give', 'remove', 'resetprestige', 'resetlevel', 'lbcreate', 'weeklylb', 'lbannounce', 'collectdrop', 'owner', 'seasonal', 'skip'],
  Guilds: ['guild'],
  Other: [] // fallback
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function isHolidayActive(holidayKey) {
  const event = seasonalEvents[holidayKey];
  if (!event) return false;
  
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  
  const [startMonth, startDay] = event.startDate.split('-').map(Number);
  const [endMonth, endDay] = event.endDate.split('-').map(Number);
  
  // Handle year wrap-around (like Christmas)
  if (startMonth > endMonth) {
    return (currentMonth >= startMonth && currentDay >= startDay) || 
           (currentMonth <= endMonth && currentDay <= endDay);
  } else {
    return (currentMonth > startMonth || (currentMonth === startMonth && currentDay >= startDay)) &&
           (currentMonth < endMonth || (currentMonth === endMonth && currentDay <= endDay));
  }
}

function getCurrentHoliday() {
  for (const [key, event] of Object.entries(seasonalEvents)) {
    if (isHolidayActive(key)) {
      return { key, ...event };
    }
  }
  return null;
}

function getActiveHolidays() {
  return Object.entries(seasonalEvents)
    .filter(([key]) => isHolidayActive(key))
    .map(([key, event]) => ({ key, ...event }));
}

function getCooldown(commandName) {
  return gameConstants.cooldowns[commandName] || 5000;
}

function getShopPrice(itemName) {
  return gameConstants.shopPrices[itemName] || 0;
}

function isOwner(userId) {
  return userId === botConfig.security.ownerId;
}

function isAdmin(userId) {
  return isOwner(userId);
}

// ============================================================================
// CONFIGURATION LOADER
// ============================================================================

function loadConfig() {
  validateEnvironment();
  
  // Load custom config file if it exists
  const configPath = path.join(process.cwd(), 'config.json');
  let customConfig = {};
  
  try {
    if (fs.existsSync(configPath)) {
      customConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {
    /* ESLint: intentionally empty catch block */
  }
  
  // Merge custom config with defaults
  return {
    bot: { ...botConfig, ...customConfig.bot },
    game: gameConstants,
    seasonal: seasonalEvents,
    categories: commandCategories,
    utils: {
      isHolidayActive,
      getCurrentHoliday,
      getActiveHolidays,
      getCooldown,
      getShopPrice,
      isOwner,
      isAdmin
    }
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  loadConfig,
  validateEnvironment,
  botConfig,
  gameConstants,
  seasonalEvents,
  commandCategories,
  isHolidayActive,
  getCurrentHoliday,
  getActiveHolidays,
  getCooldown,
  getShopPrice,
  isOwner,
  isAdmin
}; 