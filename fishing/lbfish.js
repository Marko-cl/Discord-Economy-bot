const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { withSafeReply } = require('../../utils/safeReply');
const { validators } = require('../../utils/validation');
const { isUserBlacklisted, progressQuests } = require('../../utils/utils');
const { User, PermanentLeaderboard } = require('../../database/db');
const { getFishWeight } = require('./weights');
const logger = require('../../logger');
const { checkRateLimit } = require('../../utils/rateLimiting');

const rateLimiter = (userId) => checkRateLimit(userId, 'lbfish', 10, 5000); // 10 uses per 5 seconds for admin commands

function formatWeight(kg) {
  if (kg >= 1000) return (kg / 1000).toFixed(2) + ' tons';
  if (kg >= 1) return kg.toFixed(2) + ' kg';
  return (kg * 1000).toFixed(0) + ' g';
}

// Function to refresh fish leaderboard data
async function refreshFishLeaderboardData() {
  try {
    const users = await User.find({}, { _id: 1, username: 1, fishLog: 1 });
    
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
    const leaderboardData = userWeights.slice(0, 10).map((entry, index) => ({
      userId: entry.userId,
      username: entry.username,
      value: entry.value,
      rank: index + 1
    }));

    const nextUpdate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    await PermanentLeaderboard.findByIdAndUpdate(
      'fish_weight',
      {
        data: leaderboardData,
        lastUpdated: new Date(),
        nextUpdate: nextUpdate,
        totalUsers: users.length
      },
      { upsert: true, new: true }
    );

    logger.info('Permanent fish weight leaderboard refreshed');
    return leaderboardData;
  } catch (error) {
    logger.error('Error refreshing fish leaderboard data:', error);
    throw error;
  }
}

// Function to get or refresh fish leaderboard data
async function getFishLeaderboardData() {
  try {
    let leaderboard = await PermanentLeaderboard.findById('fish_weight');
    
    // If no data exists or it's time to refresh, update the data
    if (!leaderboard || new Date() >= leaderboard.nextUpdate) {
      return await refreshFishLeaderboardData();
    }
    
    return leaderboard.data;
  } catch (error) {
    logger.error('Error getting fish leaderboard data:', error);
    throw error;
  }
}

module.exports = [{
  data: new SlashCommandBuilder()
    .setName('lbfish')
    .setDescription('OWNER ONLY: Show the leaderboard of most total fish weight captured by users!'),
  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      return { content: '❌ Invalid user ID detected.', flags: 1 << 6 };
    }

    const ownerId = require('../../utils/utils').constants.OWNER_ID;
    if (userId !== ownerId) {
      return { content: 'Only the bot owner can use this command.', flags: 1 << 6 };
    }
    
    await progressQuests(userId, ['leaderboard_view', 'fishing_champion'], interaction).catch(e => logger.error('progressQuests error:', e));
    
    // Get leaderboard data
    let leaderboardData;
    try {
      leaderboardData = await getFishLeaderboardData();
    } catch (err) {
      logger.error('DB error loading lbfish data:', err);
      return { content: 'Database error: Could not load leaderboard data. Please try again later.', flags: 1 << 6 };
    }

    if (!leaderboardData || leaderboardData.length === 0) {
      return { content: 'No fish weight data available yet. Please try again later.', flags: 1 << 6 };
    }

    // Create leaderboard description
    const entries = leaderboardData.map((entry) => {
      const rankEmoji = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `${entry.rank}.`;
      return `${rankEmoji} <@${entry.userId}> — **${formatWeight(entry.value)}**`;
    });

    // Get last update time
    let lastUpdated;
    try {
      const leaderboardDoc = await PermanentLeaderboard.findById('fish_weight');
      lastUpdated = leaderboardDoc ? leaderboardDoc.lastUpdated : new Date();
    } catch (err) {
      logger.error('Error getting last update time:', err);
      lastUpdated = new Date();
    }

    // Fun/funny footer
    const funFooters = [
      '🐟 The real heavyweights of the sea!',
      '🎣 Who needs a gym when you have fish like these?',
      '💪 These anglers are lifting the ocean!',
      '😂 Some of these fish are suspiciously heavy...',
      '🏆 Only the strongest survive the fishing wars!'
    ];
    const { secureRandomChoice } = require('../../utils/secureRandom');
    
    const embed = new EmbedBuilder()
      .setTitle('🏋️‍♂️ Permanent Fish Weight Leaderboard')
      .setDescription(entries.join('\n'))
      .setColor(0x1e90ff)
      .setFooter({ 
        text: `${secureRandomChoice(funFooters)} • Refreshes every hour • Last updated: ${lastUpdated.toLocaleString()} • Top 10 players` 
      })
      .setTimestamp();

    // Add user's position if not in top 10
    try {
      const user = await User.findById(userId);
      if (user) {
        let userTotalWeight = 0;
        const log = user.fishLog || {};
        for (const [fishId, data] of Object.entries(log)) {
          userTotalWeight += getFishWeight(fishId) * (data.count || 0);
        }
        
        // Calculate user's rank
        const allUsers = await User.find({}, { _id: 1, fishLog: 1 });
        const userWeights = allUsers.map(u => {
          let weight = 0;
          const userLog = u.fishLog || {};
          for (const [fishId, data] of Object.entries(userLog)) {
            weight += getFishWeight(fishId) * (data.count || 0);
          }
          return { userId: u._id, weight };
        });
        userWeights.sort((a, b) => b.weight - a.weight);
        const userRank = userWeights.findIndex(u => u.userId === userId) + 1;

        if (userRank > 10) {
          embed.addFields({
            name: 'Your Position',
            value: `You are ranked **#${userRank}** with **${formatWeight(userTotalWeight)}** of fish!`,
            inline: false
          });
        }
      }
    } catch (err) {
      logger.error('Error calculating user position:', err);
    }

    return { embeds: [embed] };
  }, { isUserBlacklisted, rateLimiter })
}]; 