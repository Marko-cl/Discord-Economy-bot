const { User } = require('../../database/db');
const { SEED_TYPES, FARM_CONSTANTS } = require('./constants');
const logger = require('../../logger');
const mongoose = require('mongoose');
const { 
  isPlotReady, 
  getEmptyPlots, 
  calculateGrowTime,
  removeSeedFromFarmInventory,
} = require('./logic');
const { GlobalState } = require('../../database/globalState');
const { executeAtomic } = require('../../utils/atomicOperations');
const { validators } = require('../../utils/validation');
const { checkRateLimit } = require('../../utils/rateLimiting');
const { clearUserCache } = require('../../utils/cache');

// Store client reference when available
let discordClient = null;

// Function to set the client reference
function setClient(client) {
  discordClient = client;
}

// Check if database is connected
function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

// Get or create global state for auto-farming timing
async function getAutoFarmState() {
  try {
    let state = await GlobalState.findOne({ key: 'autoFarmState' });
    if (!state) {
      state = new GlobalState({
        key: 'autoFarmState',
        value: {
          lastExecution: null,
          nextExecution: Date.now() + (10 * 60 * 1000) // 10 minutes from now
        }
      });
      await state.save();
    }
    return state.value;
  } catch (error) {
    logger.error('Error getting auto-farm state:', error);
    return {
      lastExecution: null,
      nextExecution: Date.now() + (10 * 60 * 1000)
    };
  }
}

// Update auto-farm state after execution using atomic operations
async function updateAutoFarmState() {
  try {
    const now = Date.now();
    const nextExecution = now + (10 * 60 * 1000); // 10 minutes from now
    
    const result = await executeAtomic([
      async (session) => {
        return await GlobalState.findOneAndUpdate(
          { key: 'autoFarmState' },
          {
            value: {
              lastExecution: now,
              nextExecution: nextExecution
            }
          },
          { upsert: true, session, new: true }
        );
      }
    ], null, { context: 'auto_farm_state_update' });
    
    if (result[0]) {
      logger.info(`Auto-farm state updated. Next execution scheduled for: ${new Date(nextExecution).toISOString()}`);
    } else {
      logger.error('Failed to update auto-farm state');
    }
  } catch (error) {
    logger.error('Error updating auto-farm state:', error);
  }
}

