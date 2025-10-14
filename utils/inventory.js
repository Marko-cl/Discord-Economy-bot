// Inventory management utilities for Discord bot
const { User } = require('../database/db');
const logger = require('../logger');
const { validators } = require('./validation');
const { clearUserCache } = require('./cache');
const mongoose = require('mongoose');
const { atomicInventoryOperation } = require('./atomicOperations');

// Farm items that should go to farmInventory
const FARM_ITEMS = {
  // Seeds from SEED_TYPES
  'Sunblossom Seed': { rarity: 'Common', emoji: '🌻' },
  'Moonleaf Seed': { rarity: 'Uncommon', emoji: '🌱' },
  'Emberfruit Seed': { rarity: 'Rare', emoji: '🌺' },
  'Frostvine Seed': { rarity: 'Epic', emoji: '🪻' },
  'Stormroot Seed': { rarity: 'Legendary', emoji: '🏵️' },
  'Dreamshade Seed': { rarity: 'Mythic', emoji: '🌸' },
  'Starpetal Seed': { rarity: 'Divine', emoji: '💮' },
  'Ironbark Seed': { rarity: 'Ancient', emoji: '🪴' },
  'Shadowmoss Seed': { rarity: 'Cursed', emoji: '🥀' },
  'Cosmosprout Seed': { rarity: 'Galactic', emoji: '🪐' },
  'Box of Seeds': { rarity: 'Special', emoji: '🌱' },
  
  // Farm items
  '👨‍🌾 Worker': { rarity: 'Rare', emoji: '👨‍🌾' },
  '🌱 Fertilizer': { rarity: 'Uncommon', emoji: '🌿' }
};

/**
 * Check if item is a farm item
 */
function isFarmItem(itemName) {
  return Object.prototype.hasOwnProperty.call(FARM_ITEMS, itemName);
}

/**
 * Check if user has farm item
 */
function hasFarmItem(user, itemName) {
  if (!user || !user.farmInventory) return false;
  return user.farmInventory[itemName] && user.farmInventory[itemName].count > 0;
}

/**
 * Check if user has item (supports both old array format and new object format)
 */
function hasItem(user, itemName) {
  if (!user) return false;
  
  // Check farm inventory first
  if (isFarmItem(itemName)) {
    return hasFarmItem(user, itemName);
  }
  
  // Check regular inventory (supports both formats)
  if (user.inventory) {
    // New object format with counts
    if (typeof user.inventory === 'object' && !Array.isArray(user.inventory)) {
      // Handle simple number format (from atomicInventoryOperation)
      if (typeof user.inventory[itemName] === 'number') {
        return user.inventory[itemName] > 0;
      }
      // Handle object format with count property
      return user.inventory[itemName] && user.inventory[itemName].count > 0;
    }
    // Array format (current and old formats)
    if (Array.isArray(user.inventory)) {
      for (const item of user.inventory) {
        if (typeof item === 'string' && item === itemName) {
          return true;
        } else if (typeof item === 'object' && item !== null) {
          // Handle current format: array of objects with item data
          if (item[itemName] && item[itemName].count > 0) {
            return true;
          }
          // Handle old format: objects with name property
          if (item.name === itemName) {
            return true;
          }
        }
      }
    }
  }
  
  return false;
}

/**
 * Add item to user inventory (now supports stacking)
 */
async function addItem(userId, itemName, quantity = 1) {
  if (!validators.userId(userId) || !validators.stringLength(itemName, 1, 50)) {
    return false;
  }
  try {
    if (isFarmItem(itemName)) {
      // Add to farmInventory
      const user = await User.findById(userId);
      const farmInventory = { ...(user?.farmInventory || {}) };
      if (farmInventory[itemName]) {
        farmInventory[itemName].count += quantity;
      } else {
        farmInventory[itemName] = {
          count: quantity,
          rarity: FARM_ITEMS[itemName].rarity,
          emoji: FARM_ITEMS[itemName].emoji
        };
      }
      await User.findByIdAndUpdate(userId, { $set: { farmInventory } }, { upsert: true });
      clearUserCache(userId);
      return true;
    } else {
      // Use atomicInventoryOperation for regular items
      await atomicInventoryOperation(userId, itemName, quantity, 'add');
      clearUserCache(userId);
      return true;
    }
  } catch (error) {
    logger.error('Error adding item to inventory:', error);
    return false;
  }
}

