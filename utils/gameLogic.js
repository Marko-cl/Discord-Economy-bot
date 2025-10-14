// Game logic utilities for Discord bot
const { COSMETICS } = require('./constants');
const { safeGetArray, safeGetBoolean } = require('./formatting');
const logger = require('../logger');

/**
 * Check if user is owner
 */
function isOwner() {
  return false;
}

/**
 * Check if user is blacklisted
 */
function isUserBlacklisted() {
  return false;
}

/**
 * Get total coin multiplier for user
 */
function getTotalCoinMultiplier(user) {
  if (!user) return 1;
  
  let multiplier = 1;
  
  // Check cosmetics
  if (user.cosmetics) {
    for (const [key, cosmetic] of Object.entries(COSMETICS)) {
      if (safeGetBoolean(user.cosmetics, key, false)) {
        multiplier += cosmetic.multiplier;
      }
    }
  }
  
  // Check boosters
  const now = Date.now();
  if (user.coinBooster && new Date(user.coinBooster) > now) {
    multiplier += 0.5; // 50% boost
  }
  
  return multiplier;
}

/**
 * Get XP multiplier for user
 */
function getXpMultiplier(user) {
  if (!user) return 1;
  
  let multiplier = 1;
  
  // Check XP booster
  const now = Date.now();
  if (user.xpBooster && new Date(user.xpBooster) > now) {
    multiplier += 0.5; // 50% boost
  }
  
  return multiplier;
}

/**
 * Get seasonal special items
 */
function getSeasonalSpecialItems() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  
  // Christmas items (December)
  if (month === 12) {
    return ['Christmas Tree', 'Snow Globe', 'Gingerbread Man'];
  }
  
  // Halloween items (October)
  if (month === 10) {
    return ['Pumpkin', 'Ghost Costume', 'Witch Hat'];
  }
  
  // Valentine's Day items (February)
  if (month === 2 && day >= 10 && day <= 16) {
    return ['Rose', 'Chocolate Box', 'Love Letter'];
  }
  
  return [];
}

/**
 * Get unlock progress for user
 */
function getUnlockProgress(user) {
  if (!user) return {};
  
  const progress = {};
  
  // Prestige progress
  const currentPrestige = user.prestigeLevel || 0;
  const nextPrestige = currentPrestige + 1;
  const coinsRequired = nextPrestige * 1000000; // 1M coins per prestige
  const userCoins = user.coins || 0;
  
  // Get prestige rank information
  const { prestigeRanks } = require('../database/db');
  const currentRank = prestigeRanks.find(rank => rank.level === currentPrestige) || prestigeRanks[0];
  const nextRank = prestigeRanks.find(rank => rank.level === nextPrestige) || prestigeRanks[0];
  
  progress.prestige = {
    current: currentPrestige,
    max: nextPrestige,
    progress: Math.min(userCoins / coinsRequired, 1),
    coinsRequired,
    userCoins,
    prestigeRank: currentRank.name,
    prestigeMultiplier: currentRank.multiplier,
    nextRank: nextRank.name,
    nextMultiplier: nextRank.multiplier
  };
  
  // Level progress
  const currentLevel = user.level || 1;
  const currentXp = user.xp || 0;
  const xpRequired = 1000 + 250 * (currentLevel - 1);
  
  progress.level = {
    current: currentLevel,
    max: currentLevel + 1,
    progress: Math.min(currentXp / xpRequired, 1),
    xpRequired,
    currentXp,
    next: currentLevel + 1
  };
  
  // Pet progress
  if (user.petBot) {
    const petLevel = user.petBot.level || 1;
    const petXp = user.petBot.xp || 0;
    const petXpRequired = 100 + 50 * (petLevel - 1);
    
    progress.pet = {
      current: petLevel,
      max: petLevel + 1,
      progress: Math.min(petXp / petXpRequired, 1),
      xpRequired: petXpRequired,
      currentXp: petXp,
      next: petLevel + 1
    };
  }
  
  // Mine progress
  if (user.goldMineLevel) {
    const mineLevel = user.goldMineLevel || 1;
    const mineXp = user.goldMineXp || 0;
    const mineXpRequired = 100 + 50 * mineLevel; // Consistent with mining system
    
    progress.mine = {
      current: mineLevel,
      max: mineLevel + 1,
      progress: Math.min(mineXp / mineXpRequired, 1),
      xpRequired: mineXpRequired,
      currentXp: mineXp,
      next: mineLevel + 1
    };
  }
  
  return progress;
}

/**
 * Get seasonal info
 */
function getSeasonalInfo() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  
  if (month === 12) {
    return {
      name: 'Christmas',
      icon: '🎄',
      multiplier: 1.2,
      specialItems: ['Christmas Tree', 'Snow Globe', 'Gingerbread Man']
    };
  }
  
  if (month === 10) {
    return {
      name: 'Halloween',
      icon: '🎃',
      multiplier: 1.15,
      specialItems: ['Pumpkin', 'Ghost Costume', 'Witch Hat']
    };
  }
  
  if (month === 2 && day >= 10 && day <= 16) {
    return {
      name: 'Valentine\'s Day',
      icon: '💕',
      multiplier: 1.1,
      specialItems: ['Rose', 'Chocolate Box', 'Love Letter']
    };
  }
  
  return {
    name: 'Regular Season',
    icon: '🌱',
    multiplier: 1.0,
    specialItems: []
  };
}

