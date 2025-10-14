// Quest system for Discord bot
const { safeUpdateUser } = require('./database');
const logger = require('../logger');
const { validators } = require('./validation');

// Central quest definitions
const QUESTS = {
  // Economy/earning
  work: { goal: 2, reward: 120, instruction: 'Use `/work` to earn coins' },
  beg: { goal: 3, reward: 60, instruction: 'Use `/beg` to ask for coins' },
  fishing: { goal: 2, reward: 100, instruction: 'Use `/fish` to go fishing' },
  dig: { goal: 2, reward: 100, instruction: 'Use `/dig` to search for items' },
  quiz: { goal: 2, reward: 120, instruction: 'Use `/quiz` to answer questions' },
  slots: { goal: 2, reward: 80, instruction: 'Use `/slots` to play slot machine' },
  bet: { goal: 1, reward: 100, instruction: 'Use `/bet` to gamble on heads/tails' },
  heist: { goal: 1, reward: 300, instruction: 'Use `/heist` to rob with a team' },
  rob: { goal: 1, reward: 300, instruction: 'Use `/rob` to steal from others' },
  trade: { goal: 1, reward: 200, instruction: 'Use `/trade` to exchange with others' },
  shop: { goal: 1, reward: 100, instruction: 'Use `/shop` to buy items' },
  // Social/interaction
  gift: { goal: 1, reward: 100, instruction: 'Use `/gift` to give coins to others' },
  duel: { goal: 1, reward: 150, instruction: 'Use `/duel` to fight other players' },
  leaderboard_view: { goal: 1, reward: 50, instruction: 'Use `/leaderboard` to view top players' },
  profile_view: { goal: 1, reward: 40, instruction: 'Use `/profile` to view your stats' },
  inventory_check: { goal: 1, reward: 40, instruction: 'Use `/inventory` to check your items' },
  // Activity/utility
  help_command: { goal: 1, reward: 30, instruction: 'Use `/help` to see all commands' },
  ping_command: { goal: 1, reward: 20, instruction: 'Use `/pinglu` to check bot status' },
  // More advanced/engagement
  fishing_success: { goal: 1, reward: 200, instruction: 'Use `/fish` to catch fish successfully' },
  dig_success: { goal: 1, reward: 200, instruction: 'Use `/dig` to find items successfully' },
  quiz_master: { goal: 4, reward: 300, instruction: 'Use `/quiz` to win 4 times' },
  slots_lucky: { goal: 1, reward: 300, instruction: 'Use `/slots` to get lucky' },
  heist_leader: { goal: 1, reward: 400, instruction: 'Use `/heist` to lead a successful heist' },
  trade_merchant: { goal: 3, reward: 400, instruction: 'Use `/trade` 3 times' },
  gift_multiple: { goal: 2, reward: 300, instruction: 'Use `/gift` 2 times' },
  shop_spender: { goal: 2, reward: 200, instruction: 'Use `/shop` to buy items 2 times' },
  duel_master: { goal: 2, reward: 300, instruction: 'Use `/duel` to win 2 times' },
  // Legacy/other quests (keep for compatibility)
  gift_legend: { goal: 10, reward: 5000, instruction: 'Use `/gift` 10 times' },
  trade_expert: { goal: 10, reward: 5000, instruction: 'Use `/trade` 10 times' },
  trade_legend: { goal: 25, reward: 10000, instruction: 'Use `/trade` 25 times' },
  rob_bandit: { goal: 3, reward: 1000, instruction: 'Use `/rob` 3 times' },
  rob_expert: { goal: 10, reward: 5000, instruction: 'Use `/rob` 10 times' },
  balance_check: { goal: 1, reward: 100, instruction: 'Use `/balance` to check your coins' },
  daily: { goal: 1, reward: 200, instruction: 'Use `/daily` to collect daily reward' },
  beg_success: { goal: 1, reward: 200, instruction: 'Use `/beg` to successfully get coins' },
  beg_persistent: { goal: 5, reward: 500, instruction: 'Use `/beg` 5 times' },
  beg_legend: { goal: 10, reward: 1000, instruction: 'Use `/beg` 10 times' },
  work_bonus: { goal: 3, reward: 500, instruction: 'Use `/work` 3 times' },
  work_hard: { goal: 10, reward: 2000, instruction: 'Use `/work` 10 times' },
  work_legend: { goal: 25, reward: 5000, instruction: 'Use `/work` 25 times' },
  quiz_win: { goal: 2, reward: 300, instruction: 'Use `/quiz` to win 2 times' },
  quiz_game_win: { goal: 2, reward: 300, instruction: 'Use `/quiz` to win 2 times' },
  // Premium/use item quests
  loot_opener: { goal: 1, reward: 50, instruction: 'Use `/use` on a Loot Crate' },
  premium_user: { goal: 5, reward: 500, instruction: 'Use premium items 5 times' },
  premium_master: { goal: 15, reward: 1500, instruction: 'Use premium items 15 times' },
  premium_legend: { goal: 50, reward: 5000, instruction: 'Use premium items 50 times' },
  mystery_explorer: { goal: 1, reward: 100, instruction: 'Use `/use` on a Mystery Box' },
  seed_collector: { goal: 1, reward: 75, instruction: 'Use `/use` on a Box of Seeds' },
  joke_teller: { goal: 1, reward: 50, instruction: 'Use `/use` on a Joke Book' },
  booster_user: { goal: 3, reward: 300, instruction: 'Use boosters 3 times' },
  booster_master: { goal: 10, reward: 1000, instruction: 'Use boosters 10 times' },
  meme_collector: { goal: 1, reward: 100, instruction: 'Use `/use` on a Meme Pack' },
  meme_generator: { goal: 1, reward: 150, instruction: 'Use `/meme` to generate a meme' },
  gamble_player: { goal: 1, reward: 150, instruction: 'Use `/bet` to gamble' },
  gamble_master: { goal: 5, reward: 500, instruction: 'Use `/gamble` 5 times' },
  gamble_legend: { goal: 20, reward: 2000, instruction: 'Use `/gamble` 20 times' },
  mine_start: { goal: 1, reward: 200, instruction: 'Use `/mine start` to begin mining' },
  mine_collect: { goal: 1, reward: 500, instruction: 'Use `/mine collect` to collect mining rewards' },
  shop_seller: { goal: 1, reward: 50, instruction: 'Use `/sell` to sell items' },
  // Admin quests (for owner commands)
  give_coins: { goal: 1, reward: 0, instruction: 'Use `/give` to give coins (Admin only)' },
  give_xp: { goal: 1, reward: 0, instruction: 'Use `/give` to give XP (Admin only)' },
  give_item: { goal: 1, reward: 0, instruction: 'Use `/give` to give items (Admin only)' },
  remove_item: { goal: 1, reward: 0, instruction: 'Use `/remove` to remove items (Admin only)' },
  remove_coins: { goal: 1, reward: 0, instruction: 'Use `/remove` to remove coins (Admin only)' },
  remove_xp: { goal: 1, reward: 0, instruction: 'Use `/remove` to remove XP (Admin only)' },
  // Additional quests for commands
  sell: { goal: 1, reward: 50, instruction: 'Use `/sell` to sell items' },
  sell_master: { goal: 5, reward: 300, instruction: 'Use `/sell` 5 times' },
  shop_legend: { goal: 10, reward: 1000, instruction: 'Use `/shop` 10 times' },
  seasonal_check: { goal: 1, reward: 100, instruction: 'Use `/seasonal` to check events' },
  prestige: { goal: 1, reward: 500, instruction: 'Use `/prestige` to reset progress' },
  // Game-specific quests
  fishing_champion: { goal: 5, reward: 500, instruction: 'Use `/fish` 5 times' },
  fishing_legend: { goal: 20, reward: 2000, instruction: 'Use `/fish` 20 times' },
  dig_explorer: { goal: 5, reward: 500, instruction: 'Use `/dig` 5 times' },
  dig_legend: { goal: 20, reward: 2000, instruction: 'Use `/dig` 20 times' },
  slots_expert: { goal: 5, reward: 400, instruction: 'Use `/slots` 5 times' },
  slots_legend: { goal: 20, reward: 2000, instruction: 'Use `/slots` 20 times' },
  duel_legend: { goal: 20, reward: 2000, instruction: 'Use `/duel` 20 times' },
  heist_expert: { goal: 5, reward: 800, instruction: 'Use `/heist` 5 times' },
  heist_legend: { goal: 20, reward: 3000, instruction: 'Use `/heist` 20 times' },
  bet_high_roller: { goal: 1, reward: 200, instruction: 'Use `/bet` to gamble' },
  bet_expert: { goal: 5, reward: 600, instruction: 'Use `/bet` 5 times' },
  bet_legend: { goal: 20, reward: 2500, instruction: 'Use `/bet` 20 times' },
  rob_master: { goal: 5, reward: 800, instruction: 'Use `/rob` 5 times' },
  rob_legend: { goal: 20, reward: 3000, instruction: 'Use `/rob` 20 times' },
};

