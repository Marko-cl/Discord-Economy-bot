const mongoose = require('mongoose');
require('dotenv').config();
const logger = require('../logger');

const userSchema = new mongoose.Schema({
  _id: String, // Discord user ID
  coins: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  // Inventory: always an object
  inventory: { type: Object, default: {} },
  // Farm inventory: stores seeds, workers, fertilizer with count and rarity
  farmInventory: { type: Object, default: {} },
  last_daily: { type: String, default: null },
  accountCreated: { type: Date, default: null }, // When user first interacted with bot
  afkShieldActiveUntil: { type: Number, default: 0 }, // timestamp in ms
  quests: {
    dailyAssigned: { type: [String], default: [] },
    dailyProgress: { type: Object, default: {} },
    dailyCompleted: { type: [String], default: [] },
    lastDailyReset: { type: Date, default: null },
    weekly: {
      duels: { type: Number, default: 0 },
      earn: { type: Number, default: 0 },
      completed: { type: [String], default: [] }
    },
    lastWeeklyReset: { type: Date, default: null }
  },
  xpBooster: { type: Date, default: null },
  coinBooster: { type: Date, default: null },
  luckBooster: { type: Date, default: null },
  speedBooster: { type: Date, default: null },
  
  memePack: { type: Boolean, default: false },
  lastMeme: { type: Date, default: null },
  hasPetBot: { type: Boolean, default: false },
  petBot: { type: mongoose.Schema.Types.Mixed, default: false },
  colorPack: { type: Boolean, default: false },
  embedColor: { type: String, default: null },
  gambleTokens: { type: Number, default: 0 },
  autoCollector: { type: Date, default: null },
  afkShield: { type: Boolean, default: false },
  doubleDropCard: { type: Date, default: null },
  eventPass: { type: Boolean, default: false },
  eventPassEnd: { type: Date, default: null },
  jokeGenerator: { type: Boolean, default: false },
  giftedToday: { type: Object, default: {} },
  goldMineLevel: { type: Number, default: 1 },
  goldMineXp: { type: Number, default: 0 },
  goldMineStartedAt: { type: Date, default: null },
  goldMineLastClaimed: { type: Date, default: null },
  goldMineTotalCoins: { type: Number, default: 0 },
  prestigeLevel: { type: Number, default: 1 },
  prestigeMultiplier: { type: Number, default: 1.0 },
  prestigeRank: { type: String, default: 'Novice' },
  hasGoldenPetBot: { type: Boolean, default: false },
  hasDiamondShovel: { type: Boolean, default: false },
  guildLeaveCooldown: { type: Date, default: null }, // Track when user left guild for 12h cooldown
  lastQuizGamble: { type: Date, default: null }, // Track when user last gambled on hard difficulty quiz
  guildId: { type: String, default: null }, // Guild ID if user is in a guild
  guildRole: { type: String, default: null }, // Role in guild (owner, officer, member)
  farm: {
    plots: { type: [mongoose.Schema.Types.Mixed], default: [null, null, null] }, // Array of plots, each can be null or a crop object
    harvestedCrops: { type: Object, default: {} }, // { seedName: amount, ... }
    auto: { type: Object, default: {} }, // { autoplant: boolean, autocollect: boolean }
    stats: { type: Object, default: {} }, // { grown: {}, sold: {}, coinsEarned: number }
    upgrades: { type: Object, default: {} }, // { growth: number, value: number }
    fertilizer: { type: Boolean, default: false }, // Fertilizer boost flag
    lastHarvest: { type: Date, default: null } // Last harvest timestamp
  },
  // FISHING SYSTEM FIELDS
  fishInventory: { type: Object, default: {} }, // { fishId: { count, firstCaught } }
  totalFishCaught: { type: Number, default: 0 },
  fishingCoinsEarned: { type: Number, default: 0 },
  activeBait: { type: String, default: null },
  activeBaitUses: { type: Number, default: 0 }, // Track how many times active bait has been used
  activeBooster: { type: String, default: null },
  activeBoosterExpires: { type: Number, default: null }, // Timestamp when booster expires
  fishingRod: { type: Object, default: { level: 1, skin: 'default' } },
  lastFished: { type: Number, default: null }, // Timestamp of last fishing action for cooldown
  // FISHING COLLECTION SYSTEM - PERMANENT PROGRESS TRACKING
  fishLog: { type: Object, default: {} }, // { fishId: { count, firstCaught, lastCaught } } - PERMANENT collection log
  fishingCollectionCompleted: { type: Object, default: {} }, // { rarity: boolean } - Track completed collections
  fishingCollectionTiers: { type: Object, default: {} }, // { rarity: number } - Track highest tier completed for each rarity
  
  // Fishing object for nested field updates
  fishing: { type: Object, default: {} },
  
  // MINING SYSTEM FIELDS
  mining: {
    // Mining stats and progress
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    totalOresMined: { type: Number, default: 0 },
    totalCoinsEarned: { type: Number, default: 0 },
    lastMined: { type: Number, default: null }, // Timestamp for cooldowns
    
    // Mining equipment and tools
    activeTool: { type: String, default: 'Wooden Pickaxe' },
    tools: { type: Object, default: {} }, // { toolName: { durability, lastRepair } }
    
    // Mining upgrades
    upgrades: { type: Object, default: {} }, // { efficiency: level, luck: level, depth: level, capacity: level }
    
    // Mining inventory (ores and materials)
    inventory: { type: Object, default: {} }, // { oreName: count }
    capacity: { type: Number, default: 100 }, // Max ores that can be carried
    
    // Mining quests and challenges
    quests: {
      active: { type: [String], default: [] }, // Active quest IDs
      completed: { type: [String], default: [] }, // Completed quest IDs
      progress: { type: Object, default: {} }, // { questId: progress }
      lastDailyReset: { type: Date, default: null },
      streak: { type: Number, default: 0 } // Daily quest streak
    },
    
    // Mining contracts
    contracts: {
      active: { type: [String], default: [] }, // Active contract IDs
      completed: { type: [String], default: [] }, // Completed contract IDs
      progress: { type: Object, default: {} } // { contractId: progress }
    },
    
    // Mining investments and market
    investments: { type: Object, default: {} }, // { stockName: { shares, avgPrice } }
    marketHistory: { type: Object, default: {} }, // { oreName: [prices] }
    

    horoscopeSign: { type: String, default: null },
    lastHoroscope: { type: Date, default: null },
    
    // Mining team/guild activities
    teamSession: { type: String, default: null }, // Guild ID if in team mining
    teamSessionStart: { type: Number, default: null },
    
    // Mining streaks and achievements
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastMiningDay: { type: Date, default: null },
    
    // Mining statistics
    stats: {
      blocksDug: { type: Number, default: 0 },
      diamondsFound: { type: Number, default: 0 },
      rareOresCollected: { type: Number, default: 0 },
      timeMining: { type: Number, default: 0 }, // Total seconds
      toolsUsed: { type: Number, default: 0 },
      contractsCompleted: { type: Number, default: 0 },
    
    }
  }
});

const shopItemSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  price: { type: Number, required: true },
  description: { type: String, default: '' },
  category: { type: String, default: 'general' },
  oneTime: { type: Boolean, default: false },
  consumable: { type: Boolean, default: false },
  effect: { type: String, default: null },
  duration: { type: Number, default: null }, // Duration in milliseconds
  icon: { type: String, default: '📦' },
  rarity: { type: String, default: null },
  tradeable: { type: Boolean, default: false },
  usable: { type: Boolean, default: false }
});

const leaderboardConfigSchema = new mongoose.Schema({
  metric: { type: String, enum: ['coins', 'xp', 'multiplier'], required: true },
  startTime: { type: Date, required: true },
  rewards: {
    first: { type: Number, required: true },
    second: { type: Number, required: true },
    third: { type: Number, required: true }
  },
  announceChannel: { type: String, default: null }
});

// Permanent leaderboard cache schema
const permanentLeaderboardSchema = new mongoose.Schema({
  _id: String, // metric type (coins, xp, prestige)
  data: [{
    userId: { type: String, required: true },
    username: { type: String, required: true },
    value: { type: Number, required: true },
    rank: { type: Number, required: true }
  }],
  lastUpdated: { type: Date, default: Date.now },
  nextUpdate: { type: Date, default: Date.now }, // When to refresh next (hourly)
  totalUsers: { type: Number, default: 0 }
});

