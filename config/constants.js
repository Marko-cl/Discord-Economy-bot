// constants.js

// Items to hide/remove from the shop list
const SHOP_REMOVED_ITEMS = Object.freeze([
  'Status Booster',
  'Name Flair',
  'Premium Chat Badge',
  'Username Glow',
  'Soundboard Booster',
  'Custom Role',
  'Priority Speaker',
  'VIP Lounge Ticket',
  'Hidden Channel Access',
  'Voice Priority Pass'
]);

// Command categories for /help
const COMMAND_CATEGORIES = Object.freeze({
  Economy: Object.freeze(['balance', 'daily', 'beg', 'work', 'leaderboard', 'inventory', 'profile', 'xp', 'mine', 'prestige', 'mysteryrewards', 'craterewards', 'goldmine']),
  Shop: Object.freeze(['shop', 'use', 'boosters', 'boosterinfo']),
  Games: Object.freeze(['fish', 'dig', 'slots', 'bet', 'gamble', 'duel', 'heist', 'rob', 'quiz', 'coinflip', 'dice', 'rps', '8ball', 'party', 'battle']),
  Social: Object.freeze(['trade', 'gift', 'rob', 'afk', 'social']),
  Pet: Object.freeze(['pet']),
  Premium: Object.freeze(['meme', 'color', 'boxofseeds']),
  Farming: Object.freeze(['farm']),
  Fishing: Object.freeze(['fish', 'lbfish']),
  Utility: Object.freeze(['help', 'pinglu', 'timer']),
  Admin: Object.freeze(['give', 'remove', 'resetprestige', 'resetlevel', 'lbcreate', 'weeklylb', 'lbannounce', 'collectdrop', 'owner', 'seasonal', 'skip']),
  Guilds: Object.freeze(['guild']),
  Other: Object.freeze([]) // fallback
});

// Cooldown constants (in milliseconds)
const COOLDOWNS = Object.freeze({
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
  mine: 0, // Handled internally by the mine command
  prestige: 86400000, // 24 hours
  party: 300000, // 5 minutes
  afk: 60000, // 1 minute
  quiz: 30000, // 30 seconds
  leaderboard: 10000, // 10 seconds
  inventory: 5000, // 5 seconds
  profile: 5000, // 5 seconds
  balance: 5000, // 5 seconds
  shop: 5000, // 5 seconds
  use: 5000, // 5 seconds
  sell: 5000, // 5 seconds
  boosters: 5000, // 5 seconds
  boosterinfo: 5000, // 5 seconds
  help: 5000, // 5 seconds
  pinglu: 5000, // 5 seconds
  timer: 5000, // 5 seconds
  guild: 10000, // 10 seconds
  meme: 10000, // 10 seconds
  color: 10000, // 10 seconds
  pet: 10000, // 10 seconds
  give: 0, // No cooldown for admin commands
  remove: 0, // No cooldown for admin commands
  resetprestige: 0, // No cooldown for admin commands
  resetlevel: 0, // No cooldown for admin commands
  lbcreate: 0, // No cooldown for admin commands
  weeklylb: 0, // No cooldown for admin commands
  lbannounce: 0, // No cooldown for admin commands
  collectdrop: 0, // No cooldown for admin commands
  owner: 0, // No cooldown for admin commands
  seasonal: 0, // No cooldown for admin commands
  skip: 0 // No cooldown for admin commands
});

const SHOP_PRICES = Object.freeze({
  'Shovel': 5000, // Early grind milestone
  'Fishing Rod': 8000, // Fishing unlocks new income
  'University degree': 25000, // Big milestone for work command
  'Pet Bot': 75000, // Major passive income goal
  'Meme Pack': 7500, // Fun, not instant
  'Color Pack': 20000, // Cosmetic grind
  'Loot Crate': 7500, // Save up for excitement
  'Double Drop Card': 100000, // Endgame gambling
  'Event Pass': 20000, // Party event boost, mid-late game
  'Auto Collector': 1500000, // Ultimate flex, permanent daily claiming
  'Gamble Token': 2500, // Gambling currency for high-stakes games
  'XP Booster': 3000, // 2x XP for 2 hours
  'Coin Booster': 5000, // 1.5x coins for 3 hours
  'Luck Booster': 4000, // Better gambling odds for 1 hour
  'Speed Booster': 6000, // Reduced cooldowns for 2 hours
  'Mega Booster': 15000, // All boosts for 1 hour (premium)
  'Mystery Box': 10000, // Random valuable items
  'Gift Coins': 1000, // Required for gifting
  'AFK Shield': 8000, // Protection
  'Joke Generator': 6000, // Fun utility
  'Pickaxe': 125000, // Required for Gold Mine
  'Guild Ticket': 50000, // Required for guild creation/joining
  'Box of Seeds': 15000, // Farming investment
  '👨‍🌾 Worker': 35000, // Auto-farming power
  'Fertilizer': 3500 // Farming boost
});

