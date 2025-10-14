/**
 * Permanent Leaderboard Service
 * Automatically refreshes leaderboard data every hour
 */

const logger = require('../logger');
const { User, PermanentLeaderboard } = require('../database/db');
const { getFishWeight } = require('../cogs/fishing/weights');

// Function to calculate total XP for a user
function calculateTotalXP(user) {
  let total = 0;
  for (let i = 0; i < (user.level || 0); i++) {
    total += 1000 + 250 * i;
  }
  return total + (user.xp || 0);
}

// Function to refresh leaderboard data
async function refreshLeaderboardData(metric) {
  try {
    let users;
    let leaderboardData = [];

    if (metric === 'coins') {
      users = await User.find().sort({ coins: -1 }).limit(10);
      leaderboardData = users.map((user, index) => ({
        userId: user._id,
        username: user.username || 'Unknown',
        value: user.coins || 0,
        rank: index + 1
      }));
    } else if (metric === 'xp') {
      users = await User.find();
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
      users = await User.find().sort({ prestigeLevel: -1, prestigeMultiplier: -1 }).limit(10);
      leaderboardData = users.map((user, index) => ({
        userId: user._id,
        username: user.username || 'Unknown',
        value: user.prestigeLevel || 1,
        rank: index + 1
      }));
    } else if (metric === 'fish_weight') {
      users = await User.find({}, { _id: 1, username: 1, fishLog: 1 });
      
      // Calculate total fish weight for each user
      const userWeights = users.map(user => {
        let totalWeight = 0;
        const log = user.fishLog || {};
        for (const [fishId, data] of Object.entries(log)) {
          totalWeight += getFishWeight(fishId) * (data.count || 0);
        }
        return {
          userId: user._id,
          username: user.username || 'Unknown',
          value: totalWeight
        };
      });
      
      // Sort by totalWeight descending and take top 10
      userWeights.sort((a, b) => b.value - a.value);
      leaderboardData = userWeights.slice(0, 10).map((entry, index) => ({
        userId: entry.userId,
        username: entry.username,
        value: entry.value,
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
      { upsert: true, new: true }
    );

    logger.info(`Permanent leaderboard refreshed for ${metric}`);
    return leaderboardData;
  } catch (error) {
    logger.error(`Error refreshing leaderboard data for ${metric}:`, error);
    throw error;
  }
}

// Function to refresh all leaderboards
async function refreshAllLeaderboards() {
  try {
    logger.info('Starting scheduled leaderboard refresh...');
    
    const metrics = ['coins', 'xp', 'prestige', 'fish_weight'];
    const promises = metrics.map(metric => refreshLeaderboardData(metric));
    
    await Promise.all(promises);
    
    logger.info('All permanent leaderboards refreshed successfully');
  } catch (error) {
    logger.error('Error refreshing all leaderboards:', error);
  }
}

// Function to initialize the leaderboard service
function initializeLeaderboardService() {
  logger.info('Initializing permanent leaderboard service...');
  
  // Refresh all leaderboards on startup
  refreshAllLeaderboards().catch(error => {
    logger.error('Error during initial leaderboard refresh:', error);
  });
  
  // Set up hourly refresh interval
  const hourlyInterval = 60 * 60 * 1000; // 1 hour in milliseconds
  
  setInterval(() => {
    refreshAllLeaderboards();
  }, hourlyInterval);
  
  logger.info(`Permanent leaderboard service initialized. Refreshing every ${hourlyInterval / (60 * 60 * 1000)} hour(s)`);
}

// Function to get or refresh leaderboard data (for use in commands)
async function getLeaderboardData(metric) {
  try {
    let leaderboard = await PermanentLeaderboard.findById(metric);
    
    // If no data exists or it's time to refresh, update the data
    if (!leaderboard || new Date() >= leaderboard.nextUpdate) {
      return await refreshLeaderboardData(metric);
    }
    
    return leaderboard.data;
  } catch (error) {
    logger.error(`Error getting leaderboard data for ${metric}:`, error);
    throw error;
  }
}

module.exports = {
  refreshLeaderboardData,
  refreshAllLeaderboards,
  initializeLeaderboardService,
  getLeaderboardData,
  calculateTotalXP
}; 