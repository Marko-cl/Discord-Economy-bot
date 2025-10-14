const { SlashCommandBuilder } = require('discord.js');
const { checkRateLimit } = require('../../utils/rateLimiting');
const { withSafeReply } = require('../../utils/safeReply');
const { validators } = require('../../utils/validation');
const { 
  handleFish, 
  handleInventory, 
  handleHelp,
  handleSell,
  handleMarket,
  handleRod,
  handleBait,
  handleBooster,
  handleLeaderboard
} = require('./handlers');

const rateLimiter = (userId) => checkRateLimit(userId, 'fish', 3, 5000);

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('fish')
      .setDescription('Go fishing, view your fish, and learn about the fishing system!')
      .addSubcommand(subcommand =>
        subcommand
          .setName('inventory')
          .setDescription('View your fish collection and inventory'))
      .addSubcommand(subcommand =>
        subcommand
          .setName('sell')
          .setDescription('Sell your fish for coins (use without options to sell all fish)')
          .addStringOption(option =>
            option.setName('fish')
              .setDescription('Fish to sell (optional - leave empty to sell all fish)')
              .setRequired(false)
              .setAutocomplete(true))
          .addIntegerOption(option =>
            option.setName('amount')
              .setDescription('Amount to sell (optional - leave empty to sell all of that fish)')
              .setRequired(false)
              .setMinValue(1)
              .setMaxValue(100)))
      .addSubcommand(subcommand =>
        subcommand
          .setName('market')
          .setDescription('Check fish market prices and fish of the day'))
      .addSubcommand(subcommand =>
        subcommand
          .setName('rod')
          .setDescription('Manage your fishing rod')
          .addStringOption(option =>
            option.setName('action')
              .setDescription('What to do with your rod')
              .setRequired(true)
              .addChoices(
                { name: 'View', value: 'view' },
                { name: 'Upgrade', value: 'upgrade' },
                { name: 'Skin', value: 'skin' }
              )))
      .addSubcommand(subcommand =>
        subcommand
          .setName('bait')
          .setDescription('Use bait for better catches')
          .addStringOption(option =>
            option.setName('type')
              .setDescription('Type of bait to use')
              .setRequired(true)
              .addChoices(
                { name: 'Basic Bait', value: 'basic_bait' },
                { name: 'Shiny Bait', value: 'shiny_bait' },
                { name: 'Golden Bait', value: 'golden_bait' },
                { name: 'Mystic Bait', value: 'mystic_bait' },
                { name: 'Celestial Bait', value: 'celestial_bait' }
              )))
      .addSubcommand(subcommand =>
        subcommand
          .setName('booster')
          .setDescription('Activate fishing boosters')
          .addStringOption(option =>
            option.setName('type')
              .setDescription('Type of booster to activate')
              .setRequired(true)
              .addChoices(
                { name: 'Fishing Luck Booster', value: 'luck_booster' },
                { name: 'Fish Value Booster', value: 'value_booster' },
                { name: 'Multi-Catch Booster', value: 'multi_catch_booster' },
                { name: 'Fishing Speed Booster', value: 'speed_booster' },
                { name: 'Mega Fishing Booster', value: 'mega_fishing_booster' }
              )))
      .addSubcommand(subcommand =>
        subcommand
          .setName('leaderboard')
          .setDescription('View fishing leaderboards')
          .addStringOption(option =>
            option.setName('type')
              .setDescription('Type of leaderboard')
              .setRequired(false)
              .addChoices(
                { name: 'Total Value', value: 'value' },
                { name: 'Fish Caught', value: 'caught' },
                { name: 'Collection', value: 'collection' }
              )))
      .addSubcommand(subcommand =>
        subcommand
          .setName('help')
          .setDescription('Show all fishing commands and how to use them'))
      .addSubcommand(subcommand =>
        subcommand
          .setName('f')
          .setDescription('Quick fish! Same as /fish')),

    execute: withSafeReply(async (interaction) => {
      const userId = interaction.user.id;
      
      // Input validation
      if (!validators.userId(userId)) {
        return { content: '❌ Invalid user ID detected.', flags: 1 << 6 };
      }

      const subcommand = interaction.options.getSubcommand(false);
      
      // Rate limiter check
      if (!rateLimiter(userId)) {
        return { content: '⏳ You are being rate limited. Please slow down.', flags: 1 << 6 };
      }

      try {
        if (!subcommand || subcommand === 'f') {
          return await handleFish(interaction);
        }
        
        switch (subcommand) {
          case 'inventory':
            return await handleInventory(interaction);
          case 'sell':
            return await handleSell(interaction);
          case 'market':
            return await handleMarket(interaction);
          case 'rod':
            return await handleRod(interaction);
          case 'bait':
            return await handleBait(interaction);
          case 'booster':
            return await handleBooster(interaction);
          case 'leaderboard':
            return await handleLeaderboard(interaction);
          case 'help':
            return await handleHelp(interaction);
          default:
            return { content: '❌ Unknown subcommand!', flags: 1 << 6 };
        }
      } catch (error) {
        console.error('[ERROR] /fish command error:', error);
        return { content: '❌ An error occurred while processing your fishing command!', flags: 1 << 6 };
      }
    }, { rateLimiter }),

    autocomplete: async (interaction) => {
      if (interaction.options.getSubcommand() === 'sell') {
        const focused = interaction.options.getFocused(true);
        if (focused.name === 'fish') {
          try {
            const { getUserFishingData } = require('./database');
            const { FISH_TYPES } = require('./constants');
            
            const userData = await getUserFishingData(interaction.user.id);
            const fishInventory = userData?.fishInventory || {};
            
            const userFish = FISH_TYPES.filter(fish => {
              const fishId = fish.name.toLowerCase().replace(/\s+/g, '_');
              return fishInventory[fishId] && fishInventory[fishId].count > 0;
            });
            
            const choices = userFish.map(fish => {
              const fishId = fish.name.toLowerCase().replace(/\s+/g, '_');
              const count = fishInventory[fishId].count;
              return { 
                name: `${fish.name} (${count}x)`, 
                value: fish.name 
              };
            });
            
            await interaction.respond(choices.slice(0, 25));
          } catch (error) {
            console.error('Autocomplete error:', error);
            await interaction.respond([]);
          }
        }
      }
    }
  }
]; 