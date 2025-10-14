const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  reply,
  isUserBlacklisted
} = require('../../utils/utils');
const { withSafeReply } = require('../../utils/safeReply');
const { validators } = require('../../utils/validation');
const { checkRateLimit } = require('../../utils/rateLimiting');
const logger = require('../../logger');

const rateLimiter = (userId) => checkRateLimit(userId, 'mystery', 10, 5000);

// Real Mystery Box rewards from use.js
const mysteryBoxPool = [
  { name: 'Gift Coins', weight: 25, icon: '🎁', price: 1000 },
  { name: 'Gamble Token', weight: 20, icon: '🎰', price: 1500 },
  { name: 'XP Booster', weight: 15, icon: '⚡', price: 3000 },
  { name: 'Coin Booster', weight: 12, icon: '💰', price: 5000 },
  { name: 'Luck Booster', weight: 8, icon: '🍀', price: 4000 },
  { name: 'Speed Booster', weight: 5, icon: '🏃', price: 6000 },
  { name: 'Loot Crate', weight: 4, icon: '📦', price: 5000 },
  { name: 'Meme Pack', weight: 3, icon: '😂', price: 7500 },
  { name: 'Color Pack', weight: 3, icon: '🎨', price: 10000 },
  { name: 'Fishing Rod', weight: 2, icon: '🎣', price: 3500 },
  { name: 'Shovel', weight: 2, icon: '⛏️', price: 2500 },
  { name: 'University degree', weight: 0.5, icon: '🎓', price: 10000 },
  { name: 'Pet Bot', weight: 0.3, icon: '🤖', price: 25000 },
  { name: 'Event Pass', weight: 0.2, icon: '🎫', price: 20000 },
  { name: 'Double Drop Card', weight: 0.3, icon: '🎯', price: 50000 },
  { name: 'Auto Collector', weight: 0.2, icon: '🤖', price: 70000 }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mysteryrewards')
    .setDescription('Show what rewards the Mystery Box item can give'),
  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in mystery command: ${userId}`);
      return await reply(interaction, {
        content: '❌ Invalid user ID!',
        flags: 1 << 6
      });
    }
    
    try {
      const totalWeight = mysteryBoxPool.reduce((sum, item) => sum + item.weight, 0);
      
      const embed = new EmbedBuilder()
        .setColor('#8b5cf6')
        .setTitle('🔮 Mystery Box Rewards')
        .setDescription('Here are the possible rewards you can get from using a **Mystery Box** item:')
        .setTimestamp();

      // Group items by rarity based on weight
      const commonItems = mysteryBoxPool.filter(item => item.weight >= 10);
      const uncommonItems = mysteryBoxPool.filter(item => item.weight >= 3 && item.weight < 10);
      const rareItems = mysteryBoxPool.filter(item => item.weight >= 0.5 && item.weight < 3);
      const legendaryItems = mysteryBoxPool.filter(item => item.weight < 0.5);

      // Add common items
      if (commonItems.length > 0) {
        let commonValue = '';
        for (const item of commonItems) {
          const chancePercent = ((item.weight / totalWeight) * 100).toFixed(1);
          commonValue += `${item.icon} **${item.name}** - ${item.price.toLocaleString()} coins (${chancePercent}%)\n`;
        }
        embed.addFields({
          name: '🟢 Common Items',
          value: commonValue,
          inline: false
        });
      }

      // Add uncommon items
      if (uncommonItems.length > 0) {
        let uncommonValue = '';
        for (const item of uncommonItems) {
          const chancePercent = ((item.weight / totalWeight) * 100).toFixed(1);
          uncommonValue += `${item.icon} **${item.name}** - ${item.price.toLocaleString()} coins (${chancePercent}%)\n`;
        }
        embed.addFields({
          name: '🔵 Uncommon Items',
          value: uncommonValue,
          inline: false
        });
      }

      // Add rare items
      if (rareItems.length > 0) {
        let rareValue = '';
        for (const item of rareItems) {
          const chancePercent = ((item.weight / totalWeight) * 100).toFixed(2);
          rareValue += `${item.icon} **${item.name}** - ${item.price.toLocaleString()} coins (${chancePercent}%)\n`;
        }
        embed.addFields({
          name: '🟣 Rare Items',
          value: rareValue,
          inline: false
        });
      }

      // Add legendary items
      if (legendaryItems.length > 0) {
        let legendaryValue = '';
        for (const item of legendaryItems) {
          const chancePercent = ((item.weight / totalWeight) * 100).toFixed(3);
          legendaryValue += `${item.icon} **${item.name}** - ${item.price.toLocaleString()} coins (${chancePercent}%)\n`;
        }
        embed.addFields({
          name: '🟡 Legendary Items',
          value: legendaryValue,
          inline: false
        });
      }

      embed.addFields({
        name: '📦 How to Use',
        value: 'Use `/use Mystery Box` to open a Mystery Box and get a random reward!',
        inline: false
      });

      embed.setFooter({ text: 'Mystery Boxes can be purchased from the shop or obtained as rewards' });

      return reply(interaction, '', { embeds: [embed] });
    } catch (error) {
      logger.error('Mysteryrewards command error:', error);
      return reply(interaction, '❌ An error occurred while showing mystery rewards!');
    }
  }, { deferReply: true, isUserBlacklisted, rateLimiter })
};
