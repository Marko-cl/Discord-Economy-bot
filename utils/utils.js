// Main utilities module - imports and exports all utility functions
const logger = require('../logger');
const { constants, COSMETICS } = require('./constants');
const { userCache, userCacheTimestamps, clearUserCache } = require('./cache');
const { validators, sanitizeInput } = require('./validation');
const { 
  handleCommandError, 
  safeDatabaseOperation, 
  safeDiscordOperation, 
  safeValidation, 
  withRetry, 
  safeAsync, 
  logError 
} = require('./errorHandling');
const { getUser, safeUpdateUser, batchUpdateUsers } = require('./database');
const { commandHandler } = require('./commandHandler');
const { 
  reply, 
  formatNumber, 
  formatKelocoins, 
  parseDuration, 
  formatDuration, 
  formatProgressBar,
  safeGetNumber,
  safeGetArray,
  safeGetBoolean,
  safeGetString,
  paginate,
  random
} = require('./formatting');
const { 
  buildEmbed, 
  getUserEmbedColor, 
  leaderboardEmbed, 
  profileEmbed 
} = require('./embeds');
const { progressQuests } = require('./quests');
const {
  isOwner,
  isUserBlacklisted,
  getTotalCoinMultiplier,
  getXpMultiplier,
  getSeasonalSpecialItems,
  getUnlockProgress,
  getSeasonalInfo,
  getLuckMultiplier,
  getUserPartyMultiplierInfo,
  processPetCollection,
  calculatePetLevelXp,
  calculatePetXpGain
} = require('./gameLogic');
const {
  applySeasonalMultiplier,
  getCurrentMultiplier,
  getCurrentSeason,
  getCurrentSpecialEvent,
  formatSeasonalReward,
  addSeasonalBonusToEmbed
} = require('./seasonalMultiplier');
const inventory = require('./inventory');

/**
 * Normalize item names for consistent matching
 * Strips emojis, extra spaces, and normalizes casing
 * @param {string} itemName - The item name to normalize
 * @returns {string} - Normalized item name
 */
function normalizeItemName(itemName) {
  if (!itemName || typeof itemName !== 'string') return '';
  
  return itemName
    // Remove emojis and special characters (keep letters, numbers, spaces)
    .replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{FE00}-\u{FE0F}]|[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    // Remove other special characters but keep letters, numbers, and spaces
    .replace(/[^\w\s]/g, '')
    // Normalize whitespace (multiple spaces to single space)
    .replace(/\s+/g, ' ')
    // Trim leading/trailing spaces
    .trim()
    // Convert to lowercase for case-insensitive matching
    .toLowerCase();
}

/**
 * Find item by normalized name with flexible matching
 * @param {Array} items - Array of items to search through
 * @param {string} searchName - The name to search for
 * @param {string} nameField - The field name containing the item name (default: 'name')
 * @returns {Object|null} - The found item or null
 */
function findItemByNormalizedName(items, searchName, nameField = 'name') {
  if (!items || !Array.isArray(items) || !searchName) return null;
  
  const normalizedSearch = normalizeItemName(searchName);
  if (!normalizedSearch) return null;
  
  // First try exact normalized match
  let item = items.find(item => normalizeItemName(item[nameField]) === normalizedSearch);
  if (item) return item;
  
  // Then try partial match (search term is contained in item name)
  item = items.find(item => {
    const normalizedItemName = normalizeItemName(item[nameField]);
    return normalizedItemName.includes(normalizedSearch) || normalizedSearch.includes(normalizedItemName);
  });
  if (item) return item;
  
  // Finally try fuzzy matching (words in common)
  const searchWords = normalizedSearch.split(' ').filter(word => word.length > 2);
  if (searchWords.length > 0) {
    item = items.find(item => {
      const normalizedItemName = normalizeItemName(item[nameField]);
      const itemWords = normalizedItemName.split(' ').filter(word => word.length > 2);
      return searchWords.some(searchWord => 
        itemWords.some(itemWord => itemWord.includes(searchWord) || searchWord.includes(itemWord))
      );
    });
  }
  
  return item || null;
}

