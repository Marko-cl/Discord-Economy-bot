const { reply } = require('../../../utils/formatting');
const { getOrInitFarm, initializeFarmFields } = require('../database');
const { withSafeReply } = require('../../../utils/safeReply');
const { checkRateLimit } = require('../../../utils/rateLimiting');
const { validators } = require('../../../utils/validation');
const logger = require('../../../logger');
const { progressQuests } = require('../../../utils/utils');
const rateLimiter = (userId) => checkRateLimit(userId, 'farm_utility', 5, 10000);
const { formatDuration } = require('../../../utils/formatting');
const { CROP_VARIANTS, SEED_TYPES } = require('../constants');
const { findSeedByName, calculateGrowTime, getEmptyPlots, removeSeedFromFarmInventory, determineCropQuality } = require('../logic');
const { atomicFarmFertilize, atomicFarmPlant } = require('../../../utils/atomicFarmOperations');
const { executeAtomic } = require('../../../utils/atomicOperations');
const { secureRandomFloat, secureRandomChoice } = require('../../../utils/secureRandom');
const { EmbedBuilder } = require('discord.js');
const { createFarmVisualizationEmbed } = require('../visualization');

// Fertilize handler
const handleFertilize = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  const plotNumber = interaction.options.getInteger('plot');
  const plotIndex = plotNumber - 1;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm fertilize: ${userId}`);
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
      content: '❌ You can only fertilize plots that have crops planted!',
      flags: 1 << 6
    });
  }
  
  if (plot.fertilized) {
    return await reply(interaction, {
      content: '❌ This plot is already fertilized!',
      flags: 1 << 6
    });
  }
  
  // Check if user has fertilizer
  const fertilizerCount = user.farmInventory && user.farmInventory['🌱 Fertilizer'] ? user.farmInventory['🌱 Fertilizer'].count : 0;
  
  if (fertilizerCount === 0) {
    return await reply(interaction, {
      content: '❌ You don\'t have any 🌱 Fertilizer! Buy it from `/shop` or use `/use` to get some.',
      flags: 1 << 6
    });
  }
  
  // Remove fertilizer from inventory
  if (user.farmInventory && user.farmInventory['🌱 Fertilizer'] && user.farmInventory['🌱 Fertilizer'].count > 0) {
    user.farmInventory['🌱 Fertilizer'].count--;
    if (user.farmInventory['🌱 Fertilizer'].count === 0) {
      delete user.farmInventory['🌱 Fertilizer'];
    }
  }
  
  // Apply fertilizer effect
  plot.fertilized = true;
  
  const seed = findSeedByName(plot.seedName);
  if (seed) {
    // Apply fertilizer effect to growth time (50% faster)
    plot.growTime = Math.floor(plot.growTime * 0.5);
    
    // Check for special variants (Golden, Crystal, Giant)
    const variantChance = secureRandomFloat();
    let newVariant = null;
    
    if (variantChance <= 0.01) { // 1% chance for Golden
      newVariant = 'GOLDEN';
    } else if (variantChance <= 0.015) { // 0.5% chance for Crystal
      newVariant = 'CRYSTAL';
    } else if (variantChance <= 0.035) { // 2% chance for Giant
      newVariant = 'GIANT';
    }
    
    if (newVariant) {
      plot.variant = newVariant;
      const variantData = CROP_VARIANTS[newVariant];
      // Apply variant effects to growth time
      plot.growTime = Math.floor(plot.growTime * variantData.growthMultiplier);
    }
  }
  
  // Use atomic operation for fertilization
  const result = await atomicFarmFertilize(userId, farm, user.farmInventory);
  
  if (!result.success) {
    logger.error(`Farm fertilize failed for user ${userId}:`, result.error);
    return await reply(interaction, {
      content: '❌ Failed to apply fertilizer! Please try again.',
      flags: 1 << 6
    });
  }
  
  // Update quest progress
  progressQuests(userId, ['farm_fertilize', 'farm_utility'], interaction).catch(e => logger.error('progressQuests error:', e));
  
  logger.info(`Farm fertilization completed for user ${userId}: plot ${plotNumber}`);
  
  let message = `🌱 Fertilizer applied to plot ${plotNumber}! Growth speed increased by 50%.`;
  
  if (plot.variant) {
    const variantData = CROP_VARIANTS[plot.variant];
    message += `\n🎉 **Special variant detected: ${variantData.emoji} ${variantData.name}** - ${variantData.description}`;
  }
  
  return await reply(interaction, message);
}, { rateLimiter });

// Plant multiple seeds handler
const handlePlantMulti = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  const seed1 = interaction.options.getString('seed1');
  const seed2 = interaction.options.getString('seed2');
  const seed3 = interaction.options.getString('seed3');
  const seed4 = interaction.options.getString('seed4');
  const seed5 = interaction.options.getString('seed5');
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm plant multi: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  const seeds = [seed1, seed2, seed3, seed4, seed5].filter(Boolean);
  
  if (seeds.length === 0) {
    return await reply(interaction, {
      content: '❌ You must specify at least one seed to plant!',
      flags: 1 << 6
    });
  }
  
  // Validate seed names
  for (const seedName of seeds) {
    if (!seedName || typeof seedName !== 'string' || seedName.length < 1 || seedName.length > 50) {
      return await reply(interaction, {
        content: '❌ Invalid seed name!',
        flags: 1 << 6
      });
    }
  }
  
  let user = await getOrInitFarm(userId);
  let farm = user.farm;
  farm = await initializeFarmFields(userId, farm);
  
  // Check if user has enough seeds for each type
  const seedCounts = {};
  for (const seedName of seeds) {
    const count = user.farmInventory && user.farmInventory[seedName] ? user.farmInventory[seedName].count : 0;
    seedCounts[seedName] = count;
    if (count === 0) {
      return await reply(interaction, {
        content: `❌ You don't have any ${seedName}!`,
        flags: 1 << 6
      });
    }
  }
  
  // Find empty plots
  const emptyPlots = getEmptyPlots(farm.plots);
  if (emptyPlots.length < seeds.length) {
    return await reply(interaction, {
      content: `❌ You don't have enough empty plots! You have ${emptyPlots.length} empty plots, need ${seeds.length}.`,
      flags: 1 << 6
    });
  }
  
  // Plant seeds
  let plantedCount = 0;
  const plantedSeeds = [];
  const plotIndices = [];
  
  for (let i = 0; i < seeds.length; i++) {
    const seedName = seeds[i];
    const seed = findSeedByName(seedName);
    if (!seed) continue;
    
    // Prevent Box of Seeds from being planted
    if (seed.name === 'Box of Seeds') {
      return await reply(interaction, {
        content: '❌ Box of Seeds cannot be planted! It\'s a special item that gives you random seeds when used.',
        flags: 1 << 6
      });
    }
    
    // Remove seed from inventory
    let removed = false;
    if (user.farmInventory && user.farmInventory[seedName] && user.farmInventory[seedName].count > 0) {
      removed = removeSeedFromFarmInventory(user.farmInventory, seedName);
    }
    if (!removed) continue;
    
    const plotIdx = emptyPlots[plantedCount];
    
    // Determine crop quality and variant
    const { quality, variant } = determineCropQuality(seed, farm, plotIdx, false);
    
    // Calculate grow time with quality and weather
    const growTime = await calculateGrowTime(seed, farm, plotIdx, quality, variant);
    
    farm.plots[plotIdx] = {
      seedKey: seed.key,
      seedName: seed.name,
      plantedAt: Date.now(),
      growTime: growTime,
      ready: false,
      quality: quality,
      variant: variant,
      fertilized: false
    };
    
    plantedCount++;
    plantedSeeds.push(seedName);
    plotIndices.push(plotIdx);
    
    // Update stats
    if (!farm.stats.grown) farm.stats.grown = {};
    farm.stats.grown[seedName] = (farm.stats.grown[seedName] || 0) + 1;
  }
  
  // Use atomic operation for multi-planting
  const result = await atomicFarmPlant(userId, 'multi', plantedCount, plotIndices, farm, user.farmInventory);
  
  if (!result.success) {
    logger.error(`Farm multi-plant failed for user ${userId}:`, result.error);
    return await reply(interaction, {
      content: '❌ Failed to plant seeds! Please try again.',
      flags: 1 << 6
    });
  }
  
  // Update quest progress
  progressQuests(userId, ['farm_plant', 'farm_plant_multi', 'farm_utility'], interaction).catch(e => logger.error('progressQuests error:', e));
  
  logger.info(`Farm multi-plant completed for user ${userId}: ${plantedCount} seeds`);
  
  return await reply(interaction, `🌱 Successfully planted ${plantedCount} seeds: ${plantedSeeds.join(', ')}`);
}, { rateLimiter });

