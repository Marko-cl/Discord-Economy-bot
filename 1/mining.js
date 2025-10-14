const { SlashCommandBuilder } = require('discord.js');
const { 
  handleMine,
  handleQuest,
  handleEquipment,
  handleMarket,
  handleContracts,
  handleInvestments,
  handleHoroscope,
  handleStats,
  handleUpgrade,
  handleTeam,
  handleSeason,
  handleHelp,
  handleStart,
  handleCollect,
  handleXp,
  handleGold
} = require('./mining/handlers/index');
const { initializeMiningSeasons } = require('./mining/seasons');
const { checkRateLimit } = require('../utils/rateLimiting');
const { withSafeReply } = require('../utils/safeReply');
const { reply } = require('../utils/formatting');

// Initialize mining seasons when module is loaded
initializeMiningSeasons().catch(error => {
  console.error('Failed to initialize mining seasons:', error);
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mine')
    .setDescription('Mine for ores and materials!')
    .addSubcommand(subcommand =>
      subcommand
        .setName('help')
        .setDescription('Show all mining commands and how to use them'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('mine')
        .setDescription('Mine for ores and materials')
        .addStringOption(option =>
          option.setName('tool')
            .setDescription('Mining tool to use')
            .setRequired(false)
            .setAutocomplete(true))
        .addStringOption(option =>
          option.setName('depth')
            .setDescription('Mining depth (surface, shallow, deep, cavern)')
            .setRequired(false)
            .addChoices(
              { name: 'Surface', value: 'surface' },
              { name: 'Shallow', value: 'shallow' },
              { name: 'Deep', value: 'deep' },
              { name: 'Cavern', value: 'cavern' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Start a 12-hour mining session (requires Pickaxe)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('collect')
        .setDescription('Collect your mining rewards after 12 hours'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('xp')
        .setDescription('Check your mining XP and level progress'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('gold')
        .setDescription('Check your total gold earned from mining'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('quest')
        .setDescription('View and complete mining quests')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('What to do with quests')
            .setRequired(false)
            .addChoices(
              { name: 'View', value: 'view' },
              { name: 'Accept', value: 'accept' },
              { name: 'Complete', value: 'complete' },
              { name: 'Abandon', value: 'abandon' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('equipment')
        .setDescription('Manage your mining equipment')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Equipment action')
            .setRequired(false)
            .addChoices(
              { name: 'View', value: 'view' },
              { name: 'Upgrade', value: 'upgrade' },
              { name: 'Repair', value: 'repair' },
              { name: 'Enchant', value: 'enchant' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('market')
        .setDescription('Buy and sell ores in the mining market')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Market action')
            .setRequired(false)
            .addChoices(
              { name: 'View', value: 'view' },
              { name: 'Buy', value: 'buy' },
              { name: 'Sell', value: 'sell' },
              { name: 'Prices', value: 'prices' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('contracts')
        .setDescription('Accept mining contracts from NPCs')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Contract action')
            .setRequired(false)
            .addChoices(
              { name: 'View', value: 'view' },
              { name: 'Accept', value: 'accept' },
              { name: 'Complete', value: 'complete' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('investments')
        .setDescription('Invest in mining equipment and stocks')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Investment action')
            .setRequired(false)
            .addChoices(
              { name: 'View', value: 'view' },
              { name: 'Buy', value: 'buy' },
              { name: 'Sell', value: 'sell' },
              { name: 'Portfolio', value: 'portfolio' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('horoscope')
        .setDescription('Check your daily mining horoscope')
        .addStringOption(option =>
          option.setName('sign')
            .setDescription('Your zodiac sign')
            .setRequired(false)
            .addChoices(
              { name: 'Aries', value: 'aries' },
              { name: 'Taurus', value: 'taurus' },
              { name: 'Gemini', value: 'gemini' },
              { name: 'Cancer', value: 'cancer' },
              { name: 'Leo', value: 'leo' },
              { name: 'Virgo', value: 'virgo' },
              { name: 'Libra', value: 'libra' },
              { name: 'Scorpio', value: 'scorpio' },
              { name: 'Sagittarius', value: 'sagittarius' },
              { name: 'Capricorn', value: 'capricorn' },
              { name: 'Aquarius', value: 'aquarius' },
              { name: 'Pisces', value: 'pisces' }
            )))

    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('View your mining statistics'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('upgrade')
        .setDescription('Upgrade your mining skills and tools')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('What to upgrade')
            .setRequired(false)
            .addChoices(
              { name: 'Efficiency', value: 'efficiency' },
              { name: 'Luck', value: 'luck' },
              { name: 'Depth', value: 'depth' },
              { name: 'Capacity', value: 'capacity' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('team')
        .setDescription('Mine with your guild team for bonus rewards')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Team action')
            .setRequired(false)
            .addChoices(
              { name: 'Start', value: 'start' },
              { name: 'Join', value: 'join' },
              { name: 'Status', value: 'status' },
              { name: 'End', value: 'end' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('season')
        .setDescription('Check current mining season and effects')),

  execute: withSafeReply(async (interaction) => {
    // Apply rate limiting at the start of the command
    const userId = interaction.user.id;
    const rateLimitResult = checkRateLimit(userId);
    if (!rateLimitResult.allowed) {
      return await reply(interaction, { content: rateLimitResult.message, ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand(false);
    // Map subcommand names to handler function names
    const handlerMap = {
      mine: handleMine,
      start: handleStart,
      collect: handleCollect,
      xp: handleXp,
      gold: handleGold,
      quest: handleQuest,
      equipment: handleEquipment,
      market: handleMarket,
      contracts: handleContracts,
      investments: handleInvestments,
      horoscope: handleHoroscope,
      stats: handleStats,
      upgrade: handleUpgrade,
      team: handleTeam,
      season: handleSeason,
      help: handleHelp
    };
    const handlerName = handlerMap[subcommand];
    if (handlerName && typeof handlerName === 'function') {
      try {
        await handlerName(interaction);
      } catch (err) {
        console.error(`Error in mining command handler (${handlerName}):`, err);
        await reply(interaction, { content: 'An error occurred while processing your request.', ephemeral: true });
      }
    } else {
      await reply(interaction, { content: 'Unknown subcommand.', ephemeral: true });
    }
  })
}; 