const { EmbedBuilder } = require('discord.js');
const { SEED_TYPES } = require('./constants');
const { isPlotReady } = require('./logic');

// Generate farm grid display
function generateFarmGrid(plots) {
  const plotEmojis = { empty: '🟫', growing: '🌱', ready: '🪴' };
  const n = plots.length;
  
  // Find grid size (square or closest rectangle)
  let rows = Math.floor(Math.sqrt(n));
  let cols = Math.ceil(n / rows);
  if (rows * cols < n) rows++;
  
  let grid = '';
  for (let r = 0; r < rows; r++) {
    let row = '';
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= n) break;
      const plot = plots[idx];
      if (!plot) {
        row += `${plotEmojis.empty}`;
      } else {
        const seed = SEED_TYPES.find(s => s.name === plot.seedName);
        if (isPlotReady(plot)) {
          row += seed ? seed.emoji : plotEmojis.ready;
        } else {
          row += seed ? seed.emoji : plotEmojis.growing;
        }
      }
    }
    grid += row + '\n';
  }
  
  return grid;
}

// Generate farm details
function generateFarmDetails(plots) {
  let details = '';
  plots.forEach((plot, idx) => {
    let label = `Plot ${idx + 1}`;
    if (!plot) {
      details += `${label}: Empty\n`;
    } else {
      const seed = SEED_TYPES.find(s => s.name === plot.seedName);
      let qualityText = ` [${plot.quality || 'COMMON'}`;
      if (plot.variant) {
        qualityText += `, ${plot.variant}`;
      }
      qualityText += ']';
      
      // Add quality emoji
      const qualityEmojis = {
        'TRASH': '🗑️',
        'COMMON': '⚪',
        'UNCOMMON': '🟢',
        'RARE': '🔵',
        'EPIC': '🟣',
        'LEGENDARY': '🟡'
      };
      const qualityEmoji = qualityEmojis[plot.quality] || '⚪';
      
      if (isPlotReady(plot)) {
        details += `${label}: ${seed ? seed.emoji : ''} ${plot.seedName} ${qualityEmoji}${qualityText} (Ready!)\n`;
      } else {
        const timeLeft = plot.plantedAt + plot.growTime - Date.now();
        const hours = Math.floor(timeLeft / (60 * 60 * 1000));
        const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
        details += `${label}: ${seed ? seed.emoji : ''} ${plot.seedName} ${qualityEmoji}${qualityText} (${hours}h ${minutes}m)\n`;
      }
    }
  });
  return details;
}

// Create farm view embed
function createFarmViewEmbed(user, farm) {
  const embed = new EmbedBuilder()
    .setTitle(`🌾 ${user.username}'s Farm`)
    .setColor('#00ff00')
    .setTimestamp();

  const grid = generateFarmGrid(farm.plots);
  const details = generateFarmDetails(farm.plots);
  
  embed.addFields(
    { name: 'Farm Layout', value: grid, inline: false },
    { name: 'Plot Details', value: details, inline: false }
  );

  // Add auto-farming status
  if (farm.auto) {
    const autoStatus = [];
    if (farm.auto.autoplant) autoStatus.push('🌱 Auto-Plant');
    if (farm.auto.autocollect) autoStatus.push('🌾 Auto-Collect');
    
    if (autoStatus.length > 0) {
      embed.addFields({ name: 'Auto-Farming', value: autoStatus.join(' | '), inline: true });
    }
  }

  // Add upgrades info
  if (farm.upgrades) {
    const upgrades = [];
    if (farm.upgrades.growth && Object.values(farm.upgrades.growth).reduce((a, b) => a + b, 0) > 0) {
      const totalGrowthBoosts = Object.values(farm.upgrades.growth).reduce((a, b) => a + b, 0);
      upgrades.push(`Growth: +${totalGrowthBoosts * 10}%`);
    }
    if (farm.upgrades.value && Object.values(farm.upgrades.value).reduce((a, b) => a + b, 0) > 0) {
      const totalValueBoosts = Object.values(farm.upgrades.value).reduce((a, b) => a + b, 0);
      upgrades.push(`Value: +${totalValueBoosts * 20}%`);
    }
    
    if (upgrades.length > 0) {
      embed.addFields({ name: 'Upgrades', value: upgrades.join(' | '), inline: true });
    }
  }

  return embed;
}

// Create farm stats embed
function createFarmStatsEmbed(user, farm) {
  const embed = new EmbedBuilder()
    .setTitle(`📊 ${user.username}'s Farm Statistics`)
    .setColor('#0099ff')
    .setTimestamp();

  const stats = farm.stats || {};
  const grown = stats.grown || {};
  const sold = stats.sold || {};
  const coinsEarned = stats.coinsEarned || 0;

  // Grown crops
  const grownList = Object.entries(grown)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([crop, count]) => `${crop}: ${count}`)
    .join('\n') || 'None';

  // Sold crops
  const soldList = Object.entries(sold)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([crop, count]) => `${crop}: ${count}`)
    .join('\n') || 'None';

  embed.addFields(
    { name: '🌱 Most Grown Crops', value: grownList, inline: true },
    { name: '💰 Most Sold Crops', value: soldList, inline: true },
    { name: '🪙 Total Coins Earned', value: `${coinsEarned.toLocaleString()}`, inline: false }
  );

  return embed;
}

// Create harvest embed
function createHarvestEmbed(user, harvestedCrops, totalValue) {
  const embed = new EmbedBuilder()
    .setTitle(`🌾 Harvest Complete!`)
    .setColor('#00ff00')
    .setTimestamp();

  // Quality emojis
  const qualityEmojis = {
    'TRASH': '🗑️',
    'COMMON': '⚪',
    'UNCOMMON': '🟢',
    'RARE': '🔵',
    'EPIC': '🟣',
    'LEGENDARY': '🟡'
  };

  const cropList = Object.entries(harvestedCrops)
    .filter(([key]) => key !== 'quality' && key !== 'variant')
    .map(([crop, count]) => {
      const quality = harvestedCrops.quality?.[crop] || 'COMMON';
      const qualityEmoji = qualityEmojis[quality] || '⚪';
      let qualityText = ` [${qualityEmoji} ${quality}`;
      if (harvestedCrops.variant && harvestedCrops.variant[crop]) {
        qualityText += `, ${harvestedCrops.variant[crop]}`;
      }
      qualityText += ']';
      return `${crop}${qualityText}: ${count}`;
    })
    .join('\n') || 'No crops harvested';

  embed.addFields(
    { name: 'Harvested Crops', value: cropList, inline: false },
    { name: 'Total Value', value: `${totalValue.toLocaleString()} 🪙`, inline: true }
  );

  return embed;
}

module.exports = {
  generateFarmGrid,
  generateFarmDetails,
  createFarmViewEmbed,
  createFarmStatsEmbed,
  createHarvestEmbed
}; 