const guildSchema = new mongoose.Schema({
  _id: String, // Guild ID
  guildId: { type: String, unique: true }, // Alternative guild ID field
  name: { type: String, required: true, unique: true },
  owner: { type: String, required: true }, // Discord user ID
  description: { type: String, default: '' },
  icon: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  officers: { type: [String], default: [] }, // Array of user IDs
  members: { type: [String], default: [] }, // Array of user IDs
  vault: { type: Number, default: 0 }, // Guild vault/bank
  businesses: {
    type: [
      {
        type: { type: String, required: true },
        level: { type: Number, default: 1 },
        lastCollected: { type: Date, default: null },
        efficiency: { type: Number, default: 1 }
      }
    ],
    default: []
  },
  businessPayouts: {
    enabled: { type: Boolean, default: false },
    payoutInterval: { type: Number, default: 3600000 }, // 1 hour
    lastPayout: { type: Date, default: null },
    guildCut: { type: Number, default: 0.2 },
    distributionMethod: { type: String, default: 'EQUAL' }
  },
  wars: {
    type: [
      {
        targetGuild: { type: String, required: true },
        status: { type: String, enum: ['ACTIVE', 'ENDED'], default: 'ACTIVE' },
        endsAt: { type: Date, required: true }
      }
    ],
    default: []
  },
  events: {
    type: [
      {
        title: { type: String, required: true },
        description: { type: String, required: true },
        type: { type: String, required: true },
        scheduledAt: { type: Date, required: true },
        duration: { type: Number, required: true },
        participants: { type: [String], default: [] },
        rewards: { type: Number, default: 0 }
      }
    ],
    default: []
  },
  alliances: {
    type: [
      {
        guildId: { type: String, required: true },
        status: { type: String, enum: ['ACTIVE', 'PENDING', 'BROKEN'], default: 'PENDING' }
      }
    ],
    default: []
  },
  territories: {
    type: [
      {
        type: { type: String, required: true },
        acquiredAt: { type: Date, default: Date.now }
      }
    ],
    default: []
  },
  treasury: { type: Number, default: 0 }, // Guild bank (legacy)
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
  maxMembers: { type: Number, default: 10 },
  settings: {
    public: { type: Boolean, default: true },
    autoAccept: { type: Boolean, default: false },
    minLevel: { type: Number, default: 0 },
    minCoins: { type: Number, default: 0 },
    loggingEnabled: { type: Boolean, default: false },
    logChannelId: { type: String, default: null }
  },
  announcements: [{
    content: { type: String, required: true },
    author: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  invites: [{
    code: { type: String, required: true },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    uses: { type: Number, default: 0 },
    maxUses: { type: Number, default: 1 }
  }],
  applications: [{
    userId: { type: String, required: true },
    username: { type: String, required: true },
    message: { type: String, default: '' },
    status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED'], default: 'PENDING' },
    appliedAt: { type: Date, default: Date.now },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null }
  }],
  activityLog: [{
    action: { type: String, required: true },
    userId: { type: String, required: true },
    username: { type: String, required: true },
    details: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
  }]
});

const guildLeaderboardSchema = new mongoose.Schema({
  _id: String, // Guild ID
  totalCoins: { type: Number, default: 0 },
  totalXp: { type: Number, default: 0 },
  memberCount: { type: Number, default: 0 },
  averageLevel: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
  weeklyStats: {
    coinsEarned: { type: Number, default: 0 },
    xpEarned: { type: Number, default: 0 },
    questsCompleted: { type: Number, default: 0 },
    startDate: { type: Date, default: Date.now }
  },
  monthlyStats: {
    coinsEarned: { type: Number, default: 0 },
    xpEarned: { type: Number, default: 0 },
    questsCompleted: { type: Number, default: 0 },
    startDate: { type: Date, default: Date.now }
  }
});

let User = mongoose.model('User', userSchema);
let ShopItem = mongoose.model('ShopItem', shopItemSchema);
let LeaderboardConfig = mongoose.model('LeaderboardConfig', leaderboardConfigSchema);
let Guild = mongoose.model('Guild', guildSchema);
let GuildLeaderboard = mongoose.model('GuildLeaderboard', guildLeaderboardSchema);

let PermanentLeaderboard;
try {
  PermanentLeaderboard = mongoose.model('PermanentLeaderboard', permanentLeaderboardSchema);
} catch {
  // Model already exists, use it
  PermanentLeaderboard = mongoose.model('PermanentLeaderboard');
}

// Prestige ranks and multipliers
const prestigeRanks = [
  { level: 1, name: 'Novice', multiplier: 1.0, coinsRequired: 0, milestoneReward: 0 },
  { level: 2, name: 'Apprentice', multiplier: 1.2, coinsRequired: 15000, milestoneReward: 10000 },
  { level: 3, name: 'Adept', multiplier: 1.4, coinsRequired: 40000, milestoneReward: 25000 },
  { level: 4, name: 'Expert', multiplier: 1.6, coinsRequired: 100000, milestoneReward: 50000 },
  { level: 5, name: 'Master', multiplier: 1.8, coinsRequired: 250000, milestoneReward: 100000 },
  { level: 6, name: 'Grandmaster', multiplier: 2.0, coinsRequired: 500000, milestoneReward: 100000 },
  { level: 7, name: 'Legend', multiplier: 2.3, coinsRequired: 1000000, milestoneReward: 100000 },
  { level: 8, name: 'Mythic', multiplier: 2.6, coinsRequired: 2000000, milestoneReward: 100000 },
  { level: 9, name: 'Ascendant', multiplier: 3.0, coinsRequired: 4000000, milestoneReward: 100000 },
  { level: 10, name: 'Eternal', multiplier: 3.5, coinsRequired: 8000000, milestoneReward: 100000 }
];

// ============================================================================
// DATABASE INDEXES FOR PERFORMANCE
// ============================================================================

// Create indexes for better query performance
async function createIndexes() {
  try {
    // User collection indexes
    await User.collection.createIndex({ coins: -1 }); // For leaderboards
    await User.collection.createIndex({ level: -1 }); // For level-based queries
    await User.collection.createIndex({ xp: -1 }); // For XP-based queries
    await User.collection.createIndex({ prestigeLevel: -1 }); // For prestige queries
    await User.collection.createIndex({ last_daily: 1 }); // For daily command cooldowns
    await User.collection.createIndex({ 'quests.dailyCompleted': 1 }); // For quest tracking
    await User.collection.createIndex({ 'quests.weekly.completed': 1 }); // For weekly quests
    await User.collection.createIndex({ totalFishCaught: -1 }); // For fishing leaderboards
    await User.collection.createIndex({ fishingCoinsEarned: -1 }); // For fishing leaderboards
    
    // ShopItem collection indexes
    await ShopItem.collection.createIndex({ name: 1 }, { unique: true }); // For item lookups
    await ShopItem.collection.createIndex({ category: 1 }); // For category filtering
    await ShopItem.collection.createIndex({ price: 1 }); // For price-based queries
    await ShopItem.collection.createIndex({ oneTime: 1 }); // For one-time item queries
    
    // Guild collection indexes
    await Guild.collection.createIndex({ name: 1 }, { unique: true }); // For guild name lookups
    await Guild.collection.createIndex({ owner: 1 }); // For owner-based queries
    await Guild.collection.createIndex({ 'members.userId': 1 }); // For member lookups
    await Guild.collection.createIndex({ level: -1 }); // For guild leaderboards
    
    // GuildLeaderboard collection indexes
    await GuildLeaderboard.collection.createIndex({ totalCoins: -1 }); // For guild rankings
    await GuildLeaderboard.collection.createIndex({ totalXp: -1 }); // For XP rankings
    await GuildLeaderboard.collection.createIndex({ memberCount: -1 }); // For member count rankings
    
    // LeaderboardConfig collection indexes
    await LeaderboardConfig.collection.createIndex({ metric: 1 }); // For metric-based queries
    await LeaderboardConfig.collection.createIndex({ startTime: -1 }); // For time-based queries
    
    logger.info('Database indexes created successfully');
  } catch (error) {
    logger.error('Error creating database indexes:', error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  User,
  ShopItem,
  LeaderboardConfig,
  getOneTimeItemNames: async function() {
    try {
      const items = await ShopItem.find({ oneTime: true });
      return items.map(i => i.name);
    } catch {
      return [];
    }
  },
  prestigeRanks: prestigeRanks,
  Guild: Guild,
  GuildLeaderboard: GuildLeaderboard,
  PermanentLeaderboard: PermanentLeaderboard,
  createIndexes
}; 