// Weather handler
const handleWeather = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm weather: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  const { getCurrentWeather, getWeatherForecast, getWeatherEffects } = require('../weather');

  const currentWeather = await getCurrentWeather();
  const forecast = await getWeatherForecast();
  const effects = getWeatherEffects(currentWeather.currentWeather);

  const embed = new EmbedBuilder()
    .setTitle(`${effects.emoji} Farm Weather Report`)
    .setColor(0x87ceeb)
    .setTimestamp();

  // Current weather section
  embed.addFields({
    name: 'Current Weather',
    value: `**${effects.emoji} ${effects.name}**\n${effects.description}\n\n` +
      `**Growth:** ${Math.round(effects.growthMultiplier * 100)}%\n` +
      `**Value:** ${Math.round(effects.valueMultiplier * 100)}%\n` +
      `**Time Left:** ${formatDuration(currentWeather.nextChangeTime - Date.now())}`,
    inline: false
  });

  // Weather forecast section
  let forecastText = '';
  for (let i = 0; i < Math.min(forecast.length, 3); i++) {
    const weather = forecast[i];
    const effectsF = getWeatherEffects(weather.weather);
    const timeString = new Date(weather.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    forecastText += `**${effectsF.emoji} ${effectsF.name}** at ${timeString}\n` +
      `Growth: ${Math.round(effectsF.growthMultiplier * 100)}% | Value: ${Math.round(effectsF.valueMultiplier * 100)}%\n` +
      `Duration: ${formatDuration(weather.duration)}\n\n`;
  }
  if (forecastText) {
    embed.addFields({
      name: '3-Step Weather Forecast',
      value: forecastText.trim(),
      inline: false
    });
  }

  embed.setFooter({ text: 'Weather changes every 5 minutes. Plan your farming!' });
  return await reply(interaction, { embeds: [embed] });
}, { rateLimiter });

