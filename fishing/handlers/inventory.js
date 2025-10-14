// Inventory management handlers

const { EmbedBuilder } = require('discord.js');
const { getUserFishingData, updateUserFishingData } = require('../database');
const { FISH_TYPES, FISH_RARITIES } = require('../constants');
const { getCollectionReward } = require('../rewards');
const { getFishWeight } = require('../weights');
const { User } = require('../../../database/db');
const { formatKelocoins, reply } = require('../../../utils/utils');
const logger = require('../../../logger');
const { secureRandomChoice } = require('../../../utils/secureRandom');
const { validators } = require('../../../utils/validation');
const { checkRateLimit } = require('../../../utils/rateLimiting');
const { withSafeReply } = require('../../../utils/safeReply');

const rateLimiter = (userId) => checkRateLimit(userId, 'fishing_inventory', 5, 5000);

function formatWeight(kg) {
  if (kg >= 1000) return (kg / 1000).toFixed(2) + ' tons';
  if (kg >= 1) return kg.toFixed(2) + ' kg';
  return (kg * 1000).toFixed(0) + ' g';
}

// Main inventory handler
const handleInventory = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  if (!validators.userId(userId)) {
    return await reply(interaction, { content: '❌ Invalid user ID!', flags: 1 << 6 });
  }
  if (!rateLimiter(userId)) {
    return await reply(interaction, { content: '⏳ You are being rate limited. Please wait before using inventory again.', flags: 1 << 6 });
  }

  // Fetch user fishing data
  const userData = await getUserFishingData(userId);
  const fishInventory = userData?.fishInventory || {};
  const fishLog = userData?.fishLog || {}; // PERMANENT collection log
  const fishingCollectionCompleted = userData?.fishingCollectionCompleted || {};

  // Rarity order and emoji for progress bars
  const rarityOrder = [
    { key: 'COMMON', emoji: '🟩' },
    { key: 'UNCOMMON', emoji: '🟩' },
    { key: 'RARE', emoji: '🟦' },
    { key: 'EPIC', emoji: '🟪' },
    { key: 'LEGENDARY', emoji: '🟨' },
    { key: 'MYTHIC', emoji: '🟧' },
    { key: 'OMNIVERSAL', emoji: '🐋' }
  ];

  // Build fish cards for vertical layout
  let totalCaught = 0;
  let uniqueCaught = 0;
  let totalWeight = 0;
  const fishCards = [];
  const fishByRarity = {};
  for (const rarity of rarityOrder) fishByRarity[rarity.key] = [];
  for (const fish of FISH_TYPES) {
    const rarity = (fish.rarity || '').toUpperCase();
    if (!fishByRarity[rarity]) fishByRarity[rarity] = [];
    fishByRarity[rarity].push(fish);
  }

  for (const { key: rarity } of rarityOrder) {
    const fishes = fishByRarity[rarity] || [];
    for (const fish of fishes) {
      const fishId = fish.name.toLowerCase().replace(/\s+/g, '_');
      const logCount = fishLog[fishId]?.count || 0;
      const inventoryCount = fishInventory[fishId]?.count || 0;
      const weight = getFishWeight(fishId);
      if (logCount > 0) uniqueCaught++;
      totalCaught += logCount;
      totalWeight += weight * logCount;
      fishCards.push(
        `**${fish.emoji} ${fish.name}**\n` +
        `${inventoryCount} in inventory ・ ${FISH_RARITIES[rarity]?.label || rarity} ・ ${formatWeight(weight)}\n` +
        '......................'
      );
    }
  }

  // Arrange as a single vertical list
  const cardRows = [fishCards.join('\n')];

  // Progress bars for each rarity
  const progressBars = [];
  for (const { key: rarity, emoji } of rarityOrder) {
    const fishes = fishByRarity[rarity] || [];
    let caught = 0;
    for (const fish of fishes) {
      const fishId = fish.name.toLowerCase().replace(/\s+/g, '_');
      if ((fishLog[fishId]?.count || 0) > 0) caught++;
    }
    const barLength = 14;
    const filled = fishes.length > 0 ? Math.round((caught / fishes.length) * barLength) : 0;
    const bar = '─'.repeat(filled) + '┄'.repeat(barLength - filled);
    progressBars.push(`${emoji} ${FISH_RARITIES[rarity]?.label?.toUpperCase() || rarity}: [${bar}] ${caught}/${fishes.length}`);
  }

  // Collection rewards section
  const rewardLines = [];
  for (const { key: rarity, emoji } of rarityOrder) {
    if (fishingCollectionCompleted[rarity]) {
      const reward = getCollectionReward(rarity);
      const coins = reward?.coins || 0;
      rewardLines.push(`${emoji} **${FISH_RARITIES[rarity].label.toUpperCase()}** Collection Complete! +${coins} coins`);
    }
  }

  // Build embed
  const embed = new EmbedBuilder()
    .setTitle('🎣 Your Fish Collection')
    .setColor(0x1e90ff)
    .setDescription(
      uniqueCaught === 0
        ? "You've caught 0 fish across 0 unique species!"
        : `You've caught ${totalCaught} fish across ${uniqueCaught} unique species!
**Total Weight:** ${formatWeight(totalWeight)}`
    );

  // Add grid rows
  for (const row of cardRows) {
    embed.addFields({ name: '\u200b', value: row, inline: false });
  }

  // Add progress bars
  if (progressBars.length > 0) {
    embed.addFields({ name: '📊 Collection Progress', value: progressBars.join('\n'), inline: false });
  }

  // Add collection rewards
  if (rewardLines.length > 0) {
    embed.addFields({ name: '🏆 Completed Collections', value: rewardLines.join('\n'), inline: false });
  }

  // Add footer with tips
  const tips = [
    '💡 Tip: Sell fish to earn coins!',
    '💡 Tip: Complete collections for bonus rewards!',
    '💡 Tip: Use better rods to catch rarer fish!',
    '💡 Tip: Bait and boosters improve your chances!',
    '💡 Tip: Check the market for fish prices!'
  ];
  
  // Use secureRandomChoice with fallback
  let selectedTip;
  try {
    selectedTip = secureRandomChoice(tips);
  } catch (error) {
    logger.error('Error in secureRandomChoice:', error);
    selectedTip = tips[0]; // Fallback to first tip
  }
  
  embed.setFooter({ text: selectedTip });

  await reply(interaction, { embeds: [embed] });
});