/**
 * Atomic quest progress tracking (for use in transactions)
 */
async function progressQuestsAtomic(userId, questIds, session) {
  if (!validators.userId(userId) || !Array.isArray(questIds)) return { updated: false, rewards: 0 };
  
  try {
    const { getUser } = require('./database');
    const user = await getUser(userId);
    if (!user) return { updated: false, rewards: 0 };
    
    const quests = user.quests || {};
    const dailyProgress = quests.dailyProgress || {};
    let updated = false;
    let totalRewards = 0;
    
    for (const questId of questIds) {
      if (!QUESTS[questId]) continue;
      
      const currentProgress = dailyProgress[questId] || 0;
      const newProgress = currentProgress + 1;
      dailyProgress[questId] = newProgress;
      updated = true;
      
      // Check for completion
      if (newProgress >= QUESTS[questId].goal) {
        const completed = quests.dailyCompleted || [];
        if (!completed.includes(questId)) {
          completed.push(questId);
          quests.dailyCompleted = completed;
          
          // Track reward for atomic update
          if (QUESTS[questId].reward > 0) {
            totalRewards += QUESTS[questId].reward;
          }
        }
      }
    }
    
    if (updated) {
      const updateData = { 
        'quests.dailyProgress': dailyProgress 
      };
      
      // Include quest completion in update if any
      if (totalRewards > 0) {
        updateData['quests.dailyCompleted'] = quests.dailyCompleted;
        updateData['$inc'] = { coins: totalRewards };
      }
      
      await safeUpdateUser(userId, updateData, { session });
    }
    
    return { updated, rewards: totalRewards };
  } catch (error) {
    logger.error('Error in progressQuestsAtomic:', error);
    return { updated: false, rewards: 0 };
  }
}