// Theme handler
const handleTheme = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  const theme = interaction.options.getString('theme');
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm theme: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  if (!theme || typeof theme !== 'string' || theme.length < 1 || theme.length > 50) {
    return await reply(interaction, {
      content: '❌ Invalid theme name!',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  let farm = user.farm;
  farm = await initializeFarmFields(userId, farm);
  
  // Set theme
  farm.theme = theme;
  
  // Use atomic operation for theme update
  const result = await executeAtomic([
    async (session) => {
      const User = require('mongoose').model('User');
      
      // Validate user exists
      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }
      
      // Update farm data
      const result = await User.findByIdAndUpdate(userId, { 
        $set: { farm: farm } 
      }, { session, new: true });
      
      if (!result) {
        throw new Error(`Failed to update farm for user: ${userId}`);
      }
      
      logger.info(`Farm theme updated for user ${userId}: ${theme}`);
      return result;
    }
  ], null, { context: 'farm_theme_update' });
  
  if (!result[0]) {
    logger.error(`Farm theme update failed for user ${userId}`);
    return await reply(interaction, {
      content: '❌ Failed to update theme! Please try again.',
      flags: 1 << 6
    });
  }
  
  // Update quest progress
  progressQuests(userId, ['farm_customization', 'farm_theme'], interaction).catch(e => logger.error('progressQuests error:', e));
  
  return await reply(interaction, `🎨 Farm theme changed to **${theme}**! Use \`/farm view\` to see your new farm layout.`);
}, { rateLimiter });

