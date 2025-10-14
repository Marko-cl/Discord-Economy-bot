const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { progressQuests } = require('../utils/utils');
const { withSafeReply } = require('../utils/safeReply');
const { reply } = require('../utils/formatting');

const logger = require('../logger');
const { showHelpUI } = require('./helpUI');

/**
 * /help command
 * Shows all bot commands dynamically, grouped by section
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all bot commands dynamically, grouped by section')
    .addStringOption(option =>
      option.setName('command')
        .setDescription('Get help for a specific command')
        .setRequired(false)
        .setAutocomplete(true)),
  execute: withSafeReply(async (interaction, client) => {
    const commandName = interaction.options.getString('command');
    
    if (commandName) {
      return await showCommandHelp(interaction, commandName, client);
    } else {
      return await showInteractiveHelp(interaction);
    }
  }),
  autocomplete: async (interaction) => {
    const focusedValue = interaction.options.getFocused();
    const commands = interaction.client.commands;
    
    if (!commands) {
      await interaction.respond([]);
      return;
    }
    
    const choices = Array.from(commands.values())
      .map(cmd => ({ name: cmd.data.name, value: cmd.data.name }))
      .filter(choice => choice.name.toLowerCase().includes(focusedValue.toLowerCase()))
      .slice(0, 25);
    
    await interaction.respond(choices);
  }
};

async function showInteractiveHelp(interaction) {
  try {
    // Track quest progress
    await progressQuests(interaction.user.id, ['help_command'], interaction);
    // Use the interactive help UI
    await showHelpUI(interaction, interaction.user.id);
    return;
  } catch (error) {
    logger.error('Error showing interactive help:', error);
    return await reply(interaction, {
      content: '\u274c An error occurred while loading the help menu!',
      flags: 1 << 6
    });
  }
}

async function showCommandHelp(interaction, commandName, client) {
  const command = client.commands.get(commandName);
  
  if (!command) {
    return await reply(interaction, {
      content: `❌ Command \`${commandName}\` not found!`,
      flags: 1 << 6
    });
  }

  // Track quest progress
  await progressQuests(interaction.user.id, ['help_command'], interaction);

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle(`📖 Help: /${command.data.name}`)
    .setDescription(command.data.description || 'No description available')
    .setTimestamp();

  // Add options if they exist
  if (command.data.options && command.data.options.length > 0) {
    const optionsText = command.data.options.map(option => {
      const required = option.required ? ' (Required)' : ' (Optional)';
      return `• \`${option.name}\`${required}: ${option.description}`;
    }).join('\n');
    
    embed.addFields({
      name: '🔧 Options',
      value: optionsText,
      inline: false
    });
  }

  // Add subcommands if they exist
  if (command.data.options && command.data.options.some(opt => opt.type === 1)) {
    const subcommands = command.data.options.filter(opt => opt.type === 1);
    const subcommandText = subcommands.map(sub => {
      const required = sub.required ? ' (Required)' : ' (Optional)';
      return `• \`${sub.name}\`${required}: ${sub.description}`;
    }).join('\n');
    
    embed.addFields({
      name: '📋 Subcommands',
      value: subcommandText,
      inline: false
    });
  }

  return await reply(interaction, { embeds: [embed], flags: 1 << 6 });
}