// Export everything for backward compatibility
module.exports = {
  // Constants & Configuration
  constants,
  COSMETICS,
  
  // Caching
  userCache,
  userCacheTimestamps,
  clearUserCache,
  
  // Validation & Sanitization
  validators,
  sanitizeInput,
  
  // Error Handling
  withRetry,
  safeAsync,
  logError,
  handleCommandError,
  safeDatabaseOperation,
  safeDiscordOperation,
  safeValidation,
  
  // Database Operations
  getUser,
  safeUpdateUser,
  batchUpdateUsers,
  
  // Command Handler
  commandHandler,
  
  // Utility Functions
  reply,
  formatNumber,
  formatKelocoins,
  parseDuration,
  formatDuration,
  random,
  
  // Inventory Management
  inventory,
  
  // Embed Builders
  buildEmbed,
  getUserEmbedColor,
  
  // Quest System
  progressQuests,
  
  // Helper Functions
  isOwner,
  isUserBlacklisted,
  getTotalCoinMultiplier,
  getXpMultiplier,
  getSeasonalSpecialItems,
  getUnlockProgress,
  formatProgressBar,
  
  // Safe Getters
  safeGetNumber,
  safeGetArray,
  safeGetBoolean,
  safeGetString,
  
  // Legacy exports for compatibility
  hasItemFlexible: inventory.hasItem,
  addItemFlexible: inventory.addItem,
  removeItemFlexible: inventory.removeItem,
  countItem: inventory.countItem,
  hasItem: inventory.hasItem,
  hasAllItems: (user, itemNames) => itemNames.every(name => inventory.hasItem(user, name)),
  
  // Additional legacy exports
  updateUser: safeUpdateUser,
  updateUserField: safeUpdateUser,
  safeUpdateField: safeUpdateUser,
  getOrCreateUser: getUser,
  formatNumberShort: (num) => formatNumber(num, { maximumFractionDigits: 1 }),
  setCooldown: () => {}, // Legacy - not used
  getCooldown: () => 0, // Legacy - not used
  isAdmin: () => false, // Legacy - not used
  tryCatchAsync: safeAsync,
  formatTime: formatDuration,
  clamp: (num, min, max) => Math.min(Math.max(num, min), max),
  isPositiveInt: validators.positiveInteger,
  asyncMap: async (array, fn) => Promise.all(array.map(fn)),
  validateString: (value, options = {}) => {
    const { min = 0, max = Infinity } = options;
    return validators.stringLength(value, min, max);
  },
  validateNumber: (value, options = {}) => {
    const { min = 0, max = Infinity } = options;
    const num = parseFloat(value);
    return !isNaN(num) && num >= min && num <= max;
  },
  sanitizeString: sanitizeInput,
  isSafeDiscordId: validators.userId,
  isSafeGuildId: validators.guildId,
  isSafeChannelId: validators.channelId,
  isSafeRoleId: validators.roleId,
  isSafeUrl: validators.url,
  sanitizeObject: (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeInput(value, 'string');
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  },
  deepClone: (obj) => JSON.parse(JSON.stringify(obj)),
  getCurrentMineLevelXp: (totalXp, level) => {
    // New mining system: 1000 XP per level
    const xpForPreviousLevels = (level - 1) * 1000;
    const currentLevelXp = totalXp - xpForPreviousLevels;
    // Ensure we don't return negative values
    return Math.max(0, currentLevelXp);
  },
  checkCooldown: () => false, // Legacy - not used
  clearCooldown: () => {}, // Legacy - not used
  getDisplayName: (user) => user?.username || 'Unknown User',
  paginate,
  leaderboardEmbed,
  profileEmbed,
  hasPermission: () => true, // Legacy - not used
  checkQuestCompletion: () => false, // Legacy - not used
  generateProfileImage: () => null, // Legacy - not used
  getUserPartyMultiplier: () => 1, // Legacy - not used
  getUserPartyMultiplierInfo,
  calculatePetLevelXp,
  
  // Missing critical functions - now implemented
  getSeasonalInfo,
  getLuckMultiplier,
  processPetCollection,
  calculatePetXpGain,
  
  // Seasonal Multiplier System
  applySeasonalMultiplier,
  getCurrentMultiplier,
  getCurrentSeason,
  getCurrentSpecialEvent,
  formatSeasonalReward,
  addSeasonalBonusToEmbed,
  sendEphemeral: async (interaction, content) => {
    try {
      if (interaction.replied || interaction.deferred) {
        await reply(interaction, { content, flags: 1 << 6 });
      } else {
        await reply(interaction, { content, flags: 1 << 6 });
      }
    } catch (error) {
      logger.error('Error sending ephemeral message:', error);
    }
  },
  addItemToInventory: inventory.addItemToInventory,
  removeItemFromInventory: inventory.removeItemFromInventory,
  normalizeItemName,
  findItemByNormalizedName,
};