// Map handler
const handleMap = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm map: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  let user = await getOrInitFarm(userId);
  let farm = user.farm;
  farm = await initializeFarmFields(userId, farm);
  
  const embed = await createFarmVisualizationEmbed(interaction.user, farm, farm.theme || 'CLASSIC');
  return await reply(interaction, { embeds: [embed] });
}, { rateLimiter });

// Farm help handler - comprehensive command guide
const handleHelp = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm help: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  const { getUser } = require('../../../utils/utils');
  const user = await getUser(userId, { embedColor: 1 });
  const embedColor = require('../../../utils/utils').getUserEmbedColor(user);
  
  // Fun farm facts for the footer
  const farmFacts = [
    "🌱 Different weather conditions affect crop growth and value!",
    "🌾 Use fertilizer to get special crop variants (Golden, Crystal, Giant)!",
    "👨‍🌾 Workers can automatically plant and collect crops for you!",
    "🌤️ Weather changes every 5 minutes - check `/farm weather`!",
    "🎨 Customize your farm with different themes using `/farm theme`!",
    "⚡ Speed upgrades make crops grow faster on specific plots!",
    "💎 Quality upgrades increase rare crop chances!",
    "💰 Value upgrades make your crops worth more when sold!",
    "🌿 Some crops have special variants that are worth 2-3x more!",
    "🎯 Plant multiple seed types at once with `/farm plantmulti`!",
    "🌟 Legendary+ crops can be worth 10x more than common ones!",
    "🌈 Each farm theme gives your crops a unique visual style!",
    "🎪 Auto-farming works even when you're offline!",
    "🔮 Weather affects crop quality, growth speed, and sell value!",
    "🏆 Expand your farm to become a farming legend!",
    "📊 Check `/farm market` to see all crop prices and rarity info!",
    "🔧 Use `/farm status` to debug auto-farming issues!",
    "🎪 Auto-farming requires 👨‍🌾 Worker items from the shop!",
    "🌱 Box of Seeds gives random seeds when used with `/use`!",
    "⚡ Plot upgrades are lost when crops are harvested!"
  ];
  
  const randomFact = farmFacts[secureRandomChoice(farmFacts)];
  
  // Fun welcome messages
  const welcomeMessages = [
    "🚜 Welcome to your farm, farmer!",
    "🌾 Ready to grow some amazing crops?",
    "👨‍🌾 Time to get your hands dirty!",
    "🌱 Let's make your farm flourish!",
    "🏡 Your farming adventure starts here!"
  ];
  
  const welcomeMessage = welcomeMessages[secureRandomChoice(welcomeMessages)];
  
  const embed = new EmbedBuilder()
    .setTitle('🌾 🌱 🚜 FARM COMMANDS GUIDE 🚜 🌱 🌾')
    .setDescription(`${welcomeMessage}\n\nHere are all the **amazing commands** you can use to grow and manage your crops! 🌿`)
    .setColor(embedColor)
    .setThumbnail('https://cdn.discordapp.com/emojis/🌾.png')
    .setFooter({ text: `💡 ${randomFact}` })
    .setTimestamp();

  // Basic Commands
  embed.addFields({
    name: '🌱 🌿 BASIC FARMING 🌿 🌱',
    value: [
      '**`/farm help`** 📚 Show this help menu with all farm commands!',
      '**`/farm plant <seed> <amount>`** 🌱 Plant seeds and watch them grow!',
      '**`/farm collect`** 🌾 Collect all your ready crops at once!',
      '**`/farm view`** 👀 Check your farm status and see your beautiful plots!',
      '**`/farm harvest <plot>`** ✂️ Harvest a specific plot when ready!',
      '**`/farm sell`** 💰 Sell all harvested crops for sweet coins!',
      '**`/farm inventory`** 📦 Check your farm inventory (seeds, workers, etc.)!'
    ].join('\n'),
    inline: false
  });

  // Management Commands
  embed.addFields({
    name: '🏗️ 🏠 FARM MANAGEMENT 🏠 🏗️',
    value: [
      '**`/farm expand`** 🏗️ Expand your farm with more plots!',
      '**`/farm removeplot`** 🗑️ Remove the last empty plot for a refund!',
      '**`/farm stats`** 📊 View your farm statistics and earnings!',
      '**`/farm status`** 🔧 Debug auto-farming and check farm status!'
    ].join('\n'),
    inline: false
  });

  // Automation Commands
  embed.addFields({
    name: '🤖 🔧 AUTO-FARMING 🔧 🤖',
    value: [
      '**`/farm autoplant`** 🤖 Toggle auto-planting (requires 👨‍🌾 Worker)!',
      '**`/farm autocollect`** 🤖 Toggle auto-collecting (requires 👨‍🌾 Worker)!',
      '**`/farm notification`** 🔔 Toggle DM notifications for auto-farming!',
      '**`/farm testauto`** ⚙️ OWNER ONLY: Test auto-farming system!'
    ].join('\n'),
    inline: false
  });

  // Upgrade Commands
  embed.addFields({
    name: '⚡ 💎 PLOT UPGRADES 💎 ⚡',
    value: [
      '**`/farm speed <plot>`** ⚡ Upgrade plot growth speed (requires planted crop)!',
      '**`/farm value <plot>`** 💎 Upgrade plot crop value (requires planted crop)!',
      '**`/farm qualityupgrade <plot>`** 🌟 Upgrade crop quality (requires planted crop)!',
      '**`/farm fertilize <plot>`** 🌱 Apply fertilizer for special variants!'
    ].join('\n'),
    inline: false
  });

  // Utility Commands
  embed.addFields({
    name: '🛠️ 🎨 UTILITY & CUSTOMIZATION 🎨 🛠️',
    value: [
      '**`/farm plantmulti`** 🎯 Plant multiple seed types at once!',
      '**`/farm weather`** 🌤️ Check current weather and its effects!',
      '**`/farm theme`** 🎨 Change your farm visual theme!',
      '**`/farm map`** 🗺️ View your farm with custom theme!',
      '**`/farm market`** 📊 View crop prices and rarity information!'
    ].join('\n'),
    inline: false
  });

  // Owner Commands
  embed.addFields({
    name: '👑 🔧 OWNER COMMANDS 🤖 👑',
    value: [
      '**`/farm validate`** 🔍 OWNER ONLY: Validate and fix farm data integrity!',
      '**`/farm testauto`** ⚙️ OWNER ONLY: Test auto-farming system!'
    ].join('\n'),
    inline: false
  });

  // Farming Tips
  embed.addFields({
    name: '💡 🌟 FARMING TIPS & STRATEGY 🌟 💡',
    value: [
      '**🌱 Getting Started:**',
      '• Start with Common/Uncommon crops for steady income',
      '• Buy 👨‍🌾 Workers from `/shop` for auto-farming',
      '• Use `/farm weather` to check optimal planting conditions',
      '',
      '**🌾 Advanced Strategies:**',
      '• Mix Rare/Epic crops for better profits',
      '• Use fertilizer on expensive crops for special variants',
      '• Upgrade plot speed/value on your best crops',
      '• Plant during favorable weather for better yields',
      '',
      '**🎪 Auto-Farming:**',
      '• Enable auto-plant/auto-collect with workers',
      '• Workers automatically plant rarest seeds first',
      '• Auto-farming works even when you\'re offline!',
      '',
      '**💰 Maximizing Profits:**',
      '• Legendary+ crops can be worth 10x more',
      '• Quality upgrades increase rare crop chances',
      '• Weather affects crop value and growth speed',
      '• Special variants (Golden, Crystal, Giant) are worth 2-3x more!'
    ].join('\n'),
    inline: false
  });

  return await reply(interaction, { embeds: [embed] });
}, { rateLimiter });

