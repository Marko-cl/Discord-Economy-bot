const { reply } = require('../../../utils/formatting');
const { getOrInitFarm, initializeFarmFields } = require('../database');
const { withSafeReply } = require('../../../utils/safeReply');
const { checkRateLimit } = require('../../../utils/rateLimiting');
const { validators } = require('../../../utils/validation');
const logger = require('../../../logger');
const { progressQuests } = require('../../../utils/utils');
const rateLimiter = (userId) => checkRateLimit(userId, 'farm_upgrade', 5, 10000);
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const {
  getRarityEmoji,
  getNextQuality,
  calculateQualityUpgradeCost,
  getSeedRarityMultiplier,
  getBuffMultiplier,
  getCurrentBoostsText
} = require('./helpers');
const { atomicFarmUpgrade } = require('../../../utils/atomicFarmOperations');
const { findSeedByName } = require('../logic');

// Quality upgrade handler
const handleQualityUpgrade = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  const plotNumber = interaction.options.getInteger('plot');
  const plotIndex = plotNumber - 1;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm quality upgrade: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  if (!plotNumber || plotNumber < 1 || plotNumber > 20) {
    return await reply(interaction, {
      content: '❌ Invalid plot number! Must be between 1 and 20.',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  let farm = user.farm;
  farm = await initializeFarmFields(userId, farm);
  
  if (plotIndex < 0 || plotIndex >= farm.plots.length) {
    return await reply(interaction, {
      content: `❌ Invalid plot number! You have ${farm.plots.length} plots.`,
      flags: 1 << 6
    });
  }
  
  const plot = farm.plots[plotIndex];
  if (!plot) {
    return await reply(interaction, {
      content: '❌ You can only upgrade quality if a crop is currently planted in this plot!',
      flags: 1 << 6
    });
  }
  
  const seed = findSeedByName(plot.seedName);
  if (!seed) {
    return await reply(interaction, {
      content: '❌ Invalid crop data in this plot!',
      flags: 1 << 6
    });
  }
  
  // Check current quality
  const currentQuality = plot.quality || 'COMMON';
  const nextQuality = getNextQuality(currentQuality);
  
  if (currentQuality === nextQuality) {
    return await reply(interaction, {
      content: '❌ This plot is already at maximum quality!',
      flags: 1 << 6
    });
  }
  
  // Calculate cost
  const baseCost = calculateQualityUpgradeCost(currentQuality);
  const rarityMult = getSeedRarityMultiplier(seed);
  const buffMult = getBuffMultiplier(plot, farm);
  const price = Math.floor(baseCost * rarityMult * buffMult);
  
  // Create embed
  const embed = new EmbedBuilder()
    .setTitle('🌟 Quality Upgrade')
    .setDescription(`Upgrade crop quality for **${seed.name}** in plot ${plotNumber}?`)
    .addFields(
      { name: '🌱 Crop', value: `${seed.emoji} ${seed.name}`, inline: true },
      { name: '⭐ Current Quality', value: `${getRarityEmoji(currentQuality)} ${currentQuality}`, inline: true },
      { name: '🌟 New Quality', value: `${getRarityEmoji(nextQuality)} ${nextQuality}`, inline: true },
      { name: '💰 Cost', value: `${price.toLocaleString()} 🪙`, inline: true },
      { name: '📊 Current Boosts', value: getCurrentBoostsText(plot, farm, plotIndex), inline: false }
    )
    .setColor(0x9b59b6)
    .setFooter({ text: `Price based on rarity (${rarityMult}x) and current boosts (${buffMult.toFixed(1)}x)` });
  
  // Show confirmation buttons
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`quality_confirm_${userId}_${plotIndex}`)
      .setLabel(`✅ Accept (${price.toLocaleString()} 🪙)`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`quality_cancel_${userId}_${plotIndex}`)
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Danger)
  );
  
  await reply(interaction, { embeds: [embed], components: [row] });
  
  // Wait for button interaction
  try {
    const filter = (i) => i.customId === `quality_confirm_${userId}_${plotIndex}` && i.user.id === userId;
    const confirmation = await interaction.channel.awaitMessageComponent({ filter, componentType: ComponentType.Button, time: 30000 });
    
    // Apply upgrade
    if (!farm.upgrades.quality) farm.upgrades.quality = {};
    farm.upgrades.quality[plotIndex] = (farm.upgrades.quality[plotIndex] || 0) + 1;
    
    // Use atomic operation for upgrade
    const result = await atomicFarmUpgrade(userId, price, farm);
    
    if (!result.success) {
      logger.error(`Farm quality upgrade failed for user ${userId}:`, result.error);
      await confirmation.update({ 
        content: '❌ Failed to upgrade quality! Please try again.', 
        embeds: [], 
        components: [] 
      });
      return;
    }
    
    // Update quest progress
    progressQuests(userId, ['farm_upgrade', 'farm_quality_upgrade'], interaction).catch(e => logger.error('progressQuests error:', e));
    
    logger.info(`Farm quality upgrade completed for user ${userId}: plot ${plotNumber}, -${price} coins`);
    
    await confirmation.update({ 
      content: `✅ Quality upgraded for plot ${plotNumber}! Crop quality improved from ${currentQuality} to ${nextQuality}.`, 
      embeds: [], 
      components: [] 
    });
    
  } catch {
    // Timeout or cancel
    await interaction.editReply({ content: '⏰ Quality upgrade timed out.', embeds: [], components: [] });
  }
}, { rateLimiter });