/**
 * Enhanced quest progress tracking with better error handling
 */
async function progressQuests(userId, questIds, interaction) {
  if (!validators.userId(userId) || !Array.isArray(questIds)) return;
  
  try {
    const { getUser } = require('./database');
    const user = await getUser(userId);
    if (!user) return;
    
    const quests = user.quests || {};
    const dailyProgress = quests.dailyProgress || {};
    let updated = false;
    let completedQuests = [];
    
    for (const questId of questIds) {
      if (!QUESTS[questId]) {
        logger.warn(`Unknown quest ID: ${questId} for user ${userId}`);
        continue;
      }
      
      const currentProgress = dailyProgress[questId] || 0;
      const newProgress = currentProgress + 1;
      dailyProgress[questId] = newProgress;
      updated = true;
      
      // Check for completion
      if (newProgress >= QUESTS[questId].goal) {
        const completed = quests.dailyCompleted || [];
        if (!completed.includes(questId)) {
          completed.push(questId);
          quests.dailyCompleted = completed;
          completedQuests.push(questId);
          
          // Award reward
          if (QUESTS[questId].reward > 0) {
            await safeUpdateUser(userId, { 
              $inc: { coins: QUESTS[questId].reward },
              quests: { ...quests, dailyCompleted: completed }
            });
            
            // Notify user of quest completion if interaction is available
            if (interaction && typeof interaction.followUp === 'function' && (!interaction.replied && !interaction.ephemeral)) {
              try {
                await interaction.followUp({ 
                  content: `🎉 **Quest Completed!** ${questId} - +${QUESTS[questId].reward} coins!`,
                  flags: 1 << 6 
                });
              } catch (notifyError) {
                logger.warn('Failed to notify quest completion:', notifyError);
              }
            }
          }
        }
      }
    }
    
    if (updated) {
      await safeUpdateUser(userId, { 
        'quests.dailyProgress': dailyProgress 
      });
    }
    
    // Log quest completions
    if (completedQuests.length > 0) {
      logger.info(`User ${userId} completed quests: ${completedQuests.join(', ')}`);
    }
    
  } catch (error) {
    logger.error('Error in progressQuests:', error);
  }
}

module.exports = {
  QUESTS,
  progressQuests,
  progressQuestsAtomic
}; 