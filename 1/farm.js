const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../utils/formatting');
const { 
  handlePlant,
  handleCollect,
  handleView,
  handleSell,
  handleExpand,
  handleAutoPlant,
  handleAutoCollect,
  handleRemovePlot,
  handleStats,
  handleHarvest,
  handleSpeed,
  handleFertilize,
  handlePlantMulti,
  handleValue,
  handleNotification,
  handleWeather,
  handleTheme,
  handleMap,
  handleQualityUpgrade,
  handleInventory,
  handleMarket,
  handleHelp,
  handleStatus,
  handleValidate,
  handleTestAuto
} = require('./farm/handlers/index');
const { setClient } = require('./farm/autoFarm');
const { SEED_TYPES } = require('./farm/constants');
const { updateWeather } = require('./farm/weather');
const { isUserBlacklisted } = require('../utils/utils');
const { checkRateLimit } = require('../utils/rateLimiting');
const { withSafeReply } = require('../utils/safeReply');
const { validators } = require('../utils/validation');
const logger = require('../logger');

const rateLimiter = (userId) => checkRateLimit(userId, 'farm', 3, 5000);

// Initialize auto-farming when module is loaded
// initializeAutoFarming().catch(error => {
//   console.error('Failed to initialize auto-farming:', error);
// });

// Initialize weather system
setInterval(async () => {
  try {
    await updateWeather();
  } catch (error) {
    logger.error('Failed to update weather:', error);
  }
}, 5 * 60 * 1000); // Update weather every 5 minutes

