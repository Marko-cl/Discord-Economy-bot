/**
 * Atomic Economy Operations
 * Provides safe, atomic database operations for economy commands
 */

const { executeAtomic } = require('./atomicOperations');
const logger = require('../logger');

/**
 * Atomic coin update operation
 */
async function atomicCoinUpdate(userId, amount, operation = 'add') {
  try {
    const result = await executeAtomic([
      async (session) => {
        const User = require('mongoose').model('User');
        const update = operation === 'add' ? { $inc: { coins: amount } } : { $set: { coins: amount } };
        
        const user = await User.findByIdAndUpdate(
          userId,
          update,
          { session, new: true, upsert: true }
        );
        
        if (!user) {
          throw new Error(`User ${userId} not found or update failed`);
        }
        
        // Ensure coins don't go negative
        if (user.coins < 0) {
          await User.findByIdAndUpdate(userId, { $set: { coins: 0 } }, { session });
          user.coins = 0;
        }
        
        return user;
      }
    ], null, { context: 'economy_coin_update' });
    
    return { success: true, user: result[0] };
  } catch (error) {
    logger.error(`Atomic coin update failed for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Atomic XP update operation
 */
async function atomicXpUpdate(userId, amount, operation = 'add') {
  try {
    const result = await executeAtomic([
      async (session) => {
        const User = require('mongoose').model('User');
        const update = operation === 'add' ? { $inc: { xp: amount } } : { $set: { xp: amount } };
        
        const user = await User.findByIdAndUpdate(
          userId,
          update,
          { session, new: true, upsert: true }
        );
        
        if (!user) {
          throw new Error(`User ${userId} not found or update failed`);
        }
        
        // Ensure XP doesn't go negative
        if (user.xp < 0) {
          await User.findByIdAndUpdate(userId, { $set: { xp: 0 } }, { session });
          user.xp = 0;
        }
        
        return user;
      }
    ], null, { context: 'economy_xp_update' });
    
    return { success: true, user: result[0] };
  } catch (error) {
    logger.error(`Atomic XP update failed for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Atomic user update with multiple fields
 */
async function atomicUserUpdate(userId, updates) {
  try {
    const result = await executeAtomic([
      async (session) => {
        const User = require('mongoose').model('User');
        
        // Validate updates
        const validUpdates = {};
        for (const [key, value] of Object.entries(updates)) {
          if (typeof value === 'number' && value < 0 && ['coins', 'xp'].includes(key)) {
            validUpdates[key] = 0; // Prevent negative values
          } else {
            validUpdates[key] = value;
          }
        }
        
        const user = await User.findByIdAndUpdate(
          userId,
          validUpdates,
          { session, new: true, upsert: true }
        );
        
        if (!user) {
          throw new Error(`User ${userId} not found or update failed`);
        }
        
        return user;
      }
    ], null, { context: 'economy_user_update' });
    
    return { success: true, user: result[0] };
  } catch (error) {
    logger.error(`Atomic user update failed for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Atomic item removal operation
 */
async function atomicItemRemoval(userId, itemName, amount = 1) {
  try {
    const result = await executeAtomic([
      async (session) => {
        const User = require('mongoose').model('User');
        
        // Check if user has the item
        const user = await User.findById(userId).session(session);
        if (!user) {
          throw new Error(`User ${userId} not found`);
        }
        
        const inventory = user.inventory || {};
        const currentAmount = inventory[itemName] || 0;
        
        if (currentAmount < amount) {
          throw new Error(`Insufficient items: ${currentAmount} < ${amount}`);
        }
        
        // Update inventory
        const newAmount = currentAmount - amount;
        const update = newAmount > 0 
          ? { [`inventory.${itemName}`]: newAmount }
          : { $unset: { [`inventory.${itemName}`]: 1 } };
        
        const updatedUser = await User.findByIdAndUpdate(
          userId,
          update,
          { session, new: true }
        );
        
        return updatedUser;
      }
    ], null, { context: 'economy_item_removal' });
    
    return { success: true, user: result[0] };
  } catch (error) {
    logger.error(`Atomic item removal failed for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Atomic leaderboard data refresh
 */
async function atomicLeaderboardRefresh(metric) {
  try {
    const result = await executeAtomic([
      async (session) => {
        const User = require('mongoose').model('User');
        const PermanentLeaderboard = require('mongoose').model('PermanentLeaderboard');
        
        let users;
        let leaderboardData = [];

        if (metric === 'coins') {
          users = await User.find().sort({ coins: -1 }).limit(10).session(session);
          leaderboardData = users.map((user, index) => ({
            userId: user._id,
            username: user.username || 'Unknown',
            value: user.coins || 0,
            rank: index + 1
          }));
        } else if (metric === 'xp') {
          users = await User.find().session(session);
          const usersWithXP = users.map(user => ({
            ...user.toObject(),
            totalXp: calculateTotalXP(user)
          })).sort((a, b) => b.totalXp - a.totalXp).slice(0, 10);
          
          leaderboardData = usersWithXP.map((user, index) => ({
            userId: user._id,
            username: user.username || 'Unknown',
            value: user.totalXp,
            rank: index + 1
          }));
        } else if (metric === 'prestige') {
          users = await User.find().sort({ prestigeLevel: -1, prestigeMultiplier: -1 }).limit(10).session(session);
          leaderboardData = users.map((user, index) => ({
            userId: user._id,
            username: user.username || 'Unknown',
            value: user.prestigeLevel || 1,
            rank: index + 1
          }));
        }

        const nextUpdate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

        await PermanentLeaderboard.findByIdAndUpdate(
          metric,
          {
            data: leaderboardData,
            lastUpdated: new Date(),
            nextUpdate: nextUpdate,
            totalUsers: users.length
          },
          { session, upsert: true, new: true }
        );

        return leaderboardData;
      }
    ], null, { context: 'leaderboard_refresh' });
    
    return { success: true, data: result[0] };
  } catch (error) {
    logger.error(`Atomic leaderboard refresh failed for metric ${metric}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate total XP for a user
 */
function calculateTotalXP(user) {
  let total = 0;
  for (let i = 0; i < (user.level || 0); i++) {
    total += 1000 + 250 * i;
  }
  return total + (user.xp || 0);
}

/**
 * Validate amount input
 */
function validateAmount(amount, options = {}) {
  const { min = 1, max = 1e9, allowZero = false } = options;
  
  if (typeof amount !== 'number' || isNaN(amount)) {
    return { valid: false, error: 'Amount must be a valid number' };
  }
  
  if (!allowZero && amount <= 0) {
    return { valid: false, error: 'Amount must be greater than 0' };
  }
  
  if (amount < min) {
    return { valid: false, error: `Amount must be at least ${min}` };
  }
  
  if (amount > max) {
    return { valid: false, error: `Amount must be at most ${max}` };
  }
  
  return { valid: true };
}

/**
 * Validate item name input
 */
function validateItemName(itemName) {
  if (!itemName || typeof itemName !== 'string') {
    return { valid: false, error: 'Item name is required' };
  }
  
  const trimmed = itemName.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Item name cannot be empty' };
  }
  
  if (trimmed.length > 50) {
    return { valid: false, error: 'Item name must be 50 characters or less' };
  }
  
  // Check for forbidden characters
  if (/[<>"'&]/.test(trimmed)) {
    return { valid: false, error: 'Item name contains forbidden characters' };
  }
  
  return { valid: true, sanitized: trimmed };
}

module.exports = {
  atomicCoinUpdate,
  atomicXpUpdate,
  atomicUserUpdate,
  atomicItemRemoval,
  atomicLeaderboardRefresh,
  validateAmount,
  validateItemName,
  calculateTotalXP
}; 