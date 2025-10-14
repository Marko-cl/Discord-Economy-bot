const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUser, isUserBlacklisted, isSafeDiscordId } = require('../utils/utils');
const { checkRateLimit } = require('../utils/rateLimiting');
const { reply } = require('../utils/formatting');

const logger = require('../logger');

const rateLimiter = (userId) => checkRateLimit(userId, 'helpUI', 10, 3000); // 10 uses per 3 seconds for help UI

// Comprehensive command categories with all available commands
const COMMAND_CATEGORIES = {
  'Economy': [
    'balance', 'daily', 'beg', 'work', 'inventory', 'xp', 'prestige', 'mine', 'leaderboard', 
    'weeklylb', 'profile', 'quest', 'seasonal', 'give', 
    'remove', 'mysteryrewards', 'craterewards', 'goldmine'
  ],
  'Games': [
    'fish', 'dig', 'slots', 'bet', 'gamble', 'duel', 'heist', 'rob', 'quiz', 'coinflip', 'dice', 'rps', '8ball', 'party', 'battle',
    'combat', 'activities', 'gambling'
  ],
  'Social': [
    'trade', 'gift', 'party', 'afk', 'social'
  ],
  'Premium': [
    'meme', 'boosters', 'boosterinfo', 'color', 'use', 'shop'
  ],
  'Farming': [
    'farm'
  ],
  'Pets': [
    'pet'
  ],
  'Guilds': [
    'guild'
  ],
  'Fishing': [
    'fish', 'lbfish'
  ],
  'Utility': [
    'help', 'timer', 'pinglu'
  ],
  'Admin': [
    'admin', 'resetprestige', 'resetlevel', 'lbcreate', 'lbannounce', 'skip', 'owner'
  ]
};

// Emojis for each category
const CATEGORY_EMOJIS = {
  'Economy': '🪙',
  'Games': '🎮',
  'Social': '🤝',
  'Premium': '💎',
  'Farming': '🌾',
  'Pets': '🤖',
  'Guilds': '🏰',
  'Fishing': '🎣',
  'Utility': '🔧',
  'Admin': '⚙️'
};