module.exports = {
    data: new SlashCommandBuilder()
      .setName('farm')
    .setDescription('Manage your farm and grow crops!')
    .addSubcommand(subcommand =>
      subcommand
        .setName('help')
        .setDescription('Show all farm commands and how to use them'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Show detailed farm status and debugging info'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('validate')
        .setDescription('OWNER ONLY: Validate and fix farm data integrity'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('plant')
          .setDescription('Plant seeds in your farm')
        .addStringOption(option =>
          option.setName('seed')
            .setDescription('The seed to plant')
              .setRequired(true)
              .setAutocomplete(true))
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('Number of seeds to plant')
              .setRequired(true)
              .setMinValue(1)
            .setMaxValue(10)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('collect')
        .setDescription('Collect all ready crops from your farm'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View your farm status'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('sell')
        .setDescription('Sell all harvested crops'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('expand')
        .setDescription('Expand your farm with more plots'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('autoplant')
        .setDescription('Toggle auto-planting (requires Worker)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('autocollect')
        .setDescription('Toggle auto-collecting (requires Worker)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('removeplot')
        .setDescription('Remove the last empty plot for a refund'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('View your farm statistics'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('harvest')
        .setDescription('Harvest a specific plot')
        .addIntegerOption(option =>
          option.setName('plot')
            .setDescription('Plot number to harvest')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(20)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('speed')
        .setDescription('Upgrade plot growth speed (requires planted crop)')
        .addIntegerOption(option =>
          option.setName('plot')
            .setDescription('Plot number to upgrade')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(20)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('fertilize')
        .setDescription('Apply fertilizer to a specific plot (requires Fertilizer)')
        .addIntegerOption(option =>
          option.setName('plot')
            .setDescription('Plot number to fertilize')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(20)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('plantmulti')
        .setDescription('Plant multiple types of seeds at once')
        .addStringOption(option =>
          option.setName('seed1')
            .setDescription('First seed type')
            .setAutocomplete(true))
        .addIntegerOption(option =>
          option.setName('amount1')
            .setDescription('Amount of first seed')
            .setMinValue(1)
            .setMaxValue(5))
        .addStringOption(option =>
          option.setName('seed2')
            .setDescription('Second seed type')
            .setAutocomplete(true))
        .addIntegerOption(option =>
          option.setName('amount2')
            .setDescription('Amount of second seed')
            .setMinValue(1)
            .setMaxValue(5))
        .addStringOption(option =>
          option.setName('seed3')
            .setDescription('Third seed type')
            .setAutocomplete(true))
        .addIntegerOption(option =>
          option.setName('amount3')
            .setDescription('Amount of third seed')
            .setMinValue(1)
            .setMaxValue(5))
        .addStringOption(option =>
          option.setName('seed4')
            .setDescription('Fourth seed type')
            .setAutocomplete(true))
        .addIntegerOption(option =>
          option.setName('amount4')
            .setDescription('Amount of fourth seed')
            .setMinValue(1)
            .setMaxValue(5))
        .addStringOption(option =>
          option.setName('seed5')
            .setDescription('Fifth seed type')
            .setAutocomplete(true))
        .addIntegerOption(option =>
          option.setName('amount5')
            .setDescription('Amount of fifth seed')
            .setMinValue(1)
            .setMaxValue(5)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('value')
        .setDescription('Upgrade plot crop value (requires planted crop)')
        .addIntegerOption(option =>
          option.setName('plot')
            .setDescription('Plot number to upgrade value')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(20)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('notification')
        .setDescription('Toggle DM notifications for auto-farming'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('weather')
        .setDescription('Check current weather and forecast'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('theme')
        .setDescription('Change your farm visualization theme')
        .addStringOption(option =>
          option.setName('theme')
            .setDescription('Farm theme to use')
            .setRequired(true)
            .addChoices(
              { name: '🌾 Classic', value: 'CLASSIC' },
              { name: '🏭 Modern', value: 'MODERN' },
              { name: '🌱 Organic', value: 'ORGANIC' },
              { name: '✨ Magical', value: 'MAGICAL' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('map')
        .setDescription('View your farm as a visual map'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('inventory')
        .setDescription('Show your farm inventory (seeds, workers, fertilizer)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('qualityupgrade')
        .setDescription('Upgrade plot quality for better crop chances')
        .addIntegerOption(option =>
          option.setName('plot')
            .setDescription('Plot number to upgrade quality')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(20)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('market')
        .setDescription('View market prices and rarity information for all crops'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('testauto')
        .setDescription('OWNER ONLY: Test auto-farming system immediately')),

  execute: withSafeReply(async (interaction) => {
    // Interaction is already deferred by the global handler
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in farm command: ${userId}`);
      return await reply(interaction, { 
        content: '❌ Invalid user ID!', 
        flags: 1 << 6 
      });
    }

    // Set client reference for auto-farming DM notifications
    if (!global.clientSet) {
      setClient(interaction.client);
      global.clientSet = true;
    }

      switch (subcommand) {
        case 'help':
          return await handleHelp(interaction);
        case 'plant':
          return await handlePlant(interaction);
        case 'collect':
          return await handleCollect(interaction);
        case 'view':
          return await handleView(interaction);
        case 'sell':
          return await handleSell(interaction);
        case 'expand':
          return await handleExpand(interaction);
        case 'autoplant':
          return await handleAutoPlant(interaction);
        case 'autocollect':
          return await handleAutoCollect(interaction);
        case 'removeplot':
          return await handleRemovePlot(interaction);
        case 'stats':
          return await handleStats(interaction);
        case 'harvest':
          return await handleHarvest(interaction);
        case 'speed':
          return await handleSpeed(interaction);
        case 'fertilize':
          return await handleFertilize(interaction);
        case 'plantmulti':
          return await handlePlantMulti(interaction);
        case 'value':
          return await handleValue(interaction);
        case 'notification':
          return await handleNotification(interaction);
        case 'weather':
          return await handleWeather(interaction);
        case 'theme':
          return await handleTheme(interaction);
        case 'map':
          return await handleMap(interaction);
        case 'inventory':
          return await handleInventory(interaction);
        case 'qualityupgrade':
          return await handleQualityUpgrade(interaction);
        case 'market':
          return await handleMarket(interaction);
        case 'testauto':
          return await handleTestAuto(interaction);
        case 'status':
          return await handleStatus(interaction);
        case 'validate':
          return await handleValidate(interaction);
        default:
          return await reply(interaction, { content: '❌ Unknown subcommand!', flags: 1 << 6 });
      }
  }, { isUserBlacklisted, rateLimiter }),

    autocomplete: async (interaction) => {
      if (['plant', 'plantmulti'].includes(interaction.options.getSubcommand())) {
        const focused = interaction.options.getFocused(true);
        if (!focused.name.startsWith('seed')) return;
        const userId = interaction.user.id;
        
        // Input validation for autocomplete
        if (!validators.userId(userId)) {
          return await interaction.respond([]);
        }
        
        const { getUser } = require('../utils/utils');
        const user = await getUser(userId, { farmInventory: 1 });
        
        // Check farm inventory for seeds
        const seedTypes = new Set();
        if (user && user.farmInventory) {
          for (const [itemName, itemData] of Object.entries(user.farmInventory)) {
            if (itemData.count > 0 && SEED_TYPES.some(s => s.name === itemName)) {
              seedTypes.add(itemName);
            }
          }
        }
        
        const choices = Array.from(seedTypes).map(name => ({ name, value: name }));
        await interaction.respond(choices.slice(0, 25));
      }
    }
};

module.exports.SEED_TYPES = SEED_TYPES; 