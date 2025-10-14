const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  reply,
  isUserBlacklisted
} = require('../utils/utils');
const { withSafeReply } = require('../utils/safeReply');
const { validators } = require('../utils/validation');
const { checkRateLimit } = require('../utils/rateLimiting');
const logger = require('../logger');

const rateLimiter = (userId) => checkRateLimit(userId, 'boxofseeds', 10, 5000);

// Seed types from farm constants
const { SEED_TYPES } = require('./farm/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('boxofseeds')
    .setDescription('Show what seeds the Box of Seeds item can give'),
  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in boxofseeds command: ${userId}`);
      return await reply(interaction, {
        content: '❌ Invalid user ID!',
        flags: 1 << 6
      });
    }
    
    try {
      const embed = new EmbedBuilder()
        .setColor('#90EE90')
        .setTitle('🌱 Box of Seeds Rewards')
        .setDescription('Here are the possible seeds you can get from using a **Box of Seeds** item:')
        .setTimestamp();

      // Group seeds by rarity
      const commonSeeds = SEED_TYPES.filter(seed => seed.rarity === 'Common');
      const uncommonSeeds = SEED_TYPES.filter(seed => seed.rarity === 'Uncommon');
      const rareSeeds = SEED_TYPES.filter(seed => seed.rarity === 'Rare');
      const epicSeeds = SEED_TYPES.filter(seed => seed.rarity === 'Epic');
      const legendarySeeds = SEED_TYPES.filter(seed => seed.rarity === 'Legendary');
      const mythicSeeds = SEED_TYPES.filter(seed => seed.rarity === 'Mythic');
      const divineSeeds = SEED_TYPES.filter(seed => seed.rarity === 'Divine');
      const ancientSeeds = SEED_TYPES.filter(seed => seed.rarity === 'Ancient');
      const cursedSeeds = SEED_TYPES.filter(seed => seed.rarity === 'Cursed');
      const galacticSeeds = SEED_TYPES.filter(seed => seed.rarity === 'Galactic');

      // Add common seeds
      if (commonSeeds.length > 0) {
        let commonValue = '';
        for (const seed of commonSeeds) {
          const chancePercent = (seed.drop * 100).toFixed(1);
          commonValue += `${seed.emoji} **${seed.name}** (${chancePercent}%)\n`;
        }
        embed.addFields({
          name: '🟢 Common Seeds',
          value: commonValue,
          inline: false
        });
      }

      // Add uncommon seeds
      if (uncommonSeeds.length > 0) {
        let uncommonValue = '';
        for (const seed of uncommonSeeds) {
          const chancePercent = (seed.drop * 100).toFixed(1);
          uncommonValue += `${seed.emoji} **${seed.name}** (${chancePercent}%)\n`;
        }
        embed.addFields({
          name: '🔵 Uncommon Seeds',
          value: uncommonValue,
          inline: false
        });
      }

      // Add rare seeds
      if (rareSeeds.length > 0) {
        let rareValue = '';
        for (const seed of rareSeeds) {
          const chancePercent = (seed.drop * 100).toFixed(2);
          rareValue += `${seed.emoji} **${seed.name}** (${chancePercent}%)\n`;
        }
        embed.addFields({
          name: '🟣 Rare Seeds',
          value: rareValue,
          inline: false
        });
      }

      // Add epic seeds
      if (epicSeeds.length > 0) {
        let epicValue = '';
        for (const seed of epicSeeds) {
          const chancePercent = (seed.drop * 100).toFixed(3);
          epicValue += `${seed.emoji} **${seed.name}** (${chancePercent}%)\n`;
        }
        embed.addFields({
          name: '🟡 Epic Seeds',
          value: epicValue,
          inline: false
        });
      }

      // Add legendary seeds
      if (legendarySeeds.length > 0) {
        let legendaryValue = '';
        for (const seed of legendarySeeds) {
          const chancePercent = (seed.drop * 100).toFixed(3);
          legendaryValue += `${seed.emoji} **${seed.name}** (${chancePercent}%)\n`;
        }
        embed.addFields({
          name: '🟠 Legendary Seeds',
          value: legendaryValue,
          inline: false
        });
      }

      // Add mythic seeds
      if (mythicSeeds.length > 0) {
        let mythicValue = '';
        for (const seed of mythicSeeds) {
          const chancePercent = (seed.drop * 100).toFixed(4);
          mythicValue += `${seed.emoji} **${seed.name}** (${chancePercent}%)\n`;
        }
        embed.addFields({
          name: '🔴 Mythic Seeds',
          value: mythicValue,
          inline: false
        });
      }

      // Add divine seeds
      if (divineSeeds.length > 0) {
        let divineValue = '';
        for (const seed of divineSeeds) {
          const chancePercent = (seed.drop * 100).toFixed(4);
          divineValue += `${seed.emoji} **${seed.name}** (${chancePercent}%)\n`;
        }
        embed.addFields({
          name: '⚪ Divine Seeds',
          value: divineValue,
          inline: false
        });
      }

      // Add ancient seeds
      if (ancientSeeds.length > 0) {
        let ancientValue = '';
        for (const seed of ancientSeeds) {
          const chancePercent = (seed.drop * 100).toFixed(4);
          ancientValue += `${seed.emoji} **${seed.name}** (${chancePercent}%)\n`;
        }
        embed.addFields({
          name: '🟤 Ancient Seeds',
          value: ancientValue,
          inline: false
        });
      }

      // Add cursed seeds
      if (cursedSeeds.length > 0) {
        let cursedValue = '';
        for (const seed of cursedSeeds) {
          const chancePercent = (seed.drop * 100).toFixed(4);
          cursedValue += `${seed.emoji} **${seed.name}** (${chancePercent}%)\n`;
        }
        embed.addFields({
          name: '⚫ Cursed Seeds',
          value: cursedValue,
          inline: false
        });
      }

      // Add galactic seeds
      if (galacticSeeds.length > 0) {
        let galacticValue = '';
        for (const seed of galacticSeeds) {
          const chancePercent = (seed.drop * 100).toFixed(4);
          galacticValue += `${seed.emoji} **${seed.name}** (${chancePercent}%)\n`;
        }
        embed.addFields({
          name: '🌌 Galactic Seeds',
          value: galacticValue,
          inline: false
        });
      }

      embed.addFields({
        name: '🌱 How to Use',
        value: 'Use `/use Box of Seeds` to open a Box of Seeds and get 1-5 random seeds!',
        inline: false
      });

      embed.addFields({
        name: '🎉 Special Features',
        value: '• Each box gives 1-5 random seeds\n• Seeds are automatically added to your farm inventory\n• Plant seeds with `/farm plant <seed>`\n• Triggers quest progress for seed collection',
        inline: false
      });

      embed.setFooter({ text: 'Box of Seeds can be purchased from the shop or obtained as rewards' });

      return reply(interaction, '', { embeds: [embed] });
    } catch (error) {
      logger.error('Boxofseeds command error:', error);
      return reply(interaction, '❌ An error occurred while showing box of seeds rewards!');
    }
  }, { deferReply: true, isUserBlacklisted, rateLimiter })
}; 