// SPEED UPGRADE HANDLER
const handleSpeed = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  const plotNumber = interaction.options.getInteger('plot');
  const plotIndex = plotNumber - 1;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm speed upgrade: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  if (!plotNumber || plotNumber < 1 || plotNumber > 20) {
    return await reply(interaction, {
      content: '❌ Invalid plot number! Must be between 1 and 20.',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  let farm = user.farm;
  farm = await initializeFarmFields(userId, farm);
  
  if (plotIndex < 0 || plotIndex >= farm.plots.length) {
    return await reply(interaction, {
      content: `❌ Invalid plot number! You have ${farm.plots.length} plots.`,
      flags: 1 << 6
    });
  }
  
  const plot = farm.plots[plotIndex];
  if (!plot) {
    return await reply(interaction, {
      content: '❌ You can only upgrade speed if a crop is currently planted in this plot!',
      flags: 1 << 6
    });
  }
  
  const seed = findSeedByName(plot.seedName);
  if (!seed) {
    return await reply(interaction, {
      content: '❌ Invalid crop data in this plot!',
      flags: 1 << 6
    });
  }
  
  // Calculate price
  const baseCost = 5000;
  const rarityMult = getSeedRarityMultiplier(seed);
  const buffMult = getBuffMultiplier(plot, farm);
  const price = Math.floor(baseCost * rarityMult * buffMult);
  
  // Create detailed embed with crop information
  const embed = new EmbedBuilder()
    .setTitle('⚡ Speed Upgrade')
    .setDescription(`Upgrade growth speed for **${seed.name}** in plot ${plotNumber}?`)
    .addFields(
      { name: '🌱 Crop', value: `${seed.emoji} ${seed.name}`, inline: true },
      { name: '⭐ Rarity', value: `${getRarityEmoji(seed.rarity)} ${seed.rarity}`, inline: true },
      { name: '💰 Cost', value: `${price.toLocaleString()} 🪙`, inline: true },
      { name: '⚡ Effect', value: '+10% growth speed', inline: true },
      { name: '📊 Current Boosts', value: getCurrentBoostsText(plot, farm, plotIndex), inline: false }
    )
    .setColor(0x00ff00)
    .setFooter({ text: `Price based on rarity (${rarityMult}x) and current boosts (${buffMult.toFixed(1)}x)` });
  
  // Show confirmation buttons
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`speed_confirm_${userId}_${plotIndex}`)
      .setLabel(`✅ Accept (${price.toLocaleString()} 🪙)`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`speed_cancel_${userId}_${plotIndex}`)
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Danger)
  );
  
  await reply(interaction, { embeds: [embed], components: [row] });
  
  // Wait for button interaction
  try {
    const filter = (i) => (i.customId === `speed_confirm_${userId}_${plotIndex}` || i.customId === `speed_cancel_${userId}_${plotIndex}`) && i.user.id === userId;
    const confirmation = await interaction.channel.awaitMessageComponent({ filter, componentType: ComponentType.Button, time: 30000 });
    
    if (confirmation.customId === `speed_cancel_${userId}_${plotIndex}`) {
      await confirmation.update({ content: '❌ Speed upgrade cancelled.', embeds: [], components: [] });
      return;
    }
    
    // Apply upgrade
    if (!farm.upgrades.growth) farm.upgrades.growth = {};
    farm.upgrades.growth[plotIndex] = (farm.upgrades.growth[plotIndex] || 0) + 1;
    
    // Use atomic operation for upgrade
    const result = await atomicFarmUpgrade(userId, price, farm);
    
    if (!result.success) {
      logger.error(`Farm speed upgrade failed for user ${userId}:`, result.error);
      await confirmation.update({ 
        content: '❌ Failed to upgrade speed! Please try again.', 
        embeds: [], 
        components: [] 
      });
      return;
    }
    
    // Update quest progress
    progressQuests(userId, ['farm_upgrade', 'farm_speed_upgrade'], interaction).catch(e => logger.error('progressQuests error:', e));
    
    logger.info(`Farm speed upgrade completed for user ${userId}: plot ${plotNumber}, -${price} coins`);
    
    await confirmation.update({ 
      content: `✅ Speed upgraded for plot ${plotNumber}! Growth speed increased by 10%. Plot ${plotNumber} now has +${farm.upgrades.growth[plotIndex] * 10}% growth speed.`, 
      embeds: [], 
      components: [] 
    });
    
  } catch {
    // Timeout or cancel
    await interaction.editReply({ content: '⏰ Speed upgrade timed out.', embeds: [], components: [] });
  }
}, { rateLimiter });