// Sell fish handler
const handleSell = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  if (!validators.userId(userId)) {
    return await reply(interaction, { content: '❌ Invalid user ID!', flags: 1 << 6 });
  }
  if (!rateLimiter(userId)) {
    return await reply(interaction, { content: '⏳ You are being rate limited. Please wait before selling again.', flags: 1 << 6 });
  }

  const { calculateFishValue } = require('../rewards');

  // Fetch user fishing data
  const userData = await getUserFishingData(userId);
  const fishInventory = userData?.fishInventory || {};
  const boosters = userData?.boosters || [];
  const activeBooster = userData?.activeBooster;

  // Calculate total value of all fish
  let totalValue = 0;
  let totalFish = 0;
  let totalWeight = 0;
  const soldFish = [];

  for (const [fishId, fishData] of Object.entries(fishInventory)) {
    if (fishData.count > 0) {
      // Find the fish type
      const fish = FISH_TYPES.find(f => f.name.toLowerCase().replace(/\s+/g, '_') === fishId);
      if (fish) {
        const value = calculateFishValue(fish, { boosters, activeBooster });
        const fishValue = value * fishData.count;
        const weight = getFishWeight(fishId);
        const fishWeight = weight * fishData.count;
        totalValue += fishValue;
        totalFish += fishData.count;
        totalWeight += fishWeight;
        soldFish.push({
          name: fish.name,
          count: fishData.count,
          value: fishValue,
          weight: fishWeight,
          emoji: fish.emoji
        });
      }
    }
  }

  if (totalFish === 0) {
    await reply(interaction, {
      content: '🎣 You don\'t have any fish to sell! Go fishing first with `/fish`.',
      flags: 1 << 6
    });
    return;
  }

  // Use atomic operations to update both fish inventory and coins
  const { performAtomicOperation } = require('../../../utils/atomicOperations');
  
  await performAtomicOperation(async (session) => {
    // Clear fish inventory
    await updateUserFishingData(userId, { fishInventory: {} }, session);
    
    // Add coins to user
    await User.findByIdAndUpdate(userId, { $inc: { coins: totalValue } }, { session });
  });

  // Create embed
  const embed = new EmbedBuilder()
    .setTitle('💰 Fish Sold Successfully!')
    .setColor(0x00ff00)
    .setDescription(`You sold **${totalFish}** fish for **${formatKelocoins(totalValue)}**!`);

  // Add sold fish details
  if (soldFish.length > 0) {
    const fishList = soldFish.map(fish => 
      `${fish.emoji} **${fish.name}** x${fish.count} • ${formatKelocoins(fish.value)} • ${formatWeight(fish.weight)}`
    ).join('\n');
    
    embed.addFields({
      name: '🐟 Sold Fish',
      value: fishList,
      inline: false
    });
  }

  // Add total summary
  embed.addFields({
    name: '📊 Summary',
    value: `**Total Fish:** ${totalFish}\n**Total Value:** ${formatKelocoins(totalValue)}\n**Total Weight:** ${formatWeight(totalWeight)}`,
    inline: false
  });

  // Progress quests
  const { progressQuests } = require('../../../utils/utils');
  await progressQuests(userId, ['fishing_seller', 'fishing_master'], interaction).catch(e => logger.error('progressQuests error:', e));

  await reply(interaction, { embeds: [embed] });
});

module.exports = {
  handleInventory,
  handleSell
}; 