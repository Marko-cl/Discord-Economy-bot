// Database operations for Discord bot
const { User } = require('../database/db');
const logger = require('../logger');
const { userCache, userCacheTimestamps, clearUserCache } = require('./cache');
const { validators } = require('./validation');

/**
 * Get user from database with caching
 */
async function getUser(userId, projection = null) {
  if (!validators.userId(userId)) {
    logger.warn('Invalid userId provided to getUser:', userId);
    return null;
  }

  const cacheKey = projection ? `${userId}:${JSON.stringify(projection)}` : userId;
  
  // Check cache first
  if (userCache.has(cacheKey)) {
    const timestamp = userCacheTimestamps.get(cacheKey);
    if (Date.now() - timestamp < 5 * 60 * 1000) { // 5 minute cache
      return userCache.get(cacheKey);
    }
  }

  try {
    let user;
    if (projection) {
      user = await User.findById(userId, projection);
    } else {
      user = await User.findById(userId);
    }

    if (user) {
      // Ensure accountCreated is set for all users
      await ensureAccountCreatedField(user);
      
      // Cache the result
      userCache.set(cacheKey, user);
      userCacheTimestamps.set(cacheKey, Date.now());
    }

    return user;
  } catch (error) {
    logger.error('Database error in getUser:', error);
    return null;
  }
}

/**
 * Safely update user with error handling
 * WARNING: This is NOT atomic for multi-step or multi-user updates.
 * Use atomic operations (see utils/atomicOperations.js) for any logic that updates more than one document or field that must be kept in sync.
 */
async function safeUpdateUser(userId, updateObj) {
  if (!validators.userId(userId)) {
    logger.warn('Invalid userId provided to safeUpdateUser:', userId);
    return false;
  }

  try {
    await User.findByIdAndUpdate(userId, updateObj, { upsert: true });
    clearUserCache(userId);
    return true;
  } catch (error) {
    logger.error('Database error in safeUpdateUser:', error);
    return false;
  }
}

/**
 * Batch update multiple users
 */
async function batchUpdateUsers(updates) {
  if (!Array.isArray(updates) || updates.length === 0) {
    return { success: 0, failed: 0 };
  }

  const results = { success: 0, failed: 0 };
  const validUpdates = updates.filter(update => 
    validators.userId(update.userId) && update.updateObj
  );

  for (const update of validUpdates) {
    try {
      await User.findByIdAndUpdate(update.userId, update.updateObj, { upsert: true });
      clearUserCache(update.userId);
      results.success++;
    } catch (error) {
      logger.error(`Failed to update user ${update.userId}:`, error);
      results.failed++;
    }
  }

  return results;
}

// Add farmInventory field to users if it doesn't exist (for migration purposes only)
async function ensureFarmInventoryField(user) {
  if (!user.farmInventory) {
    try {
      await User.findByIdAndUpdate(user._id, { 
        $set: { farmInventory: {} } 
      });
      user.farmInventory = {};
      console.log(`Added farmInventory field to user ${user._id}`);
    } catch (error) {
      console.error(`Failed to add farmInventory field to user ${user._id}:`, error);
    }
  }
  return user;
}

// Ensure accountCreated field is set for users (for migration and new users)
async function ensureAccountCreatedField(user) {
  if (!user.accountCreated) {
    try {
      const now = new Date();
      await User.findByIdAndUpdate(user._id, { 
        $set: { accountCreated: now } 
      });
      user.accountCreated = now;
      logger.info(`Set accountCreated field for user ${user._id} to ${now}`);
    } catch (error) {
      logger.error(`Failed to set accountCreated field for user ${user._id}:`, error);
    }
  }
  return user;
}

module.exports = {
  getUser,
  safeUpdateUser,
  batchUpdateUsers,
  ensureFarmInventoryField,
  ensureAccountCreatedField
}; 