// Market handler - show crop prices and rarity information
const handleMarket = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm market: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  const { getUser } = require('../../../utils/utils');
  const user = await getUser(userId, { embedColor: 1 });
  const embedColor = require('../../../utils/utils').getUserEmbedColor(user);
  
  // Filter out Box of Seeds and organize by rarity
  const seeds = SEED_TYPES.filter(s => s.key !== 'boxofseeds');
  
  // Group seeds by rarity
  const rarityGroups = {
    'Common': [],
    'Uncommon': [],
    'Rare': [],
    'Epic': [],
    'Legendary': [],
    'Mythic': [],
    'Divine': [],
    'Ancient': [],
    'Cursed': [],
    'Galactic': []
  };
  
  seeds.forEach(seed => {
    if (rarityGroups[seed.rarity]) {
      rarityGroups[seed.rarity].push(seed);
    }
  });
  
  // Create rarity emoji mapping
  const rarityEmojis = {
    'Common': '⚪',
    'Uncommon': '🟢', 
    'Rare': '🔵',
    'Epic': '🟣',
    'Legendary': '🟡',
    'Mythic': '🟠',
    'Divine': '🔴',
    'Ancient': '⚫',
    'Cursed': '💀',
    'Galactic': '🌌'
  };
  
  const embed = new EmbedBuilder()
    .setTitle('🌾 Farm Market - Crop Prices & Rarity')
    .setDescription('**Market prices for all crops you can grow on your farm!**\n\n💡 **Pro Tips:**\n• Higher rarity crops are worth more but take longer to grow\n• Weather affects crop value and growth speed\n• Use fertilizer for special crop variants\n• Quality upgrades increase rare crop chances')
    .setColor(embedColor)
    .setFooter({ text: '🌱 Plant seeds with /farm plant • Check weather with /farm weather' })
    .setTimestamp();
  
  // Add fields for each rarity tier
  for (const [rarity, seedsInRarity] of Object.entries(rarityGroups)) {
    if (seedsInRarity.length > 0) {
      const rarityEmoji = rarityEmojis[rarity] || '📦';
      
      let rarityValue = '';
      for (const seed of seedsInRarity) {
        const growHours = Math.floor(seed.grow / (60 * 60 * 1000));
        const dropRate = (seed.drop * 100).toFixed(3);
        rarityValue += `${seed.emoji} **${seed.name}**\n` +
          `└ 💰 **${seed.sell.toLocaleString()} coins** | ⏱️ **${growHours}h** | 📊 **${dropRate}%**\n\n`;
      }
      
      embed.addFields({
        name: `${rarityEmoji} ${rarity} Crops`,
        value: rarityValue.trim(),
        inline: false
      });
    }
  }
  
  // Add market statistics
  const totalSeeds = seeds.length;
  const avgPrice = Math.round(seeds.reduce((sum, s) => sum + s.sell, 0) / totalSeeds);
  const maxPrice = Math.max(...seeds.map(s => s.sell));
  const minPrice = Math.min(...seeds.map(s => s.sell));
  const avgGrowTime = Math.round(seeds.reduce((sum, s) => sum + s.grow, 0) / totalSeeds / (60 * 60 * 1000));
  
  embed.addFields({
    name: '📊 Market Statistics',
    value: `**Total Crops:** ${totalSeeds}\n**Average Price:** ${avgPrice.toLocaleString()} coins\n**Price Range:** ${minPrice.toLocaleString()} - ${maxPrice.toLocaleString()} coins\n**Average Grow Time:** ${avgGrowTime} hours`,
    inline: false
  });
  
  // Add farming tips
  embed.addFields({
    name: '💡 Farming Strategy Tips',
    value: '• **Early Game:** Focus on Common/Uncommon crops for steady income\n• **Mid Game:** Mix Rare/Epic crops for better profits\n• **Late Game:** Plant Legendary+ crops for maximum value\n• **Weather Bonus:** Plant during favorable weather for better yields\n• **Fertilizer:** Use on expensive crops for special variants',
    inline: false
  });
  
  return await reply(interaction, { embeds: [embed] });
}, { rateLimiter });

