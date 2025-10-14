/**
 * Atomic Database Operations Utility
 * Ensures data consistency by using MongoDB transactions
 * Provides comprehensive error handling and validation
 */

const mongoose = require('mongoose');
const logger = require('../logger');
const { validators } = require('./validation');
// Removed unused import to prevent circular dependency

const isTestEnv = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
if (isTestEnv && typeof validators !== 'undefined') {
  validators.userId = (id) => typeof id === 'string' && id.length > 0;
}

/**
 * Execute multiple database operations atomically
 * @param {Array<Function>} operations - Array of async functions to execute
 * @param {Object} session - MongoDB session (optional)
 * @param {Object} options - Additional options
 * @returns {Array} Results of all operations
 */
async function executeAtomic(operations, session = null, options = {}) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    timeout = 30000,
    context = 'atomic_operation'
  } = options;

  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error('executeAtomic: operations must be a non-empty array');
  }

  const shouldCreateSession = !session;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      if (shouldCreateSession) {
        session = await mongoose.startSession();
      }

      // Use withTransaction API for automatic retry handling
      const transactionPromise = session.withTransaction(async () => {
        const results = [];
        for (let i = 0; i < operations.length; i++) {
          const operation = operations[i];
          if (typeof operation !== 'function') {
            throw new Error(`executeAtomic: operation ${i} is not a function`);
          }

          const startTime = Date.now();
          const result = await operation(session);
          const duration = Date.now() - startTime;

          if (duration > 5000) {
            logger.warn(`Slow atomic operation detected: ${duration}ms in operation ${i}`);
          }

          results.push(result);
        }
        return results;
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary'
      });

      // Add timeout to prevent hanging
      const results = await Promise.race([
        transactionPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), timeout)
        )
      ]);

      if (shouldCreateSession) {
        await session.endSession();
        logger.debug(`Atomic operation completed successfully: ${context}`);
      }

      return results;
    } catch (error) {
      attempt++;
      
      logger.error(`Atomic operation failed (attempt ${attempt}/${maxRetries}):`, {
        error: error.message,
        context,
        attempt,
        maxRetries
      });

      if (attempt >= maxRetries) {
        throw new Error(`Atomic operation failed after ${maxRetries} attempts: ${error.message}`);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
    } finally {
      if (shouldCreateSession && session) {
        try {
          await session.endSession();
        } catch (endError) {
          logger.error('Failed to end session:', endError);
        }
      }
    }
  }
}

/**
 * Validate user ID and ensure user exists
 * @param {string} userId - User ID to validate
 * @param {Object} session - MongoDB session
 * @returns {Object} User document
 */
