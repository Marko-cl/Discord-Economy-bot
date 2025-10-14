// Market and trading handlers

const { EmbedBuilder } = require('discord.js');
const { FISH_TYPES, FISH_RARITIES } = require('../constants');
const { calculateFishValue } = require('../rewards');
const { getFishWeight } = require('../weights');
const { reply } = require('../../../utils/formatting');
const logger = require('../../../logger');
const { validators } = require('../../../utils/validation');
const { checkRateLimit } = require('../../../utils/rateLimiting');

function formatWeight(kg) {
  if (kg >= 1000) return (kg / 1000).toFixed(2) + ' tons';
  if (kg >= 1) return kg.toFixed(2) + ' kg';
  return (kg * 1000).toFixed(0) + ' g';
}

const rateLimiter = (userId) => checkRateLimit(userId, 'fishing_market', 5, 5000);

// Market handler
const handleMarket = async (interaction) => {
  try {
    const userId = interaction.user.id;
    
    if (!validators.userId(userId)) {
      return await reply(interaction, {
        content: '❌ Invalid user ID!',
        flags: 1 << 6
      });
    }

    const rateLimitResult = rateLimiter(userId);
    if (!rateLimitResult.allowed) {
      return await reply(interaction, {
        content: '⏳ You are being rate limited. Please wait before using the market again.',
        flags: 1 << 6
      });
    }
  
    // Group fish by rarity
    const fishByRarity = {};
    for (const rarity of Object.keys(FISH_RARITIES)) {
      fishByRarity[rarity] = FISH_TYPES.filter(fish => fish.rarity === rarity);
    }
    
    // Create market embed
    const embed = new EmbedBuilder()
      .setTitle('🏪 Fish Market')
      .setColor(0xffd700)
      .setDescription('Current fish prices at the market. Prices may vary based on your equipment!');
    
    // Add fish by rarity
    for (const [rarity, fishes] of Object.entries(fishByRarity)) {
      if (fishes.length > 0) {
        const rarityInfo = FISH_RARITIES[rarity];
        const fishList = fishes.map(fish => {
          const baseValue = calculateFishValue(fish, { boosters: [], activeBooster: null });
          const weight = getFishWeight(fish.name.toLowerCase().replace(/\s+/g, '_'));
          return `${fish.emoji} **${fish.name}** • ${baseValue} coins • ${formatWeight(weight)}`;
        }).join('\n');
        
        embed.addFields({
          name: `${rarityInfo.emoji} ${rarityInfo.label}`,
          value: fishList,
          inline: false
        });
      }
    }
    
    // Add footer with tips
    embed.setFooter({ text: '💡 Tip: Use better rods and boosters to increase fish value!' });
    
    return await reply(interaction, { embeds: [embed] });
  } catch (error) {
    logger.error('Error in handleMarket:', error);
    return await reply(interaction, {
      content: '❌ An error occurred while processing your market command!',
      flags: 1 << 6
    });
  }
};

module.exports = {
  handleMarket
}; 