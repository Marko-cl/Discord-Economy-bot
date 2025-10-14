const { SlashCommandBuilder } = require('discord.js');
const { checkRateLimit } = require('../utils/rateLimiting');
const { withSafeReply } = require('../utils/safeReply');
const { reply } = require('../utils/formatting');

const logger = require('../logger');

// Import all modular handlers
const coreHandlers = require('./guilds/core');
const basicHandlers = require('./guilds/basic');
const economyHandlers = require('./guilds/economy');
const membersHandlers = require('./guilds/members');
const activitiesHandlers = require('./guilds/activities');
const advancedHandlers = require('./guilds/advanced');
const searchHandlers = require('./guilds/search');
const settingsHandlers = require('./guilds/settings');
const { managementHandlers } = require('./guilds/management');

const rateLimiter = (userId) => checkRateLimit(userId, 'guild', 5, 10000);

// Combine all handlers into a single object
const guildHandlers = {
  ...coreHandlers,
  ...basicHandlers,
  ...economyHandlers,
  ...membersHandlers,
  ...activitiesHandlers,
  ...advancedHandlers,
  ...searchHandlers,
  ...settingsHandlers,
  ...managementHandlers
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guild')
    .setDescription('Manage guilds and guild-related features')
    .addSubcommand(subcommand =>
      subcommand
        .setName('help')
        .setDescription('Show guild command help')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new guild')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Guild name')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Guild description')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('View guild information')
        .addStringOption(option =>
          option.setName('guild')
            .setDescription('Guild name (optional, shows your guild if not specified)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('join')
        .setDescription('Join a guild')
        .addStringOption(option =>
          option.setName('guild')
            .setDescription('Guild name')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('leave')
        .setDescription('Leave your current guild')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('cooldown')
        .setDescription('Check guild cooldowns')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('vault')
        .setDescription('Manage guild vault')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'View', value: 'view' },
              { name: 'Deposit', value: 'deposit' },
              { name: 'Withdraw', value: 'withdraw' }
            )
        )
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('Amount of coins')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('business')
        .setDescription('Manage guild business')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'View', value: 'view' },
              { name: 'Start', value: 'start' },
              { name: 'Collect', value: 'collect' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('payout')
        .setDescription('Manage guild payouts')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'View', value: 'view' },
              { name: 'Distribute', value: 'distribute' },
              { name: 'Set Rate', value: 'setrate' }
            )
        )
        .addIntegerOption(option =>
          option.setName('rate')
            .setDescription('Payout rate percentage')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('treasury')
        .setDescription('Manage guild treasury')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'View', value: 'view' },
              { name: 'Invest', value: 'invest' },
              { name: 'Withdraw', value: 'withdraw' }
            )
        )
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('Amount of coins')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('members')
        .setDescription('View guild members')
        .addStringOption(option =>
          option.setName('guild')
            .setDescription('Guild name (optional)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('apply')
        .setDescription('Apply to join a guild')
        .addStringOption(option =>
          option.setName('guild')
            .setDescription('Guild name')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('applications')
        .setDescription('Manage guild applications (owner/officer only)')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Action to perform')
            .setRequired(false)
            .addChoices(
              { name: 'View', value: 'view' },
              { name: 'Accept', value: 'accept' },
              { name: 'Reject', value: 'reject' }
            )
        )
        .addStringOption(option =>
          option.setName('user')
            .setDescription('User ID to accept/reject (required for accept/reject actions)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('invite')
        .setDescription('Invite a user to your guild')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to invite')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('invitecode')
        .setDescription('Generate an invite code for your guild')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('kick')
        .setDescription('Kick a member from your guild')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to kick')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('promote')
        .setDescription('Promote a member to officer')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to promote')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('demote')
        .setDescription('Demote an officer to member')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to demote')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('transfer')
        .setDescription('Transfer guild ownership')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('New owner')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('disband')
        .setDescription('Disband your guild')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete a guild (owner only)')
        .addStringOption(option =>
          option.setName('guild')
            .setDescription('Name of the guild to delete')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Edit guild settings')
        .addStringOption(option =>
          option.setName('setting')
            .setDescription('Setting to edit')
            .setRequired(true)
            .addChoices(
              { name: 'Name', value: 'name' },
              { name: 'Description', value: 'description' },
              { name: 'Privacy', value: 'privacy' }
            )
        )
        .addStringOption(option =>
          option.setName('value')
            .setDescription('New value')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('search')
        .setDescription('Search for guilds')
        .addStringOption(option =>
          option.setName('query')
            .setDescription('Search query')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('leaderboard')
        .setDescription('View guild leaderboard')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Leaderboard type')
            .setRequired(false)
            .addChoices(
              { name: 'Level', value: 'level' },
              { name: 'Members', value: 'members' },
              { name: 'Vault', value: 'vault' }
            )
        )
        .addIntegerOption(option =>
          option.setName('page')
            .setDescription('Page number (1-10)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(10)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('activity')
        .setDescription('View guild activity')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Activity type')
            .setRequired(false)
            .addChoices(
              { name: 'Recent', value: 'recent' },
              { name: 'Weekly', value: 'weekly' }
            )
        )
    ),

  execute: withSafeReply(async (interaction) => {
    // Apply rate limiting at the start of the command
    const userId = interaction.user.id;
    const rateLimitResult = rateLimiter(userId);
    if (!rateLimitResult.allowed) {
      return await reply(interaction, { content: rateLimitResult.message, ephemeral: true });
    }
    const subcommand = interaction.options.getSubcommand(false);
    // Map subcommand names to handler function names
    const handlerMap = {
      'help': 'handleHelp',
      'create': 'handleCreate',
      'info': 'handleInfo',
      'join': 'handleJoin',
      'leave': 'handleLeave',
      'cooldown': 'handleCooldown',
      'vault': 'handleVault',
      'business': 'handleBusiness',
      'payout': 'handlePayout',
      'treasury': 'handleTreasury',
      'members': 'handleMembers',
      'apply': 'handleApply',
      'applications': 'handleApplications',
      'invite': 'handleInvite',
      'invitecode': 'handleInviteCode',
      'kick': 'handleKick',
      'promote': 'handlePromote',
      'demote': 'handleDemote',
      'transfer': 'handleTransfer',
      'disband': 'handleDisband',
      'delete': 'handleDelete',
      'edit': 'handleEdit',
      'search': 'handleSearch',
      'leaderboard': 'handleLeaderboard',
      'activity': 'handleActivity'
    };
    const handlerName = handlerMap[subcommand];
    if (handlerName && typeof guildHandlers[handlerName] === 'function') {
      try {
        await guildHandlers[handlerName](interaction, interaction.user.id);
      } catch (err) {
        logger.error(`Error in guild command handler (${handlerName}):`, err);
        await reply(interaction, { content: 'An error occurred while processing your request.', ephemeral: true });
      }
    } else {
      await reply(interaction, { content: 'Unknown subcommand.', ephemeral: true });
    }
  }),

  autocomplete: async (interaction) => {
    const subcommand = interaction.options.getSubcommand();
    try {
      const handler = guildHandlers[subcommand];
      if (handler && handler.autocomplete) {
        return await handler.autocomplete(interaction);
      }
    } catch (error) {
      console.error('Guild autocomplete error:', error);
      await interaction.respond([]);
    }
  }
}; 