/**
 * Remove item from user inventory (supports stacking)
 */
async function removeItem(userId, itemName, quantity = 1) {
  if (!validators.userId(userId) || !validators.stringLength(itemName, 1, 50)) {
    return false;
  }
  
  try {
    const { getUser } = require('./database');
    const user = await getUser(userId);
    if (!user) return false;
    
    // Check if this is a farm item
    if (isFarmItem(itemName)) {
      const farmInventory = { ...(user.farmInventory || {}) };
      
      if (!farmInventory[itemName] || farmInventory[itemName].count < quantity) {
        return false;
      }
      
      // Remove from farm inventory
      farmInventory[itemName].count -= quantity;
      
      // Remove entry if count reaches 0
      if (farmInventory[itemName].count <= 0) {
        delete farmInventory[itemName];
      }
      await User.findByIdAndUpdate(userId, { $set: { farmInventory } });
      clearUserCache(userId);
      return true;
    } else {
      // Use atomicInventoryOperation for regular items
      await atomicInventoryOperation(userId, itemName, quantity, 'remove');
      clearUserCache(userId);
      return true;
    }
  } catch (error) {
    logger.error('Error removing item from inventory:', error);
    return false;
  }
}

/**
 * Count items in user inventory (supports both formats)
 */
function countItem(user, itemName) {
  if (!user) return 0;
  
  // Check farm inventory first
  if (isFarmItem(itemName)) {
    return user.farmInventory?.[itemName]?.count || 0;
  }
  
  // Check regular inventory
  if (user.inventory) {
    // New object format with counts
    if (typeof user.inventory === 'object' && !Array.isArray(user.inventory)) {
      // Handle simple number format (from atomicInventoryOperation)
      if (typeof user.inventory[itemName] === 'number') {
        return user.inventory[itemName];
      }
      // Handle object format with count property
      return user.inventory[itemName]?.count || 0;
    }
    // Array format (current and old formats)
    if (Array.isArray(user.inventory)) {
      let count = 0;
      for (const item of user.inventory) {
        if (typeof item === 'string' && item === itemName) {
          count++;
        } else if (typeof item === 'object' && item !== null) {
          // Handle current format: array of objects with item data
          if (item[itemName] && item[itemName].count) {
            count += item[itemName].count;
          }
          // Handle old format: objects with name property
          if (item.name === itemName) {
            count++;
          }
        }
      }
      return count;
    }
  }
  
  return 0;
}

/**
 * Get all items in user inventory (supports both formats)
 */
function getAllItems(user) {
  if (!user) return {};
  
  const items = {};
  
  // Add farm items
  if (user.farmInventory) {
    for (const [itemName, itemData] of Object.entries(user.farmInventory)) {
      if (itemData.count > 0) {
        items[itemName] = {
          count: itemData.count,
          rarity: itemData.rarity,
          emoji: itemData.emoji,
          type: 'farm'
        };
      }
    }
  }
  
  // Add regular inventory items
  if (user.inventory) {
    // New object format
    if (typeof user.inventory === 'object' && !Array.isArray(user.inventory)) {
      for (const [itemName, itemData] of Object.entries(user.inventory)) {
        // Handle simple number format (from atomicInventoryOperation)
        if (typeof itemData === 'number' && itemData > 0) {
          items[itemName] = {
            count: itemData,
            type: 'regular'
          };
        }
        // Handle object format with count property
        else if (typeof itemData === 'object' && itemData.count > 0) {
          items[itemName] = {
            count: itemData.count,
            added: itemData.added,
            type: 'regular'
          };
        }
      }
    }
    // Old array format (for backward compatibility)
    else if (Array.isArray(user.inventory)) {
      for (const item of user.inventory) {
        if (typeof item === 'string') {
          // Handle string items (old format)
          items[item] = {
            count: (items[item]?.count || 0) + 1,
            type: 'regular'
          };
        } else if (typeof item === 'object' && item !== null) {
          // Handle current format: array of objects with item data
          for (const [itemName, itemData] of Object.entries(item)) {
            if (itemData && typeof itemData === 'object' && itemData.count > 0) {
              items[itemName] = {
                count: itemData.count,
                added: itemData.added,
                type: 'regular'
              };
            }
          }
          // Handle old format: objects with name property
          if (item.name) {
            items[item.name] = {
              count: (items[item.name]?.count || 0) + 1,
              type: 'regular'
            };
          }
        }
      }
    }
  }
  
  return items;
}