// (Removed hardcoded MONGODB_URI for security; use process.env.MONGODB_URI in your code)

// Seasonal Events Configuration
const SEASONAL_EVENTS = {
  // Christmas Season (Dec 1 - Jan 6)
  christmas: {
    name: 'Christmas Season',
    startDate: '12-01',
    endDate: '01-06',
    multiplier: 2.0,
    specialItems: ['Christmas Tree', 'Santa Hat', 'Gift Box'],
    description: '🎄 Double rewards during Christmas! Special holiday items available.',
    color: 0xff0000
  },
  // Halloween (Oct 15 - Nov 5)
  halloween: {
    name: 'Halloween Spooktacular',
    startDate: '10-15',
    endDate: '11-05',
    multiplier: 1.5,
    specialItems: ['Pumpkin', 'Ghost Costume', 'Witch Hat'],
    description: '🎃 Spooky rewards and Halloween items!',
    color: 0xff6600
  },
  // Easter (March 20 - April 20)
  easter: {
    name: 'Easter Egg Hunt',
    startDate: '03-20',
    endDate: '04-20',
    multiplier: 1.3,
    specialItems: ['Easter Egg', 'Bunny Ears', 'Chocolate Bar'],
    description: '🥚 Easter egg hunt rewards and spring items!',
    color: 0xff69b4
  },
  // Valentine's Day (Feb 10 - Feb 20)
  valentines: {
    name: 'Valentine\'s Day',
    startDate: '02-10',
    endDate: '02-20',
    multiplier: 1.4,
    specialItems: ['Rose', 'Heart Box', 'Love Letter'],
    description: '💕 Love is in the air! Special Valentine rewards.',
    color: 0xff1493
  },
  // New Year (Dec 30 - Jan 5)
  newyear: {
    name: 'New Year Celebration',
    startDate: '12-30',
    endDate: '01-05',
    multiplier: 2.5,
    specialItems: ['Firework', 'Party Hat', 'Champagne'],
    description: '🎆 New Year special! Highest rewards of the year!',
    color: 0x00ffff
  },
  // Summer Event (June 15 - Aug 15)
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

// Helper function to check if a date is within a holiday range
function isHolidayActive(holidayKey) {
  const event = SEASONAL_EVENTS[holidayKey];
  if (!event) return false;
  
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  
  const [startMonth, startDay] = event.startDate.split('-').map(Number);
  const [endMonth, endDay] = event.endDate.split('-').map(Number);
  
  // Handle year wrap-around (like Christmas)
  if (startMonth > endMonth) {
    // Event spans across year end
    return (currentMonth >= startMonth && currentDay >= startDay) || 
           (currentMonth <= endMonth && currentDay <= endDay);
  } else {
    // Event within same year
    return (currentMonth > startMonth || (currentMonth === startMonth && currentDay >= startDay)) &&
           (currentMonth < endMonth || (currentMonth === endMonth && currentDay <= endDay));
  }
}

// Get current active holiday
function getCurrentHoliday() {
  for (const [key, event] of Object.entries(SEASONAL_EVENTS)) {
    if (isHolidayActive(key)) {
      return { key, ...event };
    }
  }
  return null;
}

// Get all active holidays (for overlapping periods)
function getActiveHolidays() {
  const active = [];
  for (const [key, event] of Object.entries(SEASONAL_EVENTS)) {
    if (isHolidayActive(key)) {
      active.push({ key, ...event });
    }
  }
  return active;
}

// Guild System Constants
const GUILD_TICKET_PRICE = 50000; // Expensive item for guild creation
const GUILD_CREATION_COST = 100000; // Additional coins needed to create guild
const MAX_GUILD_MEMBERS = 50;
const MAX_GUILD_NAME_LENGTH = 32;
const MAX_GUILD_DESCRIPTION_LENGTH = 200;
const GUILD_VAULT_TAX_RATE = 0.05; // 5% tax on guild vault deposits
const GUILD_WAR_COST = 25000; // Cost to declare war on another guild
const GUILD_BUSINESS_UPGRADE_COST = 50000; // Base cost for business upgrades

// Guild Business Types
const GUILD_BUSINESSES = {
  TAVERN: {
    name: 'Tavern',
    baseIncome: 1000,
    upgradeCost: 50000,
    description: 'Generates passive income from travelers',
    specializations: ['Entertainment', 'Luxury', 'Budget']
  },
  BLACKSMITH: {
    name: 'Blacksmith',
    baseIncome: 1500,
    upgradeCost: 75000,
    description: 'Crafts weapons and armor for profit',
    specializations: ['Weapons', 'Armor', 'Tools']
  },
  CARAVAN: {
    name: 'Caravan',
    baseIncome: 2000,
    upgradeCost: 100000,
    description: 'Trades goods between cities',
    specializations: ['Luxury', 'Bulk', 'Speed']
  },
  BANK: {
    name: 'Bank',
    baseIncome: 3000,
    upgradeCost: 150000,
    description: 'Handles loans and investments',
    specializations: ['Loans', 'Investments', 'Savings']
  },
  FARM: {
    name: 'Farm',
    baseIncome: 1200,
    upgradeCost: 60000,
    description: 'Produces food and resources',
    specializations: ['Grains', 'Vegetables', 'Livestock']
  },
  MINE: {
    name: 'Mine',
    baseIncome: 1800,
    upgradeCost: 90000,
    description: 'Extracts valuable minerals',
    specializations: ['Gold', 'Iron', 'Gems']
  },
  WORKSHOP: {
    name: 'Workshop',
    baseIncome: 1600,
    upgradeCost: 80000,
    description: 'Creates specialized items',
    specializations: ['Crafts', 'Repairs', 'Innovation']
  },
  LIBRARY: {
    name: 'Library',
    baseIncome: 1400,
    upgradeCost: 70000,
    description: 'Provides knowledge and research',
    specializations: ['Research', 'Education', 'Archives']
  }
};

// Guild event types
const GUILD_EVENT_TYPES = {
  TOURNAMENT: { name: 'Tournament', duration: 2 * 60 * 60 * 1000 }, // 2 hours
  RAID: { name: 'Raid', duration: 1 * 60 * 60 * 1000 }, // 1 hour
  CELEBRATION: { name: 'Celebration', duration: 3 * 60 * 60 * 1000 }, // 3 hours
  TRAINING: { name: 'Training', duration: 30 * 60 * 1000 } // 30 minutes
};

// Guild territory types
const GUILD_TERRITORY_TYPES = {
  MINING: { name: 'Mining', bonus: 'Increased mining rewards' },
  TRADING: { name: 'Trading', bonus: 'Better shop prices' },
  DEFENSIVE: { name: 'Defensive', bonus: 'Reduced war losses' },
  FARMING: { name: 'Farming', bonus: 'Faster crop growth' }
};

// Guild settings options
const GUILD_SETTINGS = {
  COLORS: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd'],
  PRIVACY_OPTIONS: ['public', 'private'],
  AUTO_COLLECT_OPTIONS: ['enabled', 'disabled'],
  LOGGING_OPTIONS: ['enabled', 'disabled']
};

// Guild achievement types
const GUILD_ACHIEVEMENTS = {
  MEMBER_MILESTONE: { name: 'Member Milestone', description: 'Reach member count milestones' },
  VAULT_MILESTONE: { name: 'Vault Milestone', description: 'Reach vault balance milestones' },
  WAR_VICTORY: { name: 'War Victory', description: 'Win guild wars' },
  ALLIANCE_FORMED: { name: 'Alliance Formed', description: 'Form alliances with other guilds' },
  EVENT_HOSTED: { name: 'Event Hosted', description: 'Host successful guild events' }
};

// Guild quest types
const GUILD_QUESTS = {
  DAILY: { name: 'Daily Quest', description: 'Complete daily guild objectives' },
  WEEKLY: { name: 'Weekly Quest', description: 'Complete weekly guild objectives' },
  SPECIAL: { name: 'Special Quest', description: 'Complete special guild events' }
};

// Deep freeze utility for nested objects
function deepFreeze(obj) {
  Object.getOwnPropertyNames(obj).forEach(function(name) {
    const prop = obj[name];
    if (typeof prop === 'object' && prop !== null && !Object.isFrozen(prop)) {
      deepFreeze(prop);
    }
  });
  return Object.freeze(obj);
}

deepFreeze(SEASONAL_EVENTS);
deepFreeze(GUILD_BUSINESSES);

// Export only frozen versions
module.exports = {
  SHOP_REMOVED_ITEMS,
  COMMAND_CATEGORIES,
  COOLDOWNS,
  SHOP_PRICES,
  SEASONAL_EVENTS,
  GUILD_TICKET_PRICE,
  GUILD_CREATION_COST,
  MAX_GUILD_MEMBERS,
  MAX_GUILD_NAME_LENGTH,
  MAX_GUILD_DESCRIPTION_LENGTH,
  GUILD_VAULT_TAX_RATE,
  GUILD_WAR_COST,
  GUILD_BUSINESS_UPGRADE_COST,
  GUILD_BUSINESSES,
  isHolidayActive,
  getCurrentHoliday,
  getActiveHolidays,
  GUILD_EVENT_TYPES,
  GUILD_TERRITORY_TYPES,
  GUILD_SETTINGS,
  GUILD_ACHIEVEMENTS,
  GUILD_QUESTS
}; 