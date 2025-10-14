const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isUserBlacklisted } = require('../utils/utils');
const { checkRateLimit } = require('../utils/rateLimiting');
const logger = require('../logger');
const { reply } = require('../utils/formatting');
const { withSafeReply } = require('../utils/safeReply');

const rateLimiter = (userId) => checkRateLimit(userId, 'timer', 5, 5000);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timer')
    .setDescription('OWNER ONLY: Control cooldown immunity mode')
    .addStringOption(option =>
      option.setName('action')
        .setDescription('Start or stop cooldown immunity')
        .setRequired(true)
        .addChoices(
          { name: 'Start Immunity', value: 'start' },
          { name: 'Stop Immunity', value: 'stop' }
        )),

  execute: withSafeReply(async (interaction) => {
    // Apply rate limiting at the start of the command
    const userId = interaction.user.id;
    const rateLimitResult = rateLimiter(userId);
    if (!rateLimitResult.allowed) {
      return await reply(interaction, { content: rateLimitResult.message, ephemeral: true });
    }

    const ownerId = require('../utils/utils').constants.OWNER_ID;
    if (interaction.user.id !== ownerId) {
      return reply(interaction, { 
        content: '❌ Only the bot owner can use this command!', 
        flags: 1 << 6 
      });
    }

    const action = interaction.options.getString('action');
    
    if (action === 'start') {
      // Enable cooldown immunity
      global.ownerCooldownImmune = true;
      
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🛡️ Cooldown Immunity Enabled')
        .setDescription('You are now immune to all command cooldowns!')
        .addFields({
          name: '⚠️ Warning',
          value: 'This mode bypasses all cooldown restrictions. Use responsibly!',
          inline: false
        })
        .setTimestamp()
        .setFooter({ text: 'Owner Mode Active' });

      logger.info(`Owner ${interaction.user.id} enabled cooldown immunity`);
      await reply(interaction, '', { embeds: [embed] });
      
    } else if (action === 'stop') {
      // Disable cooldown immunity
      global.ownerCooldownImmune = false;
      
      const embed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('🛡️ Cooldown Immunity Disabled')
        .setDescription('You are no longer immune to command cooldowns.')
        .addFields({
          name: '📝 Note',
          value: 'All commands will now respect their normal cooldown timers.',
          inline: false
        })
        .setTimestamp()
        .setFooter({ text: 'Owner Mode Inactive' });

      logger.info(`Owner ${interaction.user.id} disabled cooldown immunity`);
      await reply(interaction, '', { embeds: [embed] });
    }
  }, { isUserBlacklisted, rateLimiter })
}; 