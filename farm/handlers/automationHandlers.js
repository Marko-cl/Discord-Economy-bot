const { reply } = require('../../../utils/formatting');
const { getOrInitFarm, initializeFarmFields } = require('../database');
const { withSafeReply } = require('../../../utils/safeReply');
const { checkRateLimit } = require('../../../utils/rateLimiting');
const { validators } = require('../../../utils/validation');
const logger = require('../../../logger');
const { progressQuests } = require('../../../utils/utils');
const { executeAtomic } = require('../../../utils/atomicOperations');

const rateLimiter = (userId) => checkRateLimit(userId, 'farm_automation', 3, 15000);

// Auto plant handler
const handleAutoPlant = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm auto plant: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  let farm = user.farm;
  farm = await initializeFarmFields(userId, farm);
  
  // Check if user has workers
  const workerCount = user.farmInventory && user.farmInventory['👨‍🌾 Worker'] ? user.farmInventory['👨‍🌾 Worker'].count : 0;
  
  if (workerCount === 0) {
    return await reply(interaction, {
      content: '❌ You need at least one 👨‍🌾 Worker to use auto-planting! Buy workers from `/shop`.',
      flags: 1 << 6
    });
  }
  
  // Toggle auto-plant
  farm.auto.autoplant = !farm.auto.autoplant;
  
  // Use atomic operation for auto-plant toggle
  const result = await executeAtomic([
    async (session) => {
      const User = require('mongoose').model('User');
      
      // Validate user exists
      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }
      
      // Update farm data
      const result = await User.findByIdAndUpdate(userId, { 
        $set: { farm: farm } 
      }, { session, new: true });
      
      if (!result) {
        throw new Error(`Failed to update farm for user: ${userId}`);
      }
      
      logger.info(`Farm auto-plant toggle completed for user ${userId}: ${farm.auto.autoplant ? 'enabled' : 'disabled'}`);
      return result;
    }
  ], null, { context: 'farm_auto_plant_toggle' });
  
  if (!result[0]) {
    logger.error(`Farm auto-plant toggle failed for user ${userId}`);
    return await reply(interaction, {
      content: '❌ Failed to toggle auto-planting! Please try again.',
      flags: 1 << 6
    });
  }
  
  // Update quest progress
  progressQuests(userId, ['farm_automation', 'farm_auto_plant'], interaction).catch(e => logger.error('progressQuests error:', e));
  
  const status = farm.auto.autoplant ? 'enabled' : 'disabled';
  return await reply(interaction, `🤖 Auto-planting ${status}! Workers will automatically plant seeds in empty plots.`);
}, { rateLimiter });

// Auto collect handler
const handleAutoCollect = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm auto collect: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  let farm = user.farm;
  farm = await initializeFarmFields(userId, farm);
  
  // Check if user has workers
  const workerCount = user.farmInventory && user.farmInventory['👨‍🌾 Worker'] ? user.farmInventory['👨‍🌾 Worker'].count : 0;
  
  if (workerCount === 0) {
    return await reply(interaction, {
      content: '❌ You need at least one 👨‍🌾 Worker to use auto-collecting! Buy workers from `/shop`.',
      flags: 1 << 6
    });
  }
  
  // Toggle auto-collect
  farm.auto.autocollect = !farm.auto.autocollect;
  
  // Use atomic operation for auto-collect toggle
  const result = await executeAtomic([
    async (session) => {
      const User = require('mongoose').model('User');
      
      // Validate user exists
      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }
      
      // Update farm data
      const result = await User.findByIdAndUpdate(userId, { 
        $set: { farm: farm } 
      }, { session, new: true });
      
      if (!result) {
        throw new Error(`Failed to update farm for user: ${userId}`);
      }
      
      logger.info(`Farm auto-collect toggle completed for user ${userId}: ${farm.auto.autocollect ? 'enabled' : 'disabled'}`);
      return result;
    }
  ], null, { context: 'farm_auto_collect_toggle' });
  
  if (!result[0]) {
    logger.error(`Farm auto-collect toggle failed for user ${userId}`);
    return await reply(interaction, {
      content: '❌ Failed to toggle auto-collecting! Please try again.',
      flags: 1 << 6
    });
  }
  
  // Update quest progress
  progressQuests(userId, ['farm_automation', 'farm_auto_collect'], interaction).catch(e => logger.error('progressQuests error:', e));
  
  const status = farm.auto.autocollect ? 'enabled' : 'disabled';
  return await reply(interaction, `🤖 Auto-collecting ${status}! Workers will automatically collect ready crops.`);
}, { rateLimiter });

// Notification handler
const handleNotification = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm notification: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  let farm = user.farm;
  farm = await initializeFarmFields(userId, farm);
  
  // Toggle notifications
  farm.auto.notifications = !farm.auto.notifications;
  
  // Use atomic operation for notification toggle
  const result = await executeAtomic([
    async (session) => {
      const User = require('mongoose').model('User');
      
      // Validate user exists
      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }
      
      // Update farm data
      const result = await User.findByIdAndUpdate(userId, { 
        $set: { farm: farm } 
      }, { session, new: true });
      
      if (!result) {
        throw new Error(`Failed to update farm for user: ${userId}`);
      }
      
      logger.info(`Farm notification toggle completed for user ${userId}: ${farm.auto.notifications ? 'enabled' : 'disabled'}`);
      return result;
    }
  ], null, { context: 'farm_notification_toggle' });
  
  if (!result[0]) {
    logger.error(`Farm notification toggle failed for user ${userId}`);
    return await reply(interaction, {
      content: '❌ Failed to toggle notifications! Please try again.',
      flags: 1 << 6
    });
  }
  
  // Update quest progress
  progressQuests(userId, ['farm_automation', 'farm_notifications'], interaction).catch(e => logger.error('progressQuests error:', e));
  
  const status = farm.auto.notifications ? 'enabled' : 'disabled';
  return await reply(interaction, `📢 Farm notifications ${status}! You will receive DM notifications about auto-farming activities.`);
}, { rateLimiter });

module.exports = {
  handleAutoPlant,
  handleAutoCollect,
  handleNotification
}; 