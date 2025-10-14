const { EmbedBuilder } = require('discord.js');
const { getCurrentWeather, getWeatherEffects } = require('./weather');
const { getQualityDisplay, isCropReadyWithQuality } = require('./quality');
const { SEED_TYPES } = require('./constants');
const { formatDuration } = require('../../utils/formatting');

// Farm themes
const FARM_THEMES = {
  CLASSIC: {
    name: 'Classic',
    emoji: '🌾',
    plotEmpty: '⬜',
    plotGrowing: '🟫',
    plotReady: '🟢',
    description: 'Traditional farming style'
  },
  MODERN: {
    name: 'Modern',
    emoji: '🏭',
    plotEmpty: '⬛',
    plotGrowing: '🟦',
    plotReady: '🟩',
    description: 'Industrial farming approach'
  },
  ORGANIC: {
    name: 'Organic',
    emoji: '🌱',
    plotEmpty: '🟫',
    plotGrowing: '🟨',
    plotReady: '🟩',
    description: 'Natural and sustainable farming'
  },
  MAGICAL: {
    name: 'Magical',
    emoji: '✨',
    plotEmpty: '💫',
    plotGrowing: '🌟',
    plotReady: '💎',
    description: 'Enchanted farming with mystical effects'
  }
};

// Weather visual effects
const WEATHER_EFFECTS = {
  CLEAR: { emoji: '☀️', effect: '' },
  RAINY: { emoji: '🌧️', effect: '💧' },
  DROUGHT: { emoji: '🌵', effect: '🔥' },
  STORM: { emoji: '⛈️', effect: '⚡' },
  FOGGY: { emoji: '🌫️', effect: '💨' }
};

// Generate farm map visualization
async function generateFarmMap(farm, user, theme = 'CLASSIC') {
  const themeData = FARM_THEMES[theme] || FARM_THEMES.CLASSIC;
  const weather = await getCurrentWeather();
  const weatherEffect = WEATHER_EFFECTS[weather.currentWeather] || WEATHER_EFFECTS.CLEAR;
  
  let map = `${weatherEffect.emoji} **${user.username}'s Farm** ${weatherEffect.emoji}\n`;
  map += `Weather: ${weatherEffect.emoji} ${weather.currentWeather}\n\n`;
  
  // Generate plot grid
  const plotsPerRow = 5;
  const totalPlots = farm.plots.length;
  
  for (let i = 0; i < totalPlots; i += plotsPerRow) {
    let row = '';
    for (let j = 0; j < plotsPerRow && i + j < totalPlots; j++) {
      const plotIndex = i + j;
      const plot = farm.plots[plotIndex];
      
      if (!plot) {
        row += themeData.plotEmpty;
      } else if (isCropReadyWithQuality(plot)) {
        row += themeData.plotReady;
      } else {
        row += themeData.plotGrowing;
      }
      
      row += ' ';
    }
    map += row + '\n';
  }
  
  // Add plot numbers
  let plotNumbers = '';
  for (let i = 0; i < totalPlots; i += plotsPerRow) {
    let row = '';
    for (let j = 0; j < plotsPerRow && i + j < totalPlots; j++) {
      const plotNum = i + j + 1;
      row += `${plotNum.toString().padStart(2, '0')} `;
    }
    plotNumbers += row + '\n';
  }
  
  map += '\n' + plotNumbers;
  
  return map;
}

// Generate detailed farm view with crop information
async function generateDetailedFarmView(farm, user, theme = 'CLASSIC') {
  const themeData = FARM_THEMES[theme] || FARM_THEMES.CLASSIC;
  const weather = await getCurrentWeather();
  const weatherEffect = WEATHER_EFFECTS[weather.currentWeather] || WEATHER_EFFECTS.CLEAR;
  
  let view = `${weatherEffect.emoji} **${user.username}'s Farm** ${themeData.emoji}\n`;
  view += `Weather: ${weatherEffect.emoji} ${weather.currentWeather}\n\n`;
  
  // Generate detailed plot information
  const plotsPerRow = 3;
  const totalPlots = farm.plots.length;
  
  for (let i = 0; i < totalPlots; i += plotsPerRow) {
    let row = '';
    for (let j = 0; j < plotsPerRow && i + j < totalPlots; j++) {
      const plotIndex = i + j;
      const plot = farm.plots[plotIndex];
      
      if (!plot) {
        row += `${themeData.plotEmpty} **Plot ${plotIndex + 1}**: Empty\n`;
      } else {
        const seed = SEED_TYPES.find(s => s.name === plot.seedName);
        const qualityDisplay = plot.quality && plot.quality !== 'COMMON' ? getQualityDisplay(plot.quality, plot.variant) : null;
        const emoji = qualityDisplay?.emoji || seed?.emoji || '🌱';
        
        if (isCropReadyWithQuality(plot)) {
          row += `${themeData.plotReady} **Plot ${plotIndex + 1}**: ${emoji} ${plot.seedName} (Ready!)\n`;
        } else {
          const timeLeft = plot.plantedAt + plot.growTime - Date.now();
          const timeString = timeLeft > 0 ? formatDuration(timeLeft) : 'Ready!';
          row += `${themeData.plotGrowing} **Plot ${plotIndex + 1}**: ${emoji} ${plot.seedName} (${timeString})\n`;
        }
      }
    }
    view += row + '\n';
  }
  
  return view;
}