// VALUE UPGRADE HANDLER
const handleValue = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  const plotNumber = interaction.options.getInteger('plot');
  const plotIndex = plotNumber - 1;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm value upgrade: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  if (!plotNumber || plotNumber < 1 || plotNumber > 20) {
    return await reply(interaction, {
      content: '❌ Invalid plot number! Must be between 1 and 20.',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  let farm = user.farm;
  farm = await initializeFarmFields(userId, farm);
  
  if (plotIndex < 0 || plotIndex >= farm.plots.length) {
    return await reply(interaction, {
      content: `❌ Invalid plot number! You have ${farm.plots.length} plots.`,
      flags: 1 << 6
    });
  }
  
  const plot = farm.plots[plotIndex];
  if (!plot) {
    return await reply(interaction, {
      content: '❌ You can only upgrade value if a crop is currently planted in this plot!',
      flags: 1 << 6
    });
  }
  
  const seed = findSeedByName(plot.seedName);
  if (!seed) {
    return await reply(interaction, {
      content: '❌ Invalid crop data in this plot!',
      flags: 1 << 6
    });
  }
  
  // Calculate price
  const baseCost = 7000;
  const rarityMult = getSeedRarityMultiplier(seed);
  const buffMult = getBuffMultiplier(plot, farm);
  const price = Math.floor(baseCost * rarityMult * buffMult);
  
  // Create detailed embed with crop information
  const embed = new EmbedBuilder()
    .setTitle('💰 Value Upgrade')
    .setDescription(`Upgrade crop value for **${seed.name}** in plot ${plotNumber}?`)
    .addFields(
      { name: '🌱 Crop', value: `${seed.emoji} ${seed.name}`, inline: true },
      { name: '⭐ Rarity', value: `${getRarityEmoji(seed.rarity)} ${seed.rarity}`, inline: true },
      { name: '💰 Cost', value: `${price.toLocaleString()} 🪙`, inline: true },
      { name: '💎 Effect', value: '+20% crop value', inline: true },
      { name: '📊 Current Boosts', value: getCurrentBoostsText(plot, farm, plotIndex), inline: false }
    )
    .setColor(0xffd700)
    .setFooter({ text: `Price based on rarity (${rarityMult}x) and current boosts (${buffMult.toFixed(1)}x)` });
  
  // Show confirmation buttons
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`value_confirm_${userId}_${plotIndex}`)
      .setLabel(`✅ Accept (${price.toLocaleString()} 🪙)`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`value_cancel_${userId}_${plotIndex}`)
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Danger)
  );
  
  await reply(interaction, { embeds: [embed], components: [row] });
  
  // Wait for button interaction
  try {
    const filter = (i) => (i.customId === `value_confirm_${userId}_${plotIndex}` || i.customId === `value_cancel_${userId}_${plotIndex}`) && i.user.id === userId;
    const confirmation = await interaction.channel.awaitMessageComponent({ filter, componentType: ComponentType.Button, time: 30000 });
    
    if (confirmation.customId === `value_cancel_${userId}_${plotIndex}`) {
      await confirmation.update({ content: '❌ Value upgrade cancelled.', embeds: [], components: [] });
      return;
    }
    
    // Apply upgrade
    if (!farm.upgrades.value) farm.upgrades.value = {};
    farm.upgrades.value[plotIndex] = (farm.upgrades.value[plotIndex] || 0) + 1;
    
    // Use atomic operation for upgrade
    const result = await atomicFarmUpgrade(userId, price, farm);
    
    if (!result.success) {
      logger.error(`Farm value upgrade failed for user ${userId}:`, result.error);
      await confirmation.update({ 
        content: '❌ Failed to upgrade value! Please try again.', 
        embeds: [], 
        components: [] 
      });
      return;
    }
    
    // Update quest progress
    progressQuests(userId, ['farm_upgrade', 'farm_value_upgrade'], interaction).catch(e => logger.error('progressQuests error:', e));
    
    logger.info(`Farm value upgrade completed for user ${userId}: plot ${plotNumber}, -${price} coins`);
    
    await confirmation.update({ 
      content: `✅ Value upgraded for plot ${plotNumber}! Crop value increased by 20%. Plot ${plotNumber} now has +${farm.upgrades.value[plotIndex] * 20}% crop value.`, 
      embeds: [], 
      components: [] 
    });
    
  } catch {
    // Timeout or cancel
    await interaction.editReply({ content: '⏰ Value upgrade timed out.', embeds: [], components: [] });
  }
}, { rateLimiter });

module.exports = {
  handleQualityUpgrade,
  handleSpeed,
  handleValue
}; 