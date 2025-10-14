/**
 * Atomic Farm Operations
 * Provides safe, atomic database operations for farm commands
 */

const { executeAtomic } = require('./atomicOperations');
const logger = require('../logger');

/**
 * Atomic farm planting operation
 */
async function atomicFarmPlant(userId, seedName, amount, plotIndices, farmData) {
  try {
    const result = await executeAtomic([
      async (session) => {
        const User = require('mongoose').model('User');
        
        // Validate user exists
        const user = await User.findById(userId).session(session);
        if (!user) {
          throw new Error(`User not found: ${userId}`);
        }
        
        // Validate farm inventory has enough seeds
        const currentSeeds = user.farmInventory?.[seedName]?.count || 0;
        if (currentSeeds < amount) {
          throw new Error(`Insufficient seeds: ${currentSeeds} < ${amount}`);
        }
        
        // Update farm data and inventory
        const update = {
          $set: { farm: farmData },
          $inc: { [`farmInventory.${seedName}.count`]: -amount }
        };
        
        // Clean up inventory if count becomes 0
        if (currentSeeds - amount <= 0) {
          update.$unset = { [`farmInventory.${seedName}`]: "" };
        }
        
        const result = await User.findByIdAndUpdate(userId, update, { session, new: true });
        
        if (!result) {
          throw new Error(`Failed to update farm for user: ${userId}`);
        }
        
        logger.info(`Farm planting completed for user ${userId}: ${amount} ${seedName} in plots ${plotIndices.join(', ')}`);
        return result;
      }
    ], null, { context: 'farm_plant' });
    
    return { success: true, user: result[0] };
  } catch (error) {
    logger.error(`Atomic farm plant failed for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Atomic farm harvest operation
 */
async function atomicFarmHarvest(userId, harvestedCrops, totalValue, farmData) {
  try {
    const result = await executeAtomic([
      async (session) => {
        const User = require('mongoose').model('User');
        
        // Validate user exists
        const user = await User.findById(userId).session(session);
        if (!user) {
          throw new Error(`User not found: ${userId}`);
        }
        
        // Update farm data and add coins
        const update = {
          $set: { farm: farmData },
          $inc: { coins: totalValue }
        };
        
        const result = await User.findByIdAndUpdate(userId, update, { session, new: true });
        
        if (!result) {
          throw new Error(`Failed to update farm for user: ${userId}`);
        }
        
        logger.info(`Farm harvest completed for user ${userId}: +${totalValue} coins, crops: ${Object.keys(harvestedCrops).join(', ')}`);
        return result;
      }
    ], null, { context: 'farm_harvest' });
    
    return { success: true, user: result[0] };
  } catch (error) {
    logger.error(`Atomic farm harvest failed for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Atomic farm sell operation
 */
async function atomicFarmSell(userId, totalValue, farmData) {
  try {
    const result = await executeAtomic([
      async (session) => {
        const User = require('mongoose').model('User');
        
        // Validate user exists
        const user = await User.findById(userId).session(session);
        if (!user) {
          throw new Error(`User not found: ${userId}`);
        }
        
        // Update farm data and add coins
        const update = {
          $set: { farm: farmData },
          $inc: { coins: totalValue }
        };
        
        const result = await User.findByIdAndUpdate(userId, update, { session, new: true });
        
        if (!result) {
          throw new Error(`Failed to update farm for user: ${userId}`);
        }
        
        logger.info(`Farm sell completed for user ${userId}: +${totalValue} coins`);
        return result;
      }
    ], null, { context: 'farm_sell' });
    
    return { success: true, user: result[0] };
  } catch (error) {
    logger.error(`Atomic farm sell failed for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Atomic farm upgrade operation
 */
async function atomicFarmUpgrade(userId, upgradeCost, farmData) {
  try {
    const result = await executeAtomic([
      async (session) => {
        const User = require('mongoose').model('User');
        
        // Validate user exists and has enough coins
        const user = await User.findById(userId).session(session);
        if (!user) {
          throw new Error(`User not found: ${userId}`);
        }
        
        if (user.coins < upgradeCost) {
          throw new Error(`Insufficient coins: ${user.coins} < ${upgradeCost}`);
        }
        
        // Update farm data and deduct coins
        const update = {
          $set: { farm: farmData },
          $inc: { coins: -upgradeCost }
        };
        
        const result = await User.findByIdAndUpdate(userId, update, { session, new: true });
        
        if (!result) {
          throw new Error(`Failed to update farm for user: ${userId}`);
        }
        
        logger.info(`Farm upgrade completed for user ${userId}: -${upgradeCost} coins`);
        return result;
      }
    ], null, { context: 'farm_upgrade' });
    
    return { success: true, user: result[0] };
  } catch (error) {
    logger.error(`Atomic farm upgrade failed for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Atomic farm expansion operation
 */
async function atomicFarmExpand(userId, expansionCost, farmData) {
  try {
    const result = await executeAtomic([
      async (session) => {
        const User = require('mongoose').model('User');
        
        // Validate user exists and has enough coins
        const user = await User.findById(userId).session(session);
        if (!user) {
          throw new Error(`User not found: ${userId}`);
        }
        
        if (user.coins < expansionCost) {
          throw new Error(`Insufficient coins: ${user.coins} < ${expansionCost}`);
        }
        
        // Update farm data and deduct coins
        const update = {
          $set: { farm: farmData },
          $inc: { coins: -expansionCost }
        };
        
        const result = await User.findByIdAndUpdate(userId, update, { session, new: true });
        
        if (!result) {
          throw new Error(`Failed to update farm for user: ${userId}`);
        }
        
        logger.info(`Farm expansion completed for user ${userId}: -${expansionCost} coins, new plots: ${farmData.plots.length}`);
        return result;
      }
    ], null, { context: 'farm_expansion' });
    
    return { success: true, user: result[0] };
  } catch (error) {
    logger.error(`Atomic farm expansion failed for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Atomic farm fertilizer operation
 */
async function atomicFarmFertilize(userId, farmData) {
  try {
    const result = await executeAtomic([
      async (session) => {
        const User = require('mongoose').model('User');
        
        // Validate user exists
        const user = await User.findById(userId).session(session);
        if (!user) {
          throw new Error(`User not found: ${userId}`);
        }
        
        // Update farm data and inventory
        const update = {
          $set: { 
            farm: farmData
          }
        };
        
        const result = await User.findByIdAndUpdate(userId, update, { session, new: true });
        
        if (!result) {
          throw new Error(`Failed to update farm for user: ${userId}`);
        }
        
        logger.info(`Farm fertilization completed for user ${userId}`);
        return result;
      }
    ], null, { context: 'farm_fertilize' });
    
    return { success: true, user: result[0] };
  } catch (error) {
    logger.error(`Atomic farm fertilize failed for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  atomicFarmPlant,
  atomicFarmHarvest,
  atomicFarmSell,
  atomicFarmUpgrade,
  atomicFarmExpand,
  atomicFarmFertilize
}; 