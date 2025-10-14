const { getUser } = require('../../utils/utils');
const { FARM_CONSTANTS } = require('./constants');
const { executeAtomic } = require('../../utils/atomicOperations');
const logger = require('../../logger');
const { validators } = require('../../utils/validation');

// Helper to get or initialize farm with default plots
async function getOrInitFarm(userId) {
  // Input validation
  if (!validators.userId(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }
  
  let user;
  try {
    user = await getUser(userId);
    if (!user) {
      // Use atomic operation to create user
      const result = await executeAtomic([
        async (session) => {
          const User = require('mongoose').model('User');
          return await User.create([{ _id: userId }], { session });
        }
      ], null, { context: 'farm_user_creation' });
      
      if (!result[0]) {
        throw new Error('Failed to create user');
      }
      user = result[0];
    }
    
    if (!user.farm || typeof user.farm !== 'object') user.farm = {};
    if (!user.farm.plots || !Array.isArray(user.farm.plots)) {
      user.farm.plots = Array(FARM_CONSTANTS.DEFAULT_PLOTS).fill(null);
    }
    // Ensure always at least default plots
    while (user.farm.plots.length < FARM_CONSTANTS.DEFAULT_PLOTS) user.farm.plots.push(null);
    
    // Ensure farmInventory field exists
    if (!user.farmInventory || typeof user.farmInventory !== 'object') {
      user.farmInventory = {};
      // Use atomic operation to initialize farmInventory
      await executeAtomic([
        async (session) => {
          const User = require('mongoose').model('User');
          return await User.findByIdAndUpdate(userId, { $set: { farmInventory: {} } }, { session, new: true });
        }
      ], null, { context: 'farm_inventory_init' });
    }
  } catch (err) {
    logger.error(`Database error in getOrInitFarm for user ${userId}:`, err);
    throw new Error('Database error: could not load or initialize farm.');
  }
  return user;
}

// Initialize farm fields if missing
async function initializeFarmFields(userId, farm) {
  // Input validation
  if (!validators.userId(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }
  
  let needsInit = false;
  if (!farm.plots || !Array.isArray(farm.plots)) {
    farm.plots = Array(FARM_CONSTANTS.DEFAULT_PLOTS).fill(null);
    needsInit = true;
  }
  if (!farm.harvestedCrops || typeof farm.harvestedCrops !== 'object') {
    farm.harvestedCrops = {};
    needsInit = true;
  }
  if (!farm.auto || typeof farm.auto !== 'object') {
    farm.auto = {};
    needsInit = true;
  }
  if (!farm.stats || typeof farm.stats !== 'object') {
    farm.stats = {};
    needsInit = true;
  }
  if (!farm.upgrades || typeof farm.upgrades !== 'object') {
    farm.upgrades = {};
    needsInit = true;
  }
  
  if (needsInit) {
    try {
      // Use atomic operation to initialize farm fields
      const result = await executeAtomic([
        async (session) => {
          const User = require('mongoose').model('User');
          return await User.findByIdAndUpdate(userId, { $set: { farm } }, { session, new: true });
        }
      ], null, { context: 'farm_fields_init' });
      
      if (!result[0]) {
        throw new Error('Failed to initialize farm fields');
      }
      
      logger.info(`Farm fields initialized for user ${userId}`);
    } catch (err) {
      logger.error(`Database error in initializeFarmFields for user ${userId}:`, err);
      throw new Error('Database error: could not initialize farm fields.');
    }
  }
  return farm;
}

// Update user farm data (legacy function - should use atomic operations instead)
async function updateUserFarm(userId, farmData) {
  // Input validation
  if (!validators.userId(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }
  
  try {
    // Use atomic operation for farm update
    const result = await executeAtomic([
      async (session) => {
        const User = require('mongoose').model('User');
        return await User.findByIdAndUpdate(userId, { $set: { farm: farmData } }, { session, new: true });
      }
    ], null, { context: 'farm_update' });
    
    if (!result[0]) {
      throw new Error('Failed to update farm data');
    }
    
    logger.info(`Farm data updated for user ${userId}`);
    return true;
  } catch (err) {
    logger.error(`Database error in updateUserFarm for user ${userId}:`, err);
    throw new Error('Database error: could not update farm data.');
  }
}

module.exports = {
  getOrInitFarm,
  initializeFarmFields,
  updateUserFarm
}; 