/**
 * Get luck multiplier for user
 */
function getLuckMultiplier(user) {
  if (!user) return 1;
  
  let multiplier = 1;
  
  // Check luck booster
  const now = Date.now();
  if (user.luckBooster && new Date(user.luckBooster) > now) {
    multiplier += 0.3; // 30% boost
  }
  
  return multiplier;
}

/**
 * Get user party multiplier info
 */
function getUserPartyMultiplierInfo(user) {
  if (!user) return { multiplier: 1, members: 0 };
  
  const party = user.party || {};
  const members = safeGetArray(party, 'members', []);
  const memberCount = members.length;
  
  // Base multiplier: 1% per member, max 10%
  const multiplier = Math.min(1 + (memberCount * 0.01), 1.1);
  
  return {
    multiplier,
    members: memberCount,
    memberList: members
  };
}

/**
 * Process pet collection
 */
async function processPetCollection(userId) {
  try {
    const { getUser, safeUpdateUser } = require('./database');
    const user = await getUser(userId);
    if (!user) return { success: false, message: 'User not found!' };
    
    // Check if user owns a Pet Bot
    if (!user.hasPetBot) {
      return { success: false, message: 'You do not own a Pet Bot yet! Buy one from the shop to unlock pet features.' };
    }
    
    // Initialize petBot if it's false or doesn't exist
    if (user.hasPetBot && !user.petBot) {
      logger.warn('processPetCollection: Auto-initializing petBot for user with hasPetBot: true:', user._id);
      await safeUpdateUser(userId, {
        petBot: {
          name: 'Pet',
          color: '#0099ff',
          personality: 'happy',
          level: 1,
          xp: 0,
          lastCollection: 0,
          totalCoinsCollected: 0,
          collectionStreak: 0
        }
      });
      // Refresh user data after initialization
      const updatedUser = await getUser(userId);
      if (!updatedUser || !updatedUser.petBot) {
        return { success: false, message: 'Failed to initialize Pet Bot. Please try again.' };
      }
      user.petBot = updatedUser.petBot;
    }
    
    const now = Date.now();
    const lastCollection = user.petBot.lastCollection || 0;
    const cooldown = 60 * 60 * 1000; // 1 hour cooldown
    
    if (now - lastCollection < cooldown) {
      const msLeft = cooldown - (now - lastCollection);
      const mins = Math.floor(msLeft / 60000);
      const secs = Math.floor((msLeft % 60000) / 1000);
      return { 
        success: false, 
        message: `⏳ You must wait ${mins}m ${secs}s before collecting from your pet again.` 
      };
    }
    
    const petLevel = user.petBot.level || 1;
    // New reward formula: 100*level * (1+0.1*streak, max 2x) * all multipliers
    const baseReward = 100 * petLevel;
    const streakBonus = 1 + Math.min((user.petBot.collectionStreak || 0) * 0.1, 1); // up to 2x
    const multiplier = getTotalCoinMultiplier(user) * getSeasonalInfo().multiplier;
    const finalReward = Math.floor(baseReward * streakBonus * multiplier);
    
    // Calculate XP gain
    const xpGain = calculatePetXpGain(petLevel, 'collect');
    const currentXp = (user.petBot.xp || 0) + xpGain;
    const xpForNextLevel = calculatePetLevelXp(petLevel);
    
    // Check for level up
    let leveledUp = false;
    let newLevel = petLevel;
    if (currentXp >= xpForNextLevel) {
      leveledUp = true;
      newLevel = petLevel + 1;
    }
    
    // Get seasonal multiplier
    const seasonalInfo = getSeasonalInfo();
    const seasonalMultiplier = seasonalInfo.multiplier;
    
    // Calculate total collected
    const totalCollected = (user.petBot.totalCoinsCollected || 0) + finalReward;
    
    // Update user
    const updateData = {
      $inc: { 
        coins: finalReward,
        'petBot.totalCoinsCollected': finalReward
      },
      'petBot.lastCollection': now,
      'petBot.xp': leveledUp ? currentXp - xpForNextLevel : currentXp
    };
    
    if (leveledUp) {
      updateData['petBot.level'] = newLevel;
    }
    
    await safeUpdateUser(userId, updateData);
    
    return { 
      success: true, 
      reward: finalReward,
      xpGain: xpGain,
      seasonalMultiplier: seasonalMultiplier,
      leveledUp: leveledUp,
      newLevel: newLevel,
      totalCollected: totalCollected
    };
  } catch (error) {
    logger.error('Error in processPetCollection:', error);
    return { success: false, message: 'Database error occurred. Please try again later.' };
  }
}

/**
 * Calculate pet level XP
 */
function calculatePetLevelXp(level) {
  return 100 + 50 * (level - 1);
}

/**
 * Calculate pet XP gain
 */
function calculatePetXpGain(level, action) {
  const baseXp = { collect: 10, talk: 5, play: 15 };
  return baseXp[action] || 5;
}

module.exports = {
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
}; 