/**
 * Add item to inventory (async version)
 */
async function addItemToInventory(userId, itemName, quantity = 1) {
  return addItem(userId, itemName, quantity);
}

/**
 * Remove item from inventory (async version)
 */
async function removeItemFromInventory(userId, itemName, quantity = 1) {
  return removeItem(userId, itemName, quantity);
}

/**
 * Migrate user inventory from old array format to new object format
 */
async function migrateUserInventory(userId) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.inventory) return false;
    
    // Skip if already in new format
    if (typeof user.inventory === 'object' && !Array.isArray(user.inventory)) {
      return true;
    }
    
    const newInventory = {};
    
    // Convert array format to object format
    if (Array.isArray(user.inventory)) {
      for (const item of user.inventory) {
        if (typeof item === 'string') {
          // Old string format
          newInventory[item] = {
            count: (newInventory[item]?.count || 0) + 1,
            added: Date.now()
          };
        } else if (typeof item === 'object' && item !== null) {
          // Handle current format: array of objects with item data
          for (const [itemName, itemData] of Object.entries(item)) {
            if (itemData && typeof itemData === 'object' && itemData.count) {
              newInventory[itemName] = {
                count: itemData.count,
                added: itemData.added || Date.now()
              };
            }
          }
          // Handle old format: objects with name property
          if (item.name) {
            newInventory[item.name] = {
              count: (newInventory[item.name]?.count || 0) + 1,
              added: Date.now()
            };
          }
        }
      }
    }
    
    // Update user with new format
    await User.findByIdAndUpdate(userId, { $set: { inventory: newInventory } });
    clearUserCache(userId);
    
    logger.info(`Migrated inventory for user ${userId} from array to object format`);
    return true;
  } catch (error) {
    logger.error(`Error migrating inventory for user ${userId}:`, error);
    return false;
  }
}

/**
 * Validate and fix inventory format
 */
async function validateInventoryFormat(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) return false;
    
    // Check if inventory needs migration
    if (user.inventory && Array.isArray(user.inventory)) {
      return await migrateUserInventory(userId);
    }
    
    return true;
  } catch (error) {
    logger.error(`Error validating inventory format for user ${userId}:`, error);
    return false;
  }
}

/**
 * Ensures the user's inventory is always an object.
 * If it's an array, converts it to an object and updates the DB.
 * Returns the fixed user document.
 */
async function ensureInventoryObject(user) {
  if (!user) return user;
  if (Array.isArray(user.inventory)) {
    // Convert array to object (flatten if possible)
    let newInventory = {};
    for (const entry of user.inventory) {
      if (entry && typeof entry === 'object') {
        Object.assign(newInventory, entry);
      }
    }
    user.inventory = newInventory;
    // Update in DB
    await mongoose.model('User').findByIdAndUpdate(user._id, { $set: { inventory: newInventory } });
  }
  return user;
}

module.exports = {
  hasItem,
  hasFarmItem,
  addItem,
  removeItem,
  countItem,
  getAllItems,
  addItemToInventory,
  removeItemFromInventory,
  isFarmItem,
  FARM_ITEMS,
  migrateUserInventory,
  validateInventoryFormat,
  ensureInventoryObject
}; 