// Information and help handlers

const { EmbedBuilder } = require('discord.js');
const { getUserFishingData } = require('../database');
const { FISH_TYPES } = require('../constants');
const { User } = require('../../../database/db');
const { reply } = require('../../../utils/formatting');
const logger = require('../../../logger');
const { validators } = require('../../../utils/validation');
const { checkRateLimit } = require('../../../utils/rateLimiting');
const { withSafeReply } = require('../../../utils/safeReply');

const rateLimiter = (userId) => checkRateLimit(userId, 'fishing_info', 5, 5000);

// Help handler
const handleHelp = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  if (!validators.userId(userId)) {
    return await reply(interaction, { content: '❌ Invalid user ID!', flags: 1 << 6 });
  }
  if (!rateLimiter(userId)) {
    return await reply(interaction, { content: '⏳ You are being rate limited. Please wait before using help again.', flags: 1 << 6 });
  }
  const embed = new EmbedBuilder()
    .setTitle('🎣 Fishing Help')
    .setColor(0x87CEEB)
    .setDescription('Welcome to the fishing system! Here are all the available commands:')
    .addFields(
      { 
        name: '🎣 Core Commands', 
        value: '`/fish` - Go fishing!\n`/fish inventory` - View your fish collection\n`/fish sell` - Sell all your fish', 
        inline: false 
      },
      { 
        name: '⚙️ Equipment', 
        value: '`/fish rod info` - View your fishing rod\n`/fish rod upgrade` - Upgrade your rod\n`/fish bait info` - View active bait\n`/fish bait activate <bait>` - Activate bait\n`/fish booster info` - View active booster\n`/fish booster activate <booster>` - Activate booster', 
        inline: false 
      },
      { 
        name: '📊 Information', 
        value: '`/fish market` - View fish prices\n`/fish leaderboard` - View fishing leaderboard', 
        inline: false 
      },
      { 
        name: '💡 Tips', 
        value: '• Better rods catch rarer fish\n• Bait improves catch rates\n• Boosters provide temporary bonuses\n• Complete collections for rewards\n• Sell fish to earn coins', 
        inline: false 
      }
    )
    .setFooter({ text: 'Happy fishing!' });
  
  await reply(interaction, { embeds: [embed] });
});

// Leaderboard handler
const handleLeaderboard = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  if (!validators.userId(userId)) {
    return await reply(interaction, { content: '❌ Invalid user ID!', flags: 1 << 6 });
  }
  if (!rateLimiter(userId)) {
    return await reply(interaction, { content: '⏳ You are being rate limited. Please wait before using leaderboard again.', flags: 1 << 6 });
  }
  // Get all users with fishing data
  const users = await User.find({}).limit(100);
  const fishingStats = [];
  
  for (const user of users) {
    try {
      const userData = await getUserFishingData(user._id);
      if (userData && userData.fishLog) {
        let totalFish = 0;
        let uniqueFish = 0;
        let totalValue = 0;
        
        for (const [fishId, fishData] of Object.entries(userData.fishLog)) {
          if (fishData.count > 0) {
            totalFish += fishData.count;
            uniqueFish++;
            
            // Calculate value (simplified)
            const fish = FISH_TYPES.find(f => f.name.toLowerCase().replace(/\s+/g, '_') === fishId);
            if (fish) {
              totalValue += fish.baseValue * fishData.count;
            }
          }
        }
        
        if (totalFish > 0) {
          fishingStats.push({
            userId: user._id,
            username: user.username || 'Unknown',
            totalFish,
            uniqueFish,
            totalValue
          });
        }
      }
    } catch (error) {
      logger.error('Error processing user for fishing leaderboard:', error);
    }
  }
  
  // Sort by total fish caught
  fishingStats.sort((a, b) => b.totalFish - a.totalFish);
  
  // Create leaderboard embed
  const embed = new EmbedBuilder()
    .setTitle('🏆 Fishing Leaderboard')
    .setColor(0xffd700)
    .setDescription('Top fishers by total fish caught!');
  
  if (fishingStats.length === 0) {
    embed.addFields({
      name: 'No Data',
      value: 'No fishing data available yet. Start fishing to appear on the leaderboard!',
      inline: false
    });
  } else {
    const top10 = fishingStats.slice(0, 10);
    const leaderboardText = top10.map((user, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      return `${medal} **${user.username}** • ${user.totalFish} fish • ${user.uniqueFish} unique • ${user.totalValue.toLocaleString()} coins`;
    }).join('\n');
    
    embed.addFields({
      name: 'Top Fishers',
      value: leaderboardText,
      inline: false
    });
  }
  
  embed.setFooter({ text: 'Updated in real-time' });
  
  await reply(interaction, { embeds: [embed] });
});

module.exports = {
  handleHelp,
  handleLeaderboard
}; 