// Test auto farming handler (owner only)
const handleTestAuto = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm test auto: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  // Owner validation
  if (userId !== require('../../../utils/utils').constants.OWNER_ID) {
    logger.warn(`Unauthorized test auto command attempt by ${userId}`);
    return await reply(interaction, {
      content: '❌ Only the bot owner can use this command!',
      flags: 1 << 6
    });
  }
  
  try {
    const { triggerAutoFarm } = require('../autoFarm');
    
    // Send initial response
    await reply(interaction, '🔄 Triggering auto-farming test...');
    
    // Trigger auto farm
    const result = await triggerAutoFarm();
    
    const resultEmbed = new EmbedBuilder()
      .setTitle('🤖 Auto-Farming Test Results')
      .setDescription('Results of the auto-farming test run')
      .addFields(
        { name: '👥 Users Processed', value: `${result.totalUsers || 0}`, inline: true },
        { name: '🌾 Crops Collected', value: `${result.totalCollected || 0}`, inline: true },
        { name: '🌱 Seeds Planted', value: `${result.totalPlanted || 0}`, inline: true },
        { name: '❌ Errors', value: `${result.errorCount || 0}`, inline: true },
        { name: '⏱️ Duration', value: `${result.duration || 0}ms`, inline: true }
      )
      .setColor(0x3498db)
      .setTimestamp();
    
    return await interaction.editReply({ 
      content: '✅ Auto-farming test completed!',
      embeds: [resultEmbed]
    });
    
  } catch (error) {
    logger.error('Error in test auto command:', error);
    return await reply(interaction, {
      content: '❌ Error triggering auto-farming test!',
      flags: 1 << 6
    });
  }
}, { rateLimiter });