// Send DM notification for auto-farming actions
async function sendAutoFarmNotification(userId, didCollect, didPlant, plantedSummary) {
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in auto-farm notification: ${userId}`);
    return;
  }
  
  if (!discordClient) {
    logger.warn('Discord client not available for DM notifications');
    return;
  }

  try {
    let discordUser;
    try {
      discordUser = await discordClient.users.fetch(userId);
    } catch {
      logger.debug(`Could not fetch user ${userId} for DM notification`);
      return;
    }
    
    let msg = '';
    if (didCollect) {
      msg += '🌾 **Auto-Collection Complete!**\nYour farm auto-collected ready crops!\n\n';
    }
    if (didPlant && plantedSummary.length > 0) {
      msg += '🌱 **Auto-Planting Complete!**\n';
      msg += `Your worker planted: **${plantedSummary.join(', ')}**\n\n`;
    }
    
    // Only send message if there's actual content
    if (msg.trim()) {
      await discordUser.send(msg);
      logger.info(`Sent DM to user ${userId}: ${msg.trim()}`);
    }
  } catch {
    logger.error('Error sending DM notification');
  }
}

// Process auto-farming for a single user with improved error handling
async function processUserAutoFarming(user) {
  try {
    // Validate user data
    if (!user || !user._id) {
      logger.warn('Invalid user data in auto-farming');
      return { didCollect: false, didPlant: false, plantedSummary: [] };
    }
    
    // Validate farm data
    if (!user.farm || typeof user.farm !== 'object') {
      logger.debug(`User ${user._id} has no farm data`);
      return { didCollect: false, didPlant: false, plantedSummary: [] };
    }
    
    const farm = user.farm;
    const auto = farm.auto || {};
    
    // Validate plots array
    if (!Array.isArray(farm.plots)) {
      logger.warn(`User ${user._id} has invalid plots array`);
      farm.plots = Array(FARM_CONSTANTS.DEFAULT_PLOTS).fill(null);
    }
    
    // Check for worker (farmInventory only)
    const hasWorker = (user.farmInventory && user.farmInventory['👨‍🌾 Worker'] && user.farmInventory['👨‍🌾 Worker'].count > 0);
    if (!hasWorker) {
      logger.debug(`User ${user._id} has no workers for auto-farming`);
      return { didCollect: false, didPlant: false, plantedSummary: [] };
    }
    
    logger.debug(`User ${user._id} has ${user.farmInventory['👨‍🌾 Worker'].count} workers, auto-plant: ${auto.autoplant}, auto-collect: ${auto.autocollect}`);
    
    // Check rate limiting
    const rateLimitKey = `auto_farm_${user._id}`;
    const isRateLimited = await checkRateLimit(user._id, rateLimitKey, 1, 60000); // 1 per minute
    if (isRateLimited) {
      logger.debug(`Rate limit hit for user ${user._id} in auto-farming`);
      return { didCollect: false, didPlant: false, plantedSummary: [] };
    }
    
    let didCollect = false, didPlant = false, plantedSummary = [];
    
    // Defensive: ensure farm fields are valid
    farm.plots = Array.isArray(farm.plots) ? farm.plots : [null, null, null];
    farm.harvestedCrops = farm.harvestedCrops && typeof farm.harvestedCrops === 'object' ? farm.harvestedCrops : {};
    farm.auto = farm.auto && typeof farm.auto === 'object' ? farm.auto : {};
    farm.stats = farm.stats && typeof farm.stats === 'object' ? farm.stats : {};
    farm.upgrades = farm.upgrades && typeof farm.upgrades === 'object' ? farm.upgrades : {};
    
    // Initialize harvested crops if missing
    if (!farm.harvestedCrops || typeof farm.harvestedCrops !== 'object') {
      farm.harvestedCrops = {};
    }
    
    // Initialize farm inventory if missing
    if (!user.farmInventory || typeof user.farmInventory !== 'object') {
      user.farmInventory = {};
    }
    
    // Initialize harvested crops quality tracking if missing
    if (!farm.harvestedCrops.quality) farm.harvestedCrops.quality = {};
    if (!farm.harvestedCrops.variant) farm.harvestedCrops.variant = {};
    
    // Auto-collect
    if (auto.autocollect) {
      logger.debug(`User ${user._id} checking ${farm.plots.length} plots for auto-collection`);
      for (let i = 0; i < farm.plots.length; i++) {
        const plot = farm.plots[i];
        if (plot && !plot.ready) {
          const readyAt = plot.plantedAt + plot.growTime;
          if (Date.now() >= readyAt) plot.ready = true;
        }
        if (plot && isPlotReady(plot)) {
          farm.harvestedCrops[plot.seedName] = (farm.harvestedCrops[plot.seedName] || 0) + 1;
          if (!farm.harvestedCrops.quality) farm.harvestedCrops.quality = {};
          if (!farm.harvestedCrops.variant) farm.harvestedCrops.variant = {};
          farm.harvestedCrops.quality[plot.seedName] = plot.quality || 'COMMON';
          farm.harvestedCrops.variant[plot.seedName] = plot.variant || null;
          
          // Remove plot-specific upgrades when crop is harvested
          if (farm.upgrades) {
            if (farm.upgrades.growth && farm.upgrades.growth[i]) {
              delete farm.upgrades.growth[i];
            }
            if (farm.upgrades.value && farm.upgrades.value[i]) {
              delete farm.upgrades.value[i];
            }
            if (farm.upgrades.quality && farm.upgrades.quality[i]) {
              delete farm.upgrades.quality[i];
            }
          }
          
          farm.plots[i] = null;
          didCollect = true;
        }
      }
    }
    
    // Auto-plant (rarest first)
    if (auto.autoplant) {
      const emptyPlots = getEmptyPlots(farm.plots);
      logger.debug(`User ${user._id} has ${emptyPlots.length} empty plots for auto-planting`);
      if (emptyPlots.length > 0) {
        // Get seed counts from farmInventory only, excluding Box of Seeds
        const seedCounts = {};
        for (const s of SEED_TYPES) {
          // Skip Box of Seeds for autofarm
          if (s.name === 'Box of Seeds') continue;
          seedCounts[s.name] = user.farmInventory && user.farmInventory[s.name] ? user.farmInventory[s.name].count : 0;
        }
        const sortedSeeds = SEED_TYPES.slice()
          .filter(s => s.name !== 'Box of Seeds') // Exclude Box of Seeds
          .sort((a, b) => a.drop - b.drop);
        
        logger.debug(`User ${user._id} seed counts: ${Object.entries(seedCounts).filter(([, count]) => count > 0).map(([name, count]) => `${name}:${count}`).join(', ')}`);
        let plotIdx = 0;
        for (const seed of sortedSeeds) {
          let toPlant = Math.min(seedCounts[seed.name], emptyPlots.length - plotIdx);
          for (let j = 0; j < toPlant; j++) {
            // Remove from farm inventory only
            let removed = false;
            if (user.farmInventory && user.farmInventory[seed.name] && user.farmInventory[seed.name].count > 0) {
              logger.debug(`Removing seed ${seed.name} from farm inventory for user ${user._id} (count before: ${user.farmInventory[seed.name].count})`);
              removed = removeSeedFromFarmInventory(user.farmInventory, seed.name);
              logger.debug(`Seed removal result: ${removed}, count after: ${user.farmInventory[seed.name]?.count || 0}`);
            } else {
              logger.debug(`No seeds ${seed.name} available for user ${user._id}`);
            }
            if (!removed) continue;
            const idx = emptyPlots[plotIdx++];
            const { determineCropQuality } = require('./quality');
            const { quality, variant } = determineCropQuality(seed, farm, idx, false);
            const growTime = await calculateGrowTime(seed, farm, idx, quality, variant);
            farm.plots[idx] = {
              seedKey: seed.key,
              seedName: seed.name,
              plantedAt: Date.now(),
              growTime: growTime,
              ready: false,
              quality: quality,
              variant: variant,
              fertilized: false
            };
            plantedSummary.push(seed.name);
            didPlant = true;
            if (plotIdx >= emptyPlots.length) break;
          }
          if (plotIdx >= emptyPlots.length) break;
        }
      }
    }
    
    // Update database with atomic operations if there were changes
    if (didCollect || didPlant) {
      try {
        logger.debug(`Updating database for user ${user._id} - farmInventory keys: ${Object.keys(user.farmInventory || {}).join(', ')}`);
        
        const result = await executeAtomic([
          async (session) => {
            const User = require('mongoose').model('User');
            
            // Validate user exists
            const currentUser = await User.findById(user._id).session(session);
            if (!currentUser) {
              throw new Error(`User not found: ${user._id}`);
            }
            
            // Prepare update data
            const updateData = { 
              $set: { farm: farm }
            };
            
            // Update farmInventory if it exists and has changes
            if (user.farmInventory && Object.keys(user.farmInventory).length > 0) {
              logger.debug(`Setting farmInventory for user ${user._id}: ${JSON.stringify(user.farmInventory)}`);
              updateData.$set.farmInventory = user.farmInventory;
            }
            
            // Only update inventory if it exists and has changes
            if (user.inventory && Array.isArray(user.inventory) && user.inventory.length > 0) {
              updateData.$set.inventory = user.inventory;
            }
            
            const updatedUser = await User.findByIdAndUpdate(user._id, updateData, { 
              session, 
              new: true, 
              maxTimeMS: 15000,
              runValidators: true
            });
            
            if (!updatedUser) {
              throw new Error(`Failed to update user ${user._id}`);
            }
            
            logger.debug(`Database update successful for user ${user._id}`);
            return updatedUser;
          }
        ], null, { context: 'auto_farm_user_update' });
        
        if (!result[0]) {
          logger.error(`Failed to update user ${user._id} in auto-farming`);
          return { didCollect: false, didPlant: false, plantedSummary: [] };
        }
        
        logger.info(`Auto-farming updated for user ${user._id}: collected=${didCollect}, planted=${didPlant}`);
        
        // Clear user cache to ensure fresh data is loaded
        clearUserCache(user._id);
        logger.debug(`Cleared cache for user ${user._id}`);
      } catch (err) {
        logger.error(`Error updating user ${user._id} farm:`, err);
        return { didCollect: false, didPlant: false, plantedSummary: [] };
      }
    }
    
    return { didCollect, didPlant, plantedSummary };
  } catch {
    logger.warn('Invalid user data in auto-farming');
    return { didCollect: false, didPlant: false, plantedSummary: [] };
  }
}

// Main auto-farming tick function with improved error handling and performance
async function autoFarmTick() {
  try {
    // Check database connection first
    if (!isDatabaseConnected()) {
      logger.warn('Database not connected, skipping auto farm tick');
      return;
    }

    logger.info('Starting auto farm tick...');
    
    // Find all users with farms, with timeout and limit
    const users = await User.find({ 
      farm: { $exists: true },
      'farm.auto.autoplant': { $in: [true, false] },
      'farm.auto.autocollect': { $in: [true, false] }
    }).maxTimeMS(30000).limit(1000); // Limit to prevent overwhelming
    
    logger.info(`Found ${users.length} users with farms`);
    
    let processedCount = 0;
    let collectedCount = 0;
    let plantedCount = 0;
    let errorCount = 0;
    
    // Process users in batches for better performance
    const batchSize = 50;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      
      // Process batch concurrently with error handling
      const batchPromises = batch.map(async (user) => {
        try {
          const result = await processUserAutoFarming(user);
          if (result.didCollect) collectedCount++;
          if (result.didPlant) plantedCount++;
          
          // Send DM notification if needed
          if ((result.didCollect || result.didPlant) && user.farm?.auto?.notifications) {
            await sendAutoFarmNotification(user._id, result.didCollect, result.didPlant, result.plantedSummary);
          }
          
          return result;
        } catch (error) {
          logger.error(`Error processing user ${user._id} in auto-farming:`, error);
          errorCount++;
          return { didCollect: false, didPlant: false, plantedSummary: [] };
        }
      });
      
      // Wait for batch to complete with timeout
      try {
        await Promise.allSettled(batchPromises);
        processedCount += batch.length;
      } catch {
        logger.error('Error processing auto-farming batch');
        errorCount += batch.length;
      }
    }
    
    // Update the auto-farm state after successful execution
    await updateAutoFarmState();
    
    logger.info(`Auto farm tick completed: ${processedCount} users processed, ${collectedCount} crops collected, ${plantedCount} seeds planted, ${errorCount} errors`);
  } catch {
    logger.error('Error in autoFarmTick');
  }
}

// Initialize auto-farming with persistent timing
async function initializeAutoFarming() {
  try {
    const state = await getAutoFarmState();
    const now = Date.now();
    
    // If next execution time has passed, run immediately
    if (state.nextExecution && now >= state.nextExecution) {
      logger.info('Auto-farm execution is overdue, running immediately');
      await autoFarmTick();
    } else {
      // Calculate time until next execution
      const timeUntilNext = state.nextExecution ? Math.max(0, state.nextExecution - now) : 10 * 60 * 1000;
      const minutesUntilNext = Math.ceil(timeUntilNext / (60 * 1000));
      
      logger.info(`Auto-farm next execution in ${minutesUntilNext} minutes (${new Date(state.nextExecution || now + timeUntilNext).toISOString()})`);
    }
    
    // Set up the interval to check every minute
    setInterval(async () => {
      try {
        const currentState = await getAutoFarmState();
        const currentTime = Date.now();
        
        if (currentState.nextExecution && currentTime >= currentState.nextExecution) {
          await autoFarmTick();
        }
      } catch (error) {
        logger.error('Error in auto-farming interval:', error);
      }
    }, 60 * 1000); // Check every minute
    
    logger.info('Auto-farming system initialized with persistent timing');
  } catch (error) {
    logger.error('Error initializing auto-farming:', error);
    // Fallback to regular interval if database fails
    setInterval(async () => {
      try {
        await autoFarmTick();
      } catch (error) {
        logger.error('Error in auto-farming fallback:', error);
      }
    }, 10 * 60 * 1000);
    logger.info('Auto-farming fallback to regular 10-minute interval');
  }
}

// Manual trigger function for testing
async function triggerAutoFarm() {
  const startTime = Date.now();
  let totalUsers = 0;
  let totalCollected = 0;
  let totalPlanted = 0;
  let errorCount = 0;
  
  try {
    const { User } = require('../../database/db');
    
    // Get all users with farms
    const users = await User.find({ 
      'farm.auto.autoplant': true, 
      'farm.auto.autocollect': true 
    }).limit(100); // Limit for testing
    
    totalUsers = users.length;
    logger.info(`Auto-farming test triggered for ${totalUsers} users`);
    
    // Process users
    for (const user of users) {
      try {
        const result = await processUserAutoFarming(user);
        if (result.didCollect) totalCollected++;
        if (result.didPlant) totalPlanted += result.plantedSummary.length;
      } catch (error) {
        logger.error(`Error processing user ${user._id} in test:`, error);
        errorCount++;
      }
    }
    
    const duration = Date.now() - startTime;
    logger.info(`Auto-farming test completed: ${totalUsers} users, ${totalCollected} collected, ${totalPlanted} planted, ${errorCount} errors, ${duration}ms`);
    
    return {
      totalUsers,
      totalCollected,
      totalPlanted,
      errorCount,
      duration
    };
    
  } catch (error) {
    logger.error('Error in auto-farming test:', error);
    return {
      totalUsers: 0,
      totalCollected: 0,
      totalPlanted: 0,
      errorCount: 1,
      duration: Date.now() - startTime
    };
  }
}

module.exports = {
  setClient,
  autoFarmTick,
  triggerAutoFarm,
  initializeAutoFarming
}; 