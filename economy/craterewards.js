const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  reply,
  isUserBlacklisted
} = require('../../utils/utils');
const { withSafeReply } = require('../../utils/safeReply');
const { validators } = require('../../utils/validation');
const { checkRateLimit } = require('../../utils/rateLimiting');
const logger = require('../../logger');

const rateLimiter = (userId) => checkRateLimit(userId, 'craterewards', 10, 5000);

// Real Loot Crate rewards from use.js
const lootCrateRewards = [
  {
    name: 'Ultra Rare Drop',
    chance: 0.01,
    description: '1% chance',
    rewards: [
      { type: 'coins', amount: 25000, chance: 0.5, description: '25,000 coins (50% chance)' },
      { type: 'item', items: ['Event Pass', 'Auto Collector', 'Double Drop Card', 'Pet Bot', 'Color Pack'], chance: 0.5, description: 'Rare item (50% chance)' }
    ],
    emoji: '💎'
  },
  {
    name: 'High Value',
    chance: 0.04,
    description: '4% chance',
    rewards: [
      { type: 'coins', min: 15000, max: 50000, description: '15,000 - 50,000 coins' }
    ],
    emoji: '💰'
  },
  {
    name: 'Medium Value',
    chance: 0.15,
    description: '15% chance',
    rewards: [
      { type: 'coins', min: 5000, max: 50000, description: '5,000 - 50,000 coins' }
    ],
    emoji: '🪙'
  },
  {
    name: 'Low Value',
    chance: 0.80,
    description: '80% chance',
    rewards: [
      { type: 'coins', amount: 1000, description: '1,000 coins' }
    ],
    emoji: '💸'
  }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('craterewards')
    .setDescription('Show what rewards the Loot Crate item can give'),
  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in craterewards command: ${userId}`);
      return await reply(interaction, {
        content: '❌ Invalid user ID!',
        flags: 1 << 6
      });
    }
    
    try {
      const embed = new EmbedBuilder()
        .setColor('#ff6b35')
        .setTitle('📦 Loot Crate Rewards')
        .setDescription('Here are the possible rewards you can get from using a **Loot Crate** item:')
        .setTimestamp();

      // Add fields for each reward tier
      for (const tier of lootCrateRewards) {
        let tierValue = '';
        
        for (const reward of tier.rewards) {
          if (reward.type === 'coins') {
            if (reward.amount) {
              tierValue += `• ${reward.amount.toLocaleString()} coins\n`;
            } else if (reward.min && reward.max) {
              tierValue += `• ${reward.min.toLocaleString()} - ${reward.max.toLocaleString()} coins\n`;
            }
          } else if (reward.type === 'item') {
            tierValue += `• **Rare Items:** ${reward.items.join(', ')}\n`;
          }
        }

        embed.addFields({
          name: `${tier.emoji} ${tier.name} (${tier.description})`,
          value: tierValue,
          inline: false
        });
      }

      embed.addFields({
        name: '📦 How to Use',
        value: 'Use `/use Loot Crate` to open a Loot Crate and get random coins or rare items!',
        inline: false
      });

      embed.addFields({
        name: '🎉 Special Features',
        value: '• All coin rewards are affected by your multipliers\n• Rare items are automatically added to your inventory\n• Triggers quest progress for loot opening',
        inline: false
      });

      embed.setFooter({ text: 'Loot Crates can be purchased from the shop or obtained as rewards' });

      return reply(interaction, '', { embeds: [embed] });
    } catch (error) {
      logger.error('Craterewards command error:', error);
      return reply(interaction, '❌ An error occurred while showing crate rewards!');
    }
  }, { deferReply: true, isUserBlacklisted, rateLimiter })
}; 