// Farm status handler for debugging
const handleStatus = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm status: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  try {
    const { User } = require('../../../database/db');
    const user = await User.findById(userId, { 
      farm: 1, 
      farmInventory: 1, 
      inventory: 1,
      coins: 1 
    });
    
    if (!user) {
      return await reply(interaction, {
        content: '❌ User not found!',
        flags: 1 << 6
      });
    }
    
    const farm = user.farm || {};
    const auto = farm.auto || {};
    const plots = farm.plots || [];
    
    // Count workers
    const workerCount = user.farmInventory?.['👨‍🌾 Worker']?.count || 0;
    
    // Count seeds
    const seedCounts = {};
    if (user.farmInventory) {
      for (const [itemName, itemData] of Object.entries(user.farmInventory)) {
        if (itemData.count > 0) {
          seedCounts[itemName] = itemData.count;
        }
      }
    }
    
    // Count ready plots
    const readyPlots = plots.filter(plot => plot && plot.plantedAt && plot.growTime && (plot.plantedAt + plot.growTime <= Date.now())).length;
    const emptyPlots = plots.filter(plot => !plot).length;
    const plantedPlots = plots.filter(plot => plot && !plot.ready && (plot.plantedAt + plot.growTime > Date.now())).length;
    
    const statusEmbed = new EmbedBuilder()
      .setTitle('🌾 Farm Status Report')
      .setDescription(`Detailed status for <@${userId}>`)
      .addFields(
        { name: '👨‍🌾 Workers', value: `${workerCount}`, inline: true },
        { name: '🔧 Auto-Plant', value: auto.autoplant ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: '🔧 Auto-Collect', value: auto.autocollect ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: '📊 Plots Status', value: `Ready: ${readyPlots} | Growing: ${plantedPlots} | Empty: ${emptyPlots}`, inline: false },
        { name: '🌱 Seeds Available', value: Object.keys(seedCounts).length > 0 ? Object.entries(seedCounts).map(([name, count]) => `${name}: ${count}`).join('\n') : 'No seeds', inline: false },
        { name: '💰 Coins', value: `${user.coins?.toLocaleString() || 0} 🪙`, inline: true }
      )
      .setColor(0x2ecc71)
      .setTimestamp();
    
    return await reply(interaction, { embeds: [statusEmbed] });
    
  } catch (error) {
    logger.error('Error in farm status command:', error);
    return await reply(interaction, {
      content: '❌ Error getting farm status!',
      flags: 1 << 6
    });
  }
}, { rateLimiter });