async function showHelpUI(interaction, userId) {
  if (!isSafeDiscordId(userId)) {
    return reply(interaction, 'Invalid user ID.');
  }
  if (isUserBlacklisted(userId)) {
    if (!(interaction.replied || interaction.deferred)) return reply(interaction, '❌ You are blacklisted from using bot commands.');
    return;
  }
  const rateLimitResult = rateLimiter(userId);
  if (!rateLimitResult.allowed) {
    if (!(interaction.replied || interaction.deferred)) return reply(interaction, rateLimitResult.message.toString());
    return;
  }
  
  let user;
  try {
    user = await getUser(userId, { coins: 1, inventory: 1 });
  } catch (err) {
    logger.error('[HELPUI] DB error in showHelpUI getUser:', err);
    try {
      await reply(interaction, 'Database error. Please try again later.');
    } catch (apiErr) {
      logger.error('[HELPUI] Discord API error in showHelpUI getUser:', apiErr);
    }
    return;
  }

  // Validate user object structure
  if (typeof user !== 'object' || user === null) {
    try {
      await reply(interaction, 'User data is corrupted.');
    } catch (err) {
      logger.error('[HELPUI] Discord API error in showHelpUI user data corrupted:', err);
    }
    return;
  }

  let embedColor;
  try {
    embedColor = require('../utils/utils').getUserEmbedColor(user);
  } catch (err) {
    logger.warn('[HELPUI] Error getting user embed color in showHelpUI:', err);
    embedColor = 0x0099ff; // Default blue color
  }

  const getIntroEmbed = () => new EmbedBuilder()
    .setTitle('🤖 Kelonomy Bot Help')
    .setDescription('Welcome to the interactive help system! Pick a category below to see all available commands.\n\n💡 **Tip:** Click on any command to get detailed information about it!')
    .setColor(embedColor)
    .setFooter({ text: 'Kelonomy Bot Help System • Use /help <command> for specific help' })
    .setTimestamp();

  const getCategorySelectRow = () => new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_cat_select')
      .setPlaceholder('Select a command category')
      .addOptions(Object.keys(COMMAND_CATEGORIES).map(cat => ({
        label: cat,
        value: cat,
        emoji: CATEGORY_EMOJIS[cat] || undefined
      })))
  );

  const getCloseRow = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('help_close')
      .setLabel('❌ Close')
      .setStyle(ButtonStyle.Danger)
  );

  const getBackRow = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('help_back')
      .setLabel('⬅️ Back to Categories')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('help_close')
      .setLabel('❌ Close')
      .setStyle(ButtonStyle.Danger)
  );

  try {
    await reply(interaction, '', { 
      embeds: [getIntroEmbed()], 
      components: [getCategorySelectRow(), getCloseRow()], 
      ephemeral: false 
    });
  } catch (err) {
    logger.error('Error sending help intro embed in showHelpUI:', err);
    return;
  }

  const collector = interaction.channel.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id && ['help_cat_select', 'help_back', 'help_close'].includes(i.customId),
    time: 5 * 60 * 1000
  });

  // Cleanup function to prevent memory leaks
  const cleanup = () => {
    if (collector && !collector.ended) {
      collector.stop('cleanup');
    }
    active = false;
  };

  let active = true;
  
  // Add error handler for collector
  collector.on('error', (error) => {
    logger.error('Help UI collector error:', error);
    cleanup();
  });

  collector.on('collect', async i => {
    try {
      // Check if interaction is still valid
      if (!i || i.ended || !i.isRepliable()) {
        return;
      }

      if (i.customId === 'help_close') {
        active = false;
        cleanup();
        try {
          await i.update({ content: 'Help menu closed. Type /help to open again.', embeds: [], components: [], flags: 1 << 6 });
        } catch { /* intentionally ignored: update errors for close action */ }
        return;
      }

      if (i.customId === 'help_cat_select') {
        const cat = i.values[0];
        const catCommands = COMMAND_CATEGORIES[cat] || [];
        
        let embedColorCat;
        try {
          embedColorCat = require('../utils/utils').getUserEmbedColor(user);
        } catch (err) {
          logger.warn('Error getting user embed color in help_cat_select:', err);
          embedColorCat = 0x0099ff; // Default blue color
        }

        // Get actual command data from client
        const commands = interaction.client.commands;
        const availableCommands = catCommands
          .map(cmdName => commands.get(cmdName))
          .filter(cmd => cmd) // Filter out undefined commands
          .sort((a, b) => a.data.name.localeCompare(b.data.name));

        const catEmbed = new EmbedBuilder()
          .setTitle(`${CATEGORY_EMOJIS[cat] || ''} ${cat} Commands`)
          .setDescription(availableCommands.length > 0 
            ? availableCommands.map(cmd => `\`/${cmd.data.name}\` - ${cmd.data.description || 'No description'}`).join('\n')
            : 'No commands available in this category.')
          .setColor(embedColorCat)
          .setFooter({ text: 'Kelonomy Bot Help • Use /help <command> for detailed info' })
          .setTimestamp();

        try {
          await i.update({ embeds: [catEmbed], components: [getBackRow()], ephemeral: false });
        } catch (updateErr) {
          logger.error('Error updating help category select:', updateErr);
        }
        return;
      }

      if (i.customId === 'help_back') {
        try {
          await i.update({ embeds: [getIntroEmbed()], components: [getCategorySelectRow(), getCloseRow()], ephemeral: false });
        } catch (updateErr) {
          logger.error('Error updating help back button:', updateErr);
        }
        return;
      }
    } catch (err) {
      logger.error('Error handling help UI interaction:', err);
    }
  });

  collector.on('end', async (collected, reason) => {
    if (active && reason !== 'cleanup') {
      try {
        await reply(interaction, 'Help menu expired. Type /help to open again.');
      } catch (err) {
        logger.error('Error sending help menu expired message:', err);
      }
    }
    active = false;
  });

  // Cleanup on process exit
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

module.exports = { showHelpUI };