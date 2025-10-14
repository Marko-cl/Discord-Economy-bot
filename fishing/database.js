const { User } = require('../../database/db');

// Get or initialize fishing data for a user
async function getOrInitFishing(userId, session) {
  let user = await User.findById(userId, null, session ? { session } : undefined);
  let update = {};
  let changed = false;
  if (!user) user = await User.create({ _id: userId }, session ? { session } : undefined);
  if (!user.fishInventory || typeof user.fishInventory !== 'object') {
    update.fishInventory = {};
    user.fishInventory = {};
    changed = true;
  }
  if (!user.fishLog || typeof user.fishLog !== 'object') {
    update.fishLog = {};
    user.fishLog = {};
    changed = true;
  }
  if (!user.fishingCollectionCompleted || typeof user.fishingCollectionCompleted !== 'object') {
    update.fishingCollectionCompleted = {};
    user.fishingCollectionCompleted = {};
    changed = true;
  }
  if (!user.fishingCollectionTiers || typeof user.fishingCollectionTiers !== 'object') {
    update.fishingCollectionTiers = {};
    user.fishingCollectionTiers = {};
    changed = true;
  }
  if (!user.fishingRod || typeof user.fishingRod !== 'object') {
    update.fishingRod = { level: 1, skin: 'default' };
    user.fishingRod = { level: 1, skin: 'default' };
    changed = true;
  }
  if (changed) await User.findByIdAndUpdate(userId, { $set: update }, session ? { session } : undefined);
  return user;
}

async function updateUserFishing(userId, updateObj, session) {
  await User.findByIdAndUpdate(userId, { $set: updateObj }, session ? { session } : undefined);
}

async function ensureFishInventoryField(user, session) {
  if (!user.fishInventory) {
    await User.findByIdAndUpdate(user._id, { $set: { fishInventory: {} } }, session ? { session } : undefined);
    user.fishInventory = {};
  }
  return user;
}

module.exports = {
  getOrInitFishing,
  updateUserFishing,
  ensureFishInventoryField,
  // Aliases for handler/test compatibility
  getUserFishingData: getOrInitFishing,
  updateUserFishingData: updateUserFishing
}; 