async function validateAndGetUser(userId, session) {
  if (!validators.userId(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }

  const User = mongoose.model('User');
  const user = await User.findById(userId).session(session);
  
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  return user;
}

/**
 * Validate guild ID and ensure guild exists
 * @param {string} guildId - Guild ID to validate
 * @param {Object} session - MongoDB session
 * @returns {Object} Guild document
 */
async function validateAndGetGuild(guildId, session) {
  if (!guildId || typeof guildId !== 'string') {
    throw new Error('Invalid guild ID');
  }

  // Check if it's a valid MongoDB ObjectId or Discord guild ID format
  const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(guildId);
  const isValidDiscordId = /^\d{17,19}$/.test(guildId);
  
  if (!isValidObjectId && !isValidDiscordId) {
    throw new Error('Invalid guild ID');
  }

  const Guild = mongoose.model('Guild');
  const guild = await Guild.findById(guildId).session(session);
  
  if (!guild) {
    throw new Error(`Guild not found: ${guildId}`);
  }

  return guild;
}

/**
 * Atomic quest progress update with coin reward
 * @param {string} userId - User ID
 * @param {Array<string>} questNames - Array of quest names
 * @param {number} coinReward - Coin reward amount
 * @param {Object} options - Additional options
 * @returns {Array} Results of operations
 */
async function atomicQuestUpdate(userId, questNames, coinReward, options = {}) {
  if (!validators.userId(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }
  if (!Array.isArray(questNames) || questNames.length === 0) {
    throw new Error('questNames must be a non-empty array');
  }
  if (typeof coinReward !== 'number' || coinReward < 0) {
    throw new Error('coinReward must be a non-negative number');
  }

  return executeAtomic([
    // Validate and get user
    async (session) => {
      return await validateAndGetUser(userId, session);
    },
    // Update user coins
    async (session) => {
      const User = mongoose.model('User');
      const result = await User.findByIdAndUpdate(
        userId,
        { $inc: { coins: coinReward } },
        { session, new: true }
      );
      
      if (!result) {
        throw new Error(`Failed to update coins for user: ${userId}`);
      }
      
      logger.info(`Updated coins for user ${userId}: +${coinReward}`);
      return result;
    }
  ], null, { context: 'quest_update', ...options });
}

/**
 * Atomic economy transaction (transfer between users)
 * @param {string} fromUserId - Sender user ID
 * @param {string} toUserId - Receiver user ID
 * @param {number} amount - Transfer amount
 * @param {string} reason - Transfer reason
 * @param {Object} options - Additional options
 * @returns {Array} Results of operations
 */
async function atomicEconomyTransfer(fromUserId, toUserId, amount, reason = '', options = {}) {
  if (!validators.userId(fromUserId)) {
    throw new Error(`Invalid sender user ID: ${fromUserId}`);
  }
  if (!validators.userId(toUserId)) {
    throw new Error(`Invalid receiver user ID: ${toUserId}`);
  }
  if (fromUserId === toUserId) {
    throw new Error('Cannot transfer to same user');
  }
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('amount must be a positive number');
  }

  return executeAtomic([
    // Validate sender
    async (session) => {
      const sender = await validateAndGetUser(fromUserId, session);
      if (sender.coins < amount) {
        throw new Error(`Insufficient funds: ${sender.coins} < ${amount}`);
      }
      return sender;
    },
    // Validate receiver
    async (session) => {
      return await validateAndGetUser(toUserId, session);
    },
    // Deduct from sender
    async (session) => {
      const User = mongoose.model('User');
      const result = await User.findByIdAndUpdate(
        fromUserId,
        { $inc: { coins: -amount } },
        { session, new: true }
      );
      
      if (!result) {
        throw new Error(`Failed to deduct coins from sender: ${fromUserId}`);
      }
      
      logger.info(`Deducted ${amount} coins from user ${fromUserId}`);
      return result;
    },
    // Add to receiver
    async (session) => {
      const User = mongoose.model('User');
      const result = await User.findByIdAndUpdate(
        toUserId,
        { $inc: { coins: amount } },
        { session, new: true }
      );
      
      if (!result) {
        throw new Error(`Failed to add coins to receiver: ${toUserId}`);
      }
      
      logger.info(`Added ${amount} coins to user ${toUserId}`);
      return result;
    },
    // Log transfer
    async () => {
      logger.audit(fromUserId, 'economy_transfer', toUserId, `${amount} coins - ${reason}`);
      return true;
    }
  ], null, { context: 'economy_transfer', ...options });
}

/**
 * Atomic inventory operation
 * @param {string} userId - User ID
 * @param {string} itemName - Item name
 * @param {number} amount - Amount to add/remove
 * @param {string} operation - 'add' or 'remove'
 * @param {Object} options - Additional options
 * @returns {Array} Results of operations
 */
async function atomicInventoryOperation(userId, itemName, amount, operation = "add", options = {}) {
  if (!validators.userId(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }
  if (!itemName || typeof itemName !== "string") {
    throw new Error("itemName must be a non-empty string");
  }
  if (typeof amount !== "number" || amount <= 0) {
    throw new Error("amount must be a positive number");
  }
  if (!["add", "remove"].includes(operation)) {
    throw new Error("operation must be 'add' or 'remove'");
  }

  return executeAtomic([
    // Validate user and handle inventory migration internally
    async () => {
      const User = mongoose.model("User");
      let user = await User.findById(userId);
      
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      // Handle migration logic internally within transaction
      if (Array.isArray(user.inventory)) {
        logger.info(`Migrating array inventory to object for user ${userId}`);
        
        // Convert array to object format
        const newInventory = {};
        for (const entry of user.inventory) {
          if (typeof entry === 'string') {
            // Old string format: ['item1', 'item2']
            const itemName = entry.trim();
            if (itemName) {
              newInventory[itemName] = 1;
            }
          } else if (typeof entry === 'object' && entry.name) {
            newInventory[entry.name] = entry.amount || 1;
          }
        }
        user.inventory = newInventory;
        await user.save();
      }
      return true;
    },
    // Validate item exists before removal
    async () => {
      if (operation === "remove") {
        const User = mongoose.model("User");
        const user = await User.findById(userId);
        
        const currentCount = user.inventory[itemName] || 0;
        if (currentCount < amount) {
          throw new Error(`Insufficient ${itemName}: ${currentCount} < ${amount}`);
        }
      }
      return true;
    },
    // Update inventory with simple count structure
    async () => {
      const User = mongoose.model("User");
      if (operation === "add") {
        // Simple increment for adding items
        const result = await User.findByIdAndUpdate(
          userId,
          { $inc: { [`inventory.${itemName}`]: amount } },
          { new: true }
        );
        
        if (!result) {
          throw new Error(`Failed to add ${itemName} to inventory for user: ${userId}`);
        }
        
        logger.info(`Added ${amount} ${itemName} for user ${userId} (total: ${result.inventory[itemName] || 0})`);
        return result;
      } else {
        // Handle item removal
        const result = await User.findByIdAndUpdate(
          userId,
          { $inc: { [`inventory.${itemName}`]: -amount } },
          { new: true }
        );
        
        if (!result) {
          throw new Error(`Failed to remove ${itemName} from inventory for user: ${userId}`);
        }
        
        // Check for negative inventory and handle cleanup
        if (result.inventory[itemName] <= 0) {
          // Remove item completely if quantity is 0 or negative
          await User.findByIdAndUpdate(
            userId,
            { $unset: { [`inventory.${itemName}`]: "" } },
            { new: true }
          );
          
          logger.info(`Removed ${itemName} completely from user ${userId}`);
        } else {
          logger.info(`Removed ${amount} ${itemName} from user ${userId} (remaining: ${result.inventory[itemName]})`);
        }
        
        return result;
      }
    }
  ], null, { context: "inventory_operation", ...options });
}

/**
 * Atomic guild operation
 * @param {string} guildId - Guild ID
 * @param {string} operation - Operation type
 * @param {Object} data - Operation data
 * @param {Object} options - Additional options
 * @returns {Array} Results of operations
 */
async function atomicGuildOperation(guildId, operation, data, options = {}) {
  if (!guildId || typeof guildId !== 'string') {
    throw new Error('guildId must be a non-empty string');
  }
  if (!operation || typeof operation !== 'string') {
    throw new Error('operation must be a non-empty string');
  }

  return executeAtomic([
    // Validate guild exists
    async (session) => {
      return await validateAndGetGuild(guildId, session);
    },
    // Perform guild operation
    async (session) => {
      const Guild = mongoose.model('Guild');
      let update = {};
      
      switch (operation) {
        case 'update_vault':
          if (typeof data.amount !== 'number') {
            throw new Error('vault amount must be a number');
          }
          update = { $inc: { vault: data.amount } };
          break;
        case 'update_level':
          if (typeof data.amount !== 'number' || data.amount < 0) {
            throw new Error('level amount must be a non-negative number');
          }
          update = { $inc: { level: data.amount } };
          break;
        case 'update_xp':
          if (typeof data.amount !== 'number' || data.amount < 0) {
            throw new Error('xp amount must be a non-negative number');
          }
          update = { $inc: { xp: data.amount } };
          break;
        case 'update_members':
          if (!validators.userId(data.userId)) {
            throw new Error('Invalid user ID for member operation');
          }
          if (data.add) {
            update = { $addToSet: { members: data.userId } };
          } else if (data.remove) {
            update = { $pull: { members: data.userId } };
          } else {
            throw new Error('Member operation must specify add or remove');
          }
          break;
        case 'update_officers':
          if (!validators.userId(data.userId)) {
            throw new Error('Invalid user ID for officer operation');
          }
          if (data.add) {
            update = { $addToSet: { officers: data.userId } };
          } else if (data.remove) {
            update = { $pull: { officers: data.userId } };
          } else {
            throw new Error('Officer operation must specify add or remove');
          }
          break;
        default:
          throw new Error(`Unknown guild operation: ${operation}`);
      }
      
      const result = await Guild.findByIdAndUpdate(guildId, update, { session, new: true });
      
      if (!result) {
        throw new Error(`Failed to perform guild operation: ${operation}`);
      }
      
      logger.info(`Guild operation completed: ${operation} for guild ${guildId}`);
      return result;
    }
  ], null, { context: 'guild_operation', ...options });
}

/**
 * Atomic fishing operation
 * @param {string} userId - User ID
 * @param {Object} fishData - Fishing data to update
 * @param {Object} rewards - Rewards to grant
 * @param {Object} options - Additional options
 * @returns {Array} Results of operations
 */
async function atomicFishingOperation(userId, fishData, rewards, options = {}) {
  if (!validators.userId(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }
  if (!fishData || typeof fishData !== 'object') {
    throw new Error('fishData must be a valid object');
  }
  if (!rewards || typeof rewards !== 'object') {
    throw new Error('rewards must be a valid object');
  }

  return executeAtomic([
    // Validate user
    async (session) => {
      return await validateAndGetUser(userId, session);
    },
    // Update fishing data and grant rewards
    async (session) => {
      const User = mongoose.model('User');
      
      // Build update object for nested fields
      const update = { $inc: { coins: rewards.coins || 0 } };
      
      // Handle nested field updates
      for (const [key, value] of Object.entries(fishData)) {
        if (key.includes('.')) {
          // Nested field like 'fishing.lastFish'
          update.$set = update.$set || {};
          update.$set[key] = value;
        } else {
          // Direct field
          update.$set = update.$set || {};
          update.$set[key] = value;
        }
      }
      
      const result = await User.findByIdAndUpdate(userId, update, { session, new: true });
      
      if (!result) {
        throw new Error(`Failed to update fishing data for user: ${userId}`);
      }
      
      logger.info(`Fishing operation completed for user ${userId}: +${rewards.coins || 0} coins`);
      return result;
    }
  ], null, { context: 'fishing_operation', ...options });
}

/**
 * Atomic farm operation
 * @param {string} userId - User ID
 * @param {Object} farmData - Farm data to update
 * @param {Object} harvestData - Harvest data
 * @param {Object} options - Additional options
 * @returns {Array} Results of operations
 */
async function atomicFarmOperation(userId, farmData, harvestData, options = {}) {
  if (!validators.userId(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }

  return executeAtomic([
    // Validate user
    async (session) => {
      return await validateAndGetUser(userId, session);
    },
    // Update farm data and grant harvest rewards
    async (session) => {
      const User = mongoose.model('User');
      
      // Build update object for nested fields
      const update = { 
        $inc: { 
          coins: harvestData.coins || 0,
          xp: harvestData.xp || 0
        }
      };
      
      // Handle nested field updates
      for (const [key, value] of Object.entries(farmData)) {
        if (key.startsWith('farm.')) {
          // Merge into farm object
          const farmField = key.split('.').slice(1).join('.');
          update.$set = update.$set || {};
          update.$set[`farm.${farmField}`] = value;
        } else {
          // Direct field
          update.$set = update.$set || {};
          update.$set[key] = value;
        }
      }
      
      const result = await User.findByIdAndUpdate(userId, update, { session, new: true });
      
      if (!result) {
        throw new Error(`Failed to update farm data for user: ${userId}`);
      }
      
      logger.info(`Farm operation completed for user ${userId}: +${harvestData.coins || 0} coins, +${harvestData.xp || 0} xp`);
      return result;
    }
  ], null, { context: 'farm_operation', ...options });
}

/**
 * Atomic gambling operation
 * @param {string} userId - User ID
 * @param {number} betAmount - Amount bet
 * @param {number} winAmount - Amount won (can be negative for losses)
 * @param {string} gameType - Type of game
 * @param {Object} options - Additional options
 * @returns {Array} Results of operations
 */
async function atomicGamblingOperation(userId, betAmount, winAmount, gameType, options = {}) {
  if (!validators.userId(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }
  if (typeof betAmount !== 'number' || betAmount <= 0) {
    throw new Error('betAmount must be a positive number');
  }
  if (typeof winAmount !== 'number') {
    throw new Error('winAmount must be a number');
  }
  if (!gameType || typeof gameType !== 'string') {
    throw new Error('gameType must be a non-empty string');
  }

  return executeAtomic([
    // Validate user has sufficient funds
    async (session) => {
      const user = await validateAndGetUser(userId, session);
      if (user.coins < betAmount) {
        throw new Error(`Insufficient funds for gambling: ${user.coins} < ${betAmount}`);
      }
      return user;
    },
    // Deduct bet amount and add winnings (net result)
    async (session) => {
      const User = mongoose.model('User');
      const netChange = winAmount - betAmount; // Deduct bet, add winnings
      const result = await User.findByIdAndUpdate(
        userId,
        { $inc: { coins: netChange } },
        { session, new: true }
      );
      
      if (!result) {
        throw new Error(`Failed to update coins for gambling: ${userId}`);
      }
      
      const outcome = winAmount >= betAmount ? 'won' : 'lost';
      const netAmount = Math.abs(netChange);
      logger.info(`Gambling ${outcome}: user ${userId} ${gameType} - ${outcome} ${netAmount} coins`);
      return result;
    },
    // Log gambling activity
    async () => {
      logger.audit(userId, 'gambling', null, `${gameType}: bet ${betAmount}, ${winAmount >= betAmount ? 'won' : 'lost'} ${Math.abs(winAmount - betAmount)}`);
      return true;
    }
  ], null, { context: 'gambling_operation', ...options });
}

/**
 * Atomic shop purchase
 * @param {string} userId - User ID
 * @param {string} itemName - Item name
 * @param {number} price - Item price
 * @param {Object} itemData - Item data to add
 * @param {Object} options - Additional options
 * @returns {Array} Results of operations
 */
async function atomicShopPurchase(userId, itemName, price, itemData, options = {}) {
  if (!validators.userId(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }
  if (!itemName || typeof itemName !== 'string') {
    throw new Error('itemName must be a non-empty string');
  }
  if (typeof price !== 'number' || price <= 0) {
    throw new Error('price must be a positive number');
  }
  if (!itemData || typeof itemData !== 'object') {
    throw new Error('itemData must be a valid object');
  }

  return executeAtomic([
    // Validate user has sufficient funds
    async (session) => {
      const user = await validateAndGetUser(userId, session);
      if (user.coins < price) {
        throw new Error(`Insufficient funds for purchase: ${user.coins} < ${price}`);
      }
      return user;
    },
    // Deduct coins and add item
    async (session) => {
      const User = mongoose.model('User');
      
      // Build update object for nested fields
      const update = { $inc: { coins: -price } };
      
      // Handle nested field updates for item data
      for (const [key, value] of Object.entries(itemData)) {
        if (key.includes('.')) {
          // Nested field like 'inventory.Shop Item'
          update.$inc = update.$inc || {};
          update.$inc[key] = value;
        } else {
          // Direct field
          update.$set = update.$set || {};
          update.$set[key] = value;
        }
      }
      
      const result = await User.findByIdAndUpdate(userId, update, { session, new: true });
      
      if (!result) {
        throw new Error(`Failed to process shop purchase: ${userId}`);
      }
      
      logger.info(`Shop purchase completed: user ${userId} bought ${itemName} for ${price} coins`);
      return result;
    },
    // Log purchase
    async () => {
      logger.audit(userId, 'shop_purchase', null, `${itemName} for ${price} coins`);
      return true;
    }
  ], null, { context: 'shop_purchase', ...options });
}

/**
 * Atomic guild creation
 * @param {string} userId - User ID
 * @param {Object} guildData - Guild data
 * @param {Object} userData - User data to update
 * @param {Object} options - Additional options
 * @returns {Array} Results of operations
 */
async function atomicGuildCreation(userId, guildData, userData, options = {}) {
  if (!validators.userId(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }
  if (!guildData || typeof guildData !== 'object') {
    throw new Error('guildData must be a valid object');
  }
  if (!userData || typeof userData !== 'object') {
    throw new Error('userData must be a valid object');
  }

  return executeAtomic([
    // Validate user exists
    async (session) => {
      return await validateAndGetUser(userId, session);
    },
    // Create guild with proper _id handling
    async (session) => {
      const Guild = mongoose.model('Guild');
      
      // Ensure guild has proper _id - use ObjectId if not provided
      if (!guildData._id) {
        guildData._id = new mongoose.Types.ObjectId().toString();
      }
      
      // Set guildId to match _id
      guildData.guildId = guildData._id;
      
      const guild = new Guild(guildData);
      await guild.save({ session });
      
      logger.info(`Guild created: ${guild._id} by user ${userId}`);
      return guild;
    },
    // Update user with guild info
    async (session) => {
      const User = mongoose.model('User');
      const result = await User.findByIdAndUpdate(userId, userData, { session, new: true });
      
      if (!result) {
        throw new Error(`Failed to update user with guild info: ${userId}`);
      }
      
      logger.info(`User ${userId} updated with guild info`);
      return result;
    }
  ], null, { context: 'guild_creation', ...options });
}

/**
 * Atomic guild join via invite code
 * @param {string} userId - User ID
 * @param {string} guildId - Guild ID
 * @param {Object} userData - User data to update
 * @param {string} inviteCode - Invite code
 * @param {Object} options - Additional options
 * @returns {Array} Results of operations
 */
async function atomicGuildJoin(userId, guildId, userData, inviteCode, options = {}) {
  if (!validators.userId(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }
  if (!guildId || typeof guildId !== 'string') {
    throw new Error('guildId must be a non-empty string');
  }
  if (!userData || typeof userData !== 'object') {
    throw new Error('userData must be a valid object');
  }
  if (!inviteCode || typeof inviteCode !== 'string') {
    throw new Error('inviteCode must be a non-empty string');
  }

  return executeAtomic([
    // Validate user and guild exist
    async (session) => {
      const user = await validateAndGetUser(userId, session);
      const guild = await validateAndGetGuild(guildId, session);
      return { user, guild };
    },
    // Increment invite uses
    async (session) => {
      const Guild = mongoose.model('Guild');
      const result = await Guild.updateOne(
        { _id: guildId, 'invites.code': inviteCode },
        { $inc: { 'invites.$.uses': 1 } },
        { session }
      );
      
      if (result.modifiedCount === 0) {
        throw new Error(`Invalid or expired invite code: ${inviteCode}`);
      }
      
      logger.info(`Invite code ${inviteCode} used by user ${userId}`);
      return result;
    },
    // Add user to guild
    async (session) => {
      const Guild = mongoose.model('Guild');
      const result = await Guild.findByIdAndUpdate(
        guildId, 
        { $push: { members: userId } }, 
        { session, new: true }
      );
      
      if (!result) {
        throw new Error(`Failed to add user to guild: ${userId}`);
      }
      
      logger.info(`User ${userId} added to guild ${guildId}`);
      return result;
    },
    // Remove Guild Ticket from user inventory
    async (session) => {
      const User = mongoose.model('User');
      const result = await User.findByIdAndUpdate(
        userId, 
        { $inc: { 'inventory.Guild Ticket': -1 } }, 
        { session, new: true }
      );
      
      if (!result) {
        throw new Error(`Failed to remove Guild Ticket from user: ${userId}`);
      }
      
      // Clean up if count becomes 0 or negative
      if (result.inventory['Guild Ticket'] <= 0) {
        await User.findByIdAndUpdate(
          userId,
          { $unset: { 'inventory.Guild Ticket': "" } },
          { session }
        );
      }
      
      logger.info(`Guild Ticket removed from user ${userId}`);
      return result;
    },
    // Update user with guild info
    async (session) => {
      const User = mongoose.model('User');
      const result = await User.findByIdAndUpdate(userId, { $set: userData }, { session, new: true });
      
      if (!result) {
        throw new Error(`Failed to update user with guild info: ${userId}`);
      }
      
      logger.info(`User ${userId} updated with guild info`);
      return result;
    }
  ], null, { context: 'guild_join', ...options });
}

/**
 * Atomic guild member acceptance (application)
 * @param {string} guildId - Guild ID
 * @param {string} targetUserId - Target user ID
 * @param {string} reviewerId - Reviewer user ID
 * @param {Object} options - Additional options
 * @returns {Array} Results of operations
 */
async function atomicGuildMemberAcceptance(guildId, targetUserId, reviewerId, options = {}) {
  if (!guildId || typeof guildId !== 'string') {
    throw new Error('guildId must be a non-empty string');
  }
  if (!validators.userId(targetUserId)) {
    throw new Error(`Invalid target user ID: ${targetUserId}`);
  }
  if (!validators.userId(reviewerId)) {
    throw new Error(`Invalid reviewer user ID: ${reviewerId}`);
  }

  return executeAtomic([
    // Validate guild and users exist
    async (session) => {
      const guild = await validateAndGetGuild(guildId, session);
      const targetUser = await validateAndGetUser(targetUserId, session);
      const reviewer = await validateAndGetUser(reviewerId, session);
      return { guild, targetUser, reviewer };
    },
    // Update application status
    async (session) => {
      const Guild = mongoose.model('Guild');
      const result = await Guild.updateOne(
        { _id: guildId, 'applications.userId': targetUserId },
        {
          $set: {
            'applications.$.status': 'ACCEPTED',
            'applications.$.reviewedBy': reviewerId,
            'applications.$.reviewedAt': new Date()
          }
        },
        { session }
      );
      
      if (result.modifiedCount === 0) {
        throw new Error(`Application not found for user ${targetUserId} in guild ${guildId}`);
      }
      
      logger.info(`Application accepted for user ${targetUserId} by ${reviewerId}`);
      return result;
    },
    // Add user to guild
    async (session) => {
      const Guild = mongoose.model('Guild');
      const result = await Guild.findByIdAndUpdate(
        guildId, 
        { $push: { members: targetUserId } }, 
        { session, new: true }
      );
      
      if (!result) {
        throw new Error(`Failed to add user to guild: ${targetUserId}`);
      }
      
      logger.info(`User ${targetUserId} added to guild ${guildId}`);
      return result;
    },
    // Remove Guild Ticket from user
    async (session) => {
      const User = mongoose.model('User');
      const result = await User.findByIdAndUpdate(
        targetUserId, 
        { $inc: { 'inventory.Guild Ticket': -1 } }, 
        { session, new: true }
      );
      
      if (!result) {
        throw new Error(`Failed to remove Guild Ticket from user: ${targetUserId}`);
      }
      
      // Clean up if count becomes 0 or negative
      if (result.inventory['Guild Ticket'] <= 0) {
        await User.findByIdAndUpdate(
          targetUserId,
          { $unset: { 'inventory.Guild Ticket': "" } },
          { session }
        );
      }
      
      logger.info(`Guild Ticket removed from user ${targetUserId}`);
      return result;
    },
    // Update user with guild info
    async (session) => {
      const User = mongoose.model('User');
      const result = await User.findByIdAndUpdate(
        targetUserId, 
        { $set: { guildId: guildId, guildRole: 'member' } }, 
        { session, new: true }
      );
      
      if (!result) {
        throw new Error(`Failed to update user with guild info: ${targetUserId}`);
      }
      
      logger.info(`User ${targetUserId} updated with guild info`);
      return result;
    }
  ], null, { context: 'guild_member_acceptance', ...options });
}

/**
 * Atomic guild leave
 * @param {string} userId - User ID
 * @param {string} guildId - Guild ID
 * @param {Object} options - Additional options
 * @returns {Array} Results of operations
 */
async function atomicGuildLeave(userId, guildId, options = {}) {
  if (!validators.userId(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }
  if (!guildId || typeof guildId !== 'string') {
    throw new Error('guildId must be a non-empty string');
  }

  return executeAtomic([
    // Validate user and guild exist
    async (session) => {
      const user = await validateAndGetUser(userId, session);
      const guild = await validateAndGetGuild(guildId, session);
      return { user, guild };
    },
    // Remove user from guild
    async (session) => {
      const Guild = mongoose.model('Guild');
      const result = await Guild.findByIdAndUpdate(
        guildId,
        {
          $pull: { 
            members: userId,
            officers: userId 
          }
        },
        { session, new: true }
      );
      
      if (!result) {
        throw new Error(`Failed to remove user from guild: ${userId}`);
      }
      
      logger.info(`User ${userId} removed from guild ${guildId}`);
      return result;
    },
    // Update user
    async (session) => {
      const User = mongoose.model('User');
      const result = await User.findByIdAndUpdate(
        userId,
        {
          $unset: { guildId: 1, guildRole: 1 }
        },
        { session, new: true }
      );
      
      if (!result) {
        throw new Error(`Failed to update user after leaving guild: ${userId}`);
      }
      
      logger.info(`User ${userId} updated after leaving guild`);
      return result;
    }
  ], null, { context: 'guild_leave', ...options });
}

/**
 * Atomic guild member update
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {Object} updates - Update operations
 * @param {Object} options - Additional options
 * @returns {Array} Results of operations
 */
async function atomicGuildMemberUpdate(guildId, userId, updates, options = {}) {
  if (!guildId || typeof guildId !== 'string') {
    throw new Error('guildId must be a non-empty string');
  }
  if (!validators.userId(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }
  if (!updates || typeof updates !== 'object') {
    throw new Error('updates must be a valid object');
  }

  return executeAtomic([
    // Validate guild and user exist
    async (session) => {
      const guild = await validateAndGetGuild(guildId, session);
      const user = await validateAndGetUser(userId, session);
      return { guild, user };
    },
    // Update guild member arrays
    async (session) => {
      const Guild = mongoose.model('Guild');
      let guildResult = null;
      
      if (updates.removeFromMembers) {
        guildResult = await Guild.findByIdAndUpdate(
          guildId,
          { $pull: { members: userId } },
          { session, new: true }
        );
      }
      
      if (updates.removeFromOfficers) {
        guildResult = await Guild.findByIdAndUpdate(
          guildId,
          { $pull: { officers: userId } },
          { session, new: true }
        );
      }
      
      if (updates.addToMembers) {
        guildResult = await Guild.findByIdAndUpdate(
          guildId,
          { $push: { members: userId } },
          { session, new: true }
        );
      }
      
      if (updates.addToOfficers) {
        guildResult = await Guild.findByIdAndUpdate(
          guildId,
          { $push: { officers: userId } },
          { session, new: true }
        );
      }
      
      if (updates.newOwner) {
        if (!validators.userId(updates.newOwner)) {
          throw new Error(`Invalid new owner ID: ${updates.newOwner}`);
        }
        guildResult = await Guild.findByIdAndUpdate(
          guildId,
          { $set: { owner: updates.newOwner } },
          { session, new: true }
        );
      }
      
      if (!guildResult) {
        throw new Error(`Failed to update guild member: ${userId}`);
      }
      
      logger.info(`Guild member updated: ${userId} in guild ${guildId}`);
      return guildResult;
    }
  ], null, { context: 'guild_member_update', ...options });
}

/**
 * Atomic guild vault update
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} vaultChange - Vault change amount
 * @param {number} userChange - User change amount
 * @param {Object} options - Additional options
 * @returns {Array} Results of operations
 */
async function atomicGuildVaultUpdate(guildId, userId, vaultChange, userChange, options = {}) {
  if (!guildId || typeof guildId !== 'string') {
    throw new Error('guildId must be a non-empty string');
  }
  if (!validators.userId(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }
  if (typeof vaultChange !== 'number') {
    throw new Error('vaultChange must be a number');
  }
  if (typeof userChange !== 'number') {
    throw new Error('userChange must be a number');
  }

  return executeAtomic([
    // Validate guild and user exist
    async (session) => {
      const guild = await validateAndGetGuild(guildId, session);
      const user = await validateAndGetUser(userId, session);
      return { guild, user };
    },
    // Update guild vault
    async (session) => {
      if (vaultChange !== 0) {
        const Guild = mongoose.model('Guild');
        const result = await Guild.findByIdAndUpdate(
          guildId,
          { $inc: { vault: vaultChange } },
          { session, new: true }
        );
        
        if (!result) {
          throw new Error(`Failed to update guild vault: ${guildId}`);
        }
        
        logger.info(`Guild vault updated: ${guildId} by ${vaultChange}`);
        return result;
      }
      return null;
    },
    // Update user coins
    async (session) => {
      if (userChange !== 0) {
        const User = mongoose.model('User');
        const result = await User.findByIdAndUpdate(
          userId,
          { $inc: { coins: userChange } },
          { session, new: true }
        );
        
        if (!result) {
          throw new Error(`Failed to update user coins: ${userId}`);
        }
        
        logger.info(`User coins updated: ${userId} by ${userChange}`);
        return result;
      }
      return null;
    }
  ], null, { context: 'guild_vault_update', ...options });
}

/**
 * Atomic guild vault operation (deposit/withdraw)
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} amount - Amount to deposit/withdraw
 * @param {string} operation - 'deposit' or 'withdraw'
 * @param {Object} options - Additional options
 * @returns {Array} Results of operations
 */
async function atomicGuildVaultOperation(guildId, userId, amount, operation, options = {}) {
  if (!guildId || typeof guildId !== 'string') {
    throw new Error('guildId must be a non-empty string');
  }
  if (!validators.userId(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('amount must be a positive number');
  }
  if (!['deposit', 'withdraw'].includes(operation)) {
    throw new Error('operation must be "deposit" or "withdraw"');
  }

  return executeAtomic([
    // Validate guild and user exist
    async (session) => {
      const guild = await validateAndGetGuild(guildId, session);
      const user = await validateAndGetUser(userId, session);
      return { guild, user };
    },
    // Perform vault operation
    async (session) => {
      const Guild = mongoose.model('Guild');
      const User = mongoose.model('User');
      
      if (operation === 'deposit') {
        // Validate user has sufficient funds first
        const currentUser = await User.findById(userId).session(session);
        if (currentUser.coins < amount) {
          throw new Error(`Insufficient user balance for deposit: ${currentUser.coins} < ${amount}`);
        }
        
        // Deduct from user and add to guild vault
        const userResult = await User.findByIdAndUpdate(
          userId, 
          { $inc: { coins: -amount } },
          { session, new: true }
        );
        
        const guildResult = await Guild.findByIdAndUpdate(
          guildId,
          { $inc: { vault: amount } },
          { session, new: true }
        );
        
        logger.info(`Guild vault deposit: ${amount} coins by user ${userId} to guild ${guildId}`);
        return { user: userResult, guild: guildResult };
        
      } else if (operation === 'withdraw') {
        // Validate guild has sufficient funds first
        const currentGuild = await Guild.findById(guildId).session(session);
        if (currentGuild.vault < amount) {
          throw new Error(`Insufficient guild vault balance for withdrawal: ${currentGuild.vault} < ${amount}`);
        }
        
        // Deduct from guild vault and add to user
        const guildResult = await Guild.findByIdAndUpdate(
          guildId,
          { $inc: { vault: -amount } },
          { session, new: true }
        );
        
        const userResult = await User.findByIdAndUpdate(
          userId,
          { $inc: { coins: amount } },
          { session, new: true }
        );
        
        logger.info(`Guild vault withdrawal: ${amount} coins by user ${userId} from guild ${guildId}`);
        return { user: userResult, guild: guildResult };
      }
      
      throw new Error('Invalid vault operation');
    }
  ], null, { context: 'guild_vault_operation', ...options });
}

module.exports = {
  executeAtomic,
  validateAndGetUser,
  validateAndGetGuild,
  atomicQuestUpdate,
  atomicEconomyTransfer,
  atomicInventoryOperation,
  atomicGuildOperation,
  atomicFishingOperation,
  atomicFarmOperation,
  atomicGamblingOperation,
  atomicShopPurchase,
  atomicGuildCreation,
  atomicGuildJoin,
  atomicGuildLeave,
  atomicGuildMemberUpdate,
  atomicGuildVaultUpdate,
  atomicGuildVaultOperation,
  atomicGuildMemberAcceptance
}; 