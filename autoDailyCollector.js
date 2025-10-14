const mongoose = require('mongoose');
const { User } = require('./database/db');
const { GlobalState } = require('./database/globalState');
const logger = require('./logger');
require('dotenv').config();

// Connect to database
async function connectToDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/kelonomy';
    await mongoose.connect(mongoUri);
    logger.info('Auto Daily Collector: Connected to MongoDB successfully');
    return true;
  } catch (error) {
    logger.error('Auto Daily Collector: Failed to connect to MongoDB:', error.message);
    return false;
  }
}

function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

// Get or create global state for auto daily collector timing
async function getAutoDailyState() {
  try {
    let state = await GlobalState.findOne({ key: 'autoDailyState' });
    if (!state) {
      state = new GlobalState({
        key: 'autoDailyState',
        value: {
          lastExecution: null,
          nextExecution: Date.now() + (60 * 60 * 1000) // 1 hour from now
        }
      });
      await state.save();
    }
    return state.value;
  } catch (error) {
    logger.error('Auto Daily Collector: Error getting state:', error);
    return {
      lastExecution: null,
      nextExecution: Date.now() + (60 * 60 * 1000)
    };
  }
}

// Update auto daily state after execution
async function updateAutoDailyState() {
  try {
    const now = Date.now();
    const nextExecution = now + (60 * 60 * 1000); // 1 hour from now
    
    await GlobalState.findOneAndUpdate(
      { key: 'autoDailyState' },
      {
        value: {
          lastExecution: now,
          nextExecution: nextExecution
        }
      },
      { upsert: true }
    );
    
    logger.info(`Auto Daily Collector: State updated. Next execution scheduled for: ${new Date(nextExecution).toISOString()}`);
  } catch (error) {
    logger.error('Auto Daily Collector: Error updating state:', error);
  }
}

// Calculate daily rewards (same logic as /daily command)
async function calculateDailyRewards(user) {
  try {
    const { secureRandomInt } = require('./utils/secureRandom');
    let coins = secureRandomInt(150, 301); // 150-300 coins
    let xp = secureRandomInt(25, 76); // 25-75 XP
    
    // Apply multipliers
    const { getUserPartyMultiplierInfo, getTotalCoinMultiplier, getXpMultiplier } = require('./utils/utils');
    const { multiplier } = getUserPartyMultiplierInfo(user);
    const totalMultiplier = getTotalCoinMultiplier(user) * multiplier;
    const xpMultiplier = getXpMultiplier(user);
    
    coins = Math.round(coins * totalMultiplier);
    xp = Math.round(xp * xpMultiplier);
    
    return { coins, xp };
  } catch (error) {
    logger.error('Auto Daily Collector: Error calculating rewards:', error);
    return { coins: 150, xp: 25 }; // Fallback values
  }
}

// Main auto daily collection function
async function autoDailyCollect() {
  try {
    if (!isDatabaseConnected()) {
      logger.warn('Auto Daily Collector: Database not connected, skipping');
      return;
    }

    logger.info('Auto Daily Collector: Starting auto daily collection...');
    
    // Find all users with Auto Collector enabled (date in the future)
    const users = await User.find({ autoCollector: { $gt: new Date() } }).maxTimeMS(30000);
    logger.info(`Auto Daily Collector: Found ${users.length} users with Auto Collector`);
    
    let processedCount = 0;
    let claimedCount = 0;
    const ONE_DAY_MS = 86400000;
    
    for (const user of users) {
      if (!user || typeof user !== 'object' || !user._id) {
        continue;
      }
      
      processedCount++;
      
      // Check if daily can be claimed
      const now = Date.now();
      let last = user.last_daily ? Number(user.last_daily) : 0;
      
      // Ensure last_daily is in milliseconds
      if (last > 0 && last < 1000000000000) {
        last = last * 1000;
      }
      
      if (now - last < ONE_DAY_MS) {
        // Daily not ready yet
        continue;
      }
      
      // Calculate rewards
      const { coins, xp } = await calculateDailyRewards(user);
      
      // Update user with daily rewards
      try {
        let streak = Number(user.dailyStreak) || 0;
        let lastStreak = Number(user.lastDailyStreak) || 0;
        
        // Update streak
        if (lastStreak && now - lastStreak < 2 * ONE_DAY_MS) {
          streak += 1;
        } else {
          streak = 1;
        }
        
        const MAX_STREAK = 365;
        if (streak > MAX_STREAK) {
          streak = MAX_STREAK;
        }
        
        await User.findByIdAndUpdate(user._id, {
          $inc: { coins, xp },
          last_daily: now,
          dailyStreak: streak,
          lastDailyStreak: now
        });
        
        claimedCount++;
        logger.info(`Auto Daily Collector: User ${user._id} claimed ${coins} coins and ${xp} XP (streak: ${streak})`);
        
      } catch (err) {
        logger.error(`Auto Daily Collector: Error updating user ${user._id}:`, err);
      }
    }
    
    // Update the auto daily state after successful execution
    await updateAutoDailyState();
    
    logger.info(`Auto Daily Collector: Completed - ${processedCount} users processed, ${claimedCount} dailies claimed`);
  } catch (err) {
    logger.error('Auto Daily Collector: Error in autoDailyCollect:', err);
  }
}

// Initialize auto daily collector with persistent timing
async function initializeAutoDailyCollector() {
  try {
    await connectToDatabase();
    
    const state = await getAutoDailyState();
    const now = Date.now();
    
    // If next execution time has passed, run immediately
    if (state.nextExecution && now >= state.nextExecution) {
      logger.info('Auto Daily Collector: Execution is overdue, running immediately');
      await autoDailyCollect();
    } else {
      // Calculate time until next execution
      const timeUntilNext = state.nextExecution ? Math.max(0, state.nextExecution - now) : 60 * 60 * 1000;
      const minutesUntilNext = Math.ceil(timeUntilNext / (60 * 1000));
      
      logger.info(`Auto Daily Collector: Next execution in ${minutesUntilNext} minutes (${new Date(state.nextExecution || now + timeUntilNext).toISOString()})`);
    }
    
    // Set up the interval to check every hour
    setInterval(async () => {
      const currentState = await getAutoDailyState();
      const currentTime = Date.now();
      
      if (currentState.nextExecution && currentTime >= currentState.nextExecution) {
        await autoDailyCollect();
      }
    }, 60 * 60 * 1000); // Check every hour
    
    logger.info('Auto Daily Collector: System initialized with persistent timing');
  } catch (error) {
    logger.error('Auto Daily Collector: Error initializing:', error);
    // Fallback to regular interval if database fails
    setInterval(autoDailyCollect, 60 * 60 * 1000);
    logger.info('Auto Daily Collector: Fallback to regular 1-hour interval');
  }
}

// Export for use in index.js
module.exports = {
  initializeAutoDailyCollector,
  autoDailyCollect
};

// Run if this file is executed directly
if (require.main === module) {
  initializeAutoDailyCollector().catch(error => {
    console.error('Auto Daily Collector: Failed to initialize:', error);
    process.exit(1);
  });
} 