// Farm validation handler (owner only)
const handleValidate = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  
  // Input validation
  if (!validators.userId(userId)) {
    logger.warn(`Invalid user ID in farm validate: ${userId}`);
    return await reply(interaction, {
      content: '❌ Invalid user ID!',
      flags: 1 << 6
    });
  }
  
  // Owner validation
  if (userId !== require('../../../utils/utils').constants.OWNER_ID) {
    logger.warn(`Unauthorized validate command attempt by ${userId}`);
    return await reply(interaction, {
      content: '❌ Only the bot owner can use this command!',
      flags: 1 << 6
    });
  }
  
  try {
    const { User } = require('../../../database/db');
    
    // Send initial response
    await reply(interaction, '🔍 Validating farm system...');
    
    // Get all users with farms
    const users = await User.find({ farm: { $exists: true } }).limit(100);
    
    let totalUsers = users.length;
    let validUsers = 0;
    let invalidUsers = 0;
    let issues = [];
    
    for (const user of users) {
      try {
        const farm = user.farm;
        let userIssues = [];
        
        // Validate farm structure
        if (!farm || typeof farm !== 'object') {
          userIssues.push('Missing or invalid farm object');
        } else {
          // Validate plots array
          if (!Array.isArray(farm.plots)) {
            userIssues.push('Invalid plots array');
            farm.plots = Array(3).fill(null);
          }
          
          // Validate auto settings
          if (!farm.auto || typeof farm.auto !== 'object') {
            userIssues.push('Missing auto settings');
            farm.auto = {};
          }
          
          // Validate stats
          if (!farm.stats || typeof farm.stats !== 'object') {
            userIssues.push('Missing stats');
            farm.stats = {};
          }
          
          // Validate upgrades
          if (!farm.upgrades || typeof farm.upgrades !== 'object') {
            userIssues.push('Missing upgrades');
            farm.upgrades = {};
          }
          
          // Validate harvested crops
          if (!farm.harvestedCrops || typeof farm.harvestedCrops !== 'object') {
            userIssues.push('Missing harvested crops');
            farm.harvestedCrops = {};
          }
          
          // Validate farm inventory
          if (!user.farmInventory || typeof user.farmInventory !== 'object') {
            userIssues.push('Missing farm inventory');
            user.farmInventory = {};
          }
        }
        
        if (userIssues.length > 0) {
          invalidUsers++;
          issues.push(`User ${user._id}: ${userIssues.join(', ')}`);
          
          // Fix issues automatically
          await User.findByIdAndUpdate(user._id, { 
            $set: { 
              farm: farm,
              farmInventory: user.farmInventory 
            } 
          });
        } else {
          validUsers++;
        }
        
      } catch (error) {
        invalidUsers++;
        issues.push(`User ${user._id}: Error during validation - ${error.message}`);
      }
    }
    
    const validationEmbed = new EmbedBuilder()
      .setTitle('🔍 Farm System Validation Results')
      .setDescription('Results of the farm system validation')
      .addFields(
        { name: '👥 Total Users', value: `${totalUsers}`, inline: true },
        { name: '✅ Valid Users', value: `${validUsers}`, inline: true },
        { name: '❌ Invalid Users', value: `${invalidUsers}`, inline: true },
        { name: '🔧 Issues Found', value: issues.length > 0 ? issues.slice(0, 10).join('\n') + (issues.length > 10 ? '\n...and more' : '') : 'No issues found', inline: false }
      )
      .setColor(invalidUsers > 0 ? 0xe74c3c : 0x2ecc71)
      .setTimestamp();
    
    return await interaction.editReply({ 
      content: invalidUsers > 0 ? '⚠️ Farm validation completed with issues found and fixed!' : '✅ Farm validation completed - all users valid!',
      embeds: [validationEmbed]
    });
    
  } catch (error) {
    logger.error('Error in farm validation command:', error);
    return await reply(interaction, {
      content: '❌ Error during farm validation!',
      flags: 1 << 6
    });
  }
}, { rateLimiter });

module.exports = {
  handleFertilize: withSafeReply(handleFertilize),
  handlePlantMulti: withSafeReply(handlePlantMulti),
  handleWeather: withSafeReply(handleWeather),
  handleTheme: withSafeReply(handleTheme),
  handleMap: withSafeReply(handleMap),
  handleMarket: withSafeReply(handleMarket),
  handleHelp: withSafeReply(handleHelp),
  handleTestAuto: withSafeReply(handleTestAuto),
  handleStatus: withSafeReply(handleStatus),
  handleValidate: withSafeReply(handleValidate)
};