// Generate farm statistics visualization
function generateFarmStats(farm, user) {
  const stats = farm.stats || {};
  
  let statsView = `📊 **${user.username}'s Farm Statistics**\n\n`;
  
  // Crops grown
  if (stats.grown && Object.keys(stats.grown).length > 0) {
    statsView += '🌱 **Crops Grown:**\n';
    for (const [crop, count] of Object.entries(stats.grown)) {
      const seed = SEED_TYPES.find(s => s.name === crop);
      const emoji = seed?.emoji || '🌱';
      statsView += `${emoji} ${crop}: ${count}\n`;
    }
    statsView += '\n';
  }
  
  // Crops sold
  if (stats.sold && Object.keys(stats.sold).length > 0) {
    statsView += '💰 **Crops Sold:**\n';
    for (const [crop, count] of Object.entries(stats.sold)) {
      const seed = SEED_TYPES.find(s => s.name === crop);
      const emoji = seed?.emoji || '🌱';
      statsView += `${emoji} ${crop}: ${count}\n`;
    }
    statsView += '\n';
  }
  
  // Total earnings
  if (stats.coinsEarned) {
    statsView += `💎 **Total Earnings**: ${stats.coinsEarned.toLocaleString()} 🪙\n\n`;
  }
  
  // Farm upgrades
  if (farm.upgrades) {
    statsView += '⚡ **Farm Upgrades:**\n';
    if (farm.upgrades.growth && Object.values(farm.upgrades.growth).reduce((a, b) => a + b, 0) > 0) {
      const totalGrowthBoosts = Object.values(farm.upgrades.growth).reduce((a, b) => a + b, 0);
      statsView += `Growth Speed: +${totalGrowthBoosts * 10}%\n`;
    }
    if (farm.upgrades.value && Object.values(farm.upgrades.value).reduce((a, b) => a + b, 0) > 0) {
      const totalValueBoosts = Object.values(farm.upgrades.value).reduce((a, b) => a + b, 0);
      statsView += `Value Boost: +${totalValueBoosts * 20}%\n`;
    }
    if (farm.upgrades.quality) {
      statsView += `Quality Boost: +${Object.values(farm.upgrades.quality).reduce((a, b) => a + b, 0) * 10}%\n`;
    }
  }
  
  return statsView;
}

// Generate weather forecast visualization
async function generateWeatherForecast() {
  const { getWeatherForecast } = require('./weather');
  const forecast = await getWeatherForecast();
  
  let forecastView = '🌤️ **Weather Forecast**\n\n';
  
  for (let i = 0; i < forecast.length; i++) {
    const weather = forecast[i];
    const timeString = new Date(weather.startTime).toLocaleTimeString();
    forecastView += `${weather.emoji} **${weather.name}** - ${timeString}\n`;
    forecastView += `Duration: ${formatDuration(weather.duration)}\n\n`;
  }
  
  return forecastView;
}

// Create farm embed with visualization
async function createFarmVisualizationEmbed(user, farm, theme = 'CLASSIC') {
  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle(`${user.username}'s Farm`)
    .setThumbnail(user.displayAvatarURL())
    .setTimestamp();
  
  // Add farm map
  const farmMap = await generateFarmMap(farm, user, theme);
  embed.addFields({
    name: '🌾 Farm Map',
    value: farmMap,
    inline: false
  });
  
  // Add weather info
  const weather = await getCurrentWeather();
  const weatherEffects = getWeatherEffects(weather.currentWeather);
  embed.addFields({
    name: '🌤️ Current Weather',
    value: `${weatherEffects.emoji} **${weatherEffects.name}**\n${weatherEffects.description}\nGrowth: ${Math.round(weatherEffects.growthMultiplier * 100)}% | Value: ${Math.round(weatherEffects.valueMultiplier * 100)}%`,
    inline: true
  });
  
  // Add farm info
  const emptyPlots = farm.plots.filter(p => !p).length;
  const readyPlots = farm.plots.filter(p => p && isCropReadyWithQuality(p)).length;
  embed.addFields({
    name: '📊 Farm Status',
    value: `Plots: ${farm.plots.length}\nEmpty: ${emptyPlots}\nReady: ${readyPlots}\nGrowing: ${farm.plots.length - emptyPlots - readyPlots}`,
    inline: true
  });
  
  return embed;
}

module.exports = {
  FARM_THEMES,
  WEATHER_EFFECTS,
  generateFarmMap,
  generateDetailedFarmView,
  generateFarmStats,
  generateWeatherForecast,
  createFarmVisualizationEmbed
}; 