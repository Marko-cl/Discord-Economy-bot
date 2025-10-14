const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  safeGetBoolean,
  progressQuests,
  reply,
  isUserBlacklisted
} = require('../../utils/utils');
const { withSafeReply } = require('../../utils/safeReply');
const { validators } = require('../../utils/validation');
const { getAllItems } = require('../../utils/inventory');
const logger = require('../../logger');
const { secureRandomChoice } = require('../../utils/secureRandom');
const { checkRateLimit } = require('../../utils/rateLimiting');

const rateLimiter = (userId) => checkRateLimit(userId, 'inventory', 10, 5000);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your inventory'),
  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in inventory command: ${userId}`);
      return await reply(interaction, {
        content: '❌ Invalid user ID!',
        flags: 1 << 6
      });
    }

    try {
      // Force fresh database read to bypass cache
      const { User } = require('../../database/db');
      const user = await User.findById(userId, { 
        inventory: 1, 
        farmInventory: 1, 
        hasDiamondShovel: 1, 
        hasGoldenPetBot: 1, 
        colorPack: 1, 
        embedColor: 1, 
        coins: 1, 
        level: 1, 
        xp: 1, 
        prestigeLevel: 1, 
        mining: 1, 
        petBot: 1 
      });
      
      if (!user) {
        logger.error(`[INVENTORY] User not found in DB | userId: ${userId}`);
        return reply(interaction, 'Error: Could not load user data. Please try again.');
      }

      // Update quest progress
      progressQuests(userId, ['inventory_check'], interaction).catch(e => logger.error(`[INVENTORY] progressQuests error for userId: ${userId}`, e));
      
      // Get boolean flags
      const hasDiamondShovel = safeGetBoolean(user, 'hasDiamondShovel');
      const hasGoldenPetBot = safeGetBoolean(user, 'hasGoldenPetBot');
      
      // Item icons mapping
      const itemIcons = {
        'Fishing Rod': '🎣',
        'University degree': '🎓',
        'Shovel': hasDiamondShovel ? '💎⛏️' : '⛏️',
        'Pickaxe': '⛏️',
        'XP Booster': '⚡',
        'Loot Crate': '📦',
        'Meme Pack': '😂',
        'Pet Bot': hasGoldenPetBot ? '🌟🤖' : '🤖',
        'Color Pack': '🎨',
        'Gift Coins': '🎁',
        'Gamble Token': '🎰',
        'Auto Collector': '🤖',
        'AFK Shield': '🛡️',
        'Double Drop Card': '🎯',
        'Event Pass': '🎫',
        'Mystery Box': '📦',
        'Box of Seeds': '🌱',
        '👨‍🌾 Worker': '👨‍🌾',
        'Fertilizer': '🌿'
      };
      
      // Load seed types
      let seedEmojiMap = {};
      try {
        const SEED_TYPES = require('../farm/constants').SEED_TYPES;
        seedEmojiMap = Object.fromEntries(SEED_TYPES.map(s => [s.name, s.emoji]));
      } catch (err) {
        logger.error(`[INVENTORY] Error loading SEED_TYPES for userId: ${userId}`, err);
      }
      
      // Get all items
      const allItemsRaw = getAllItems(user);
      const allItems = {};
      for (const [itemName, itemData] of Object.entries(allItemsRaw)) {
        if (itemData.type === 'regular') {
          allItems[itemName] = itemData;
        }
      }
      
      // Build inventory text
      let invText = '';
      let totalItems = 0;
      let uniqueItems = 0;
      
      if (Object.keys(allItems).length === 0) {
        invText = 'Your inventory is empty.';
      } else {
        const itemEntries = Object.entries(allItems).map(([itemName, itemData]) => {
          totalItems += itemData.count;
          uniqueItems++;
          
          let displayName = itemName;
          let icon = itemIcons[itemName] || '📦';
          
          // Handle special cases
          if (itemName === 'Shovel' && hasDiamondShovel) {
            displayName = 'Diamond Shovel';
            icon = '💎⛏️';
          } else if (itemName === 'Pet Bot' && hasGoldenPetBot) {
            displayName = 'Golden Pet Bot';
            icon = '🌟🤖';
          } else if (seedEmojiMap[itemName]) {
            icon = seedEmojiMap[itemName];
          }
          
          // Show count if more than 1
          const countText = itemData.count > 1 ? ` x${itemData.count}` : '';
          return `${icon} ${displayName}${countText}`;
        });
        
        invText = itemEntries.join('\n');
      }
      
      // Build collection message
      const collectionMsg = uniqueItems > 0 ? `🎒 Collection Score: **${uniqueItems} unique items** (${totalItems} total items)!` : '';
      
      // Build summary
      let summary = '';
      if (Object.keys(allItems).length === 0) {
        summary = '👜 Your inventory is empty! Go shopping!';
      } else if (uniqueItems > 10) {
        summary = '🏆 Collector Supreme!';
      } else if (uniqueItems > 5) {
        summary = '🎒 Growing Collection!';
      } else {
        summary = '🛍️ Starter Pack!';
      }
      
      // Get random tip
      const tips = [
        '💡 Tip: Some items unlock special features!',
        '💡 Tip: Boosters can be used from your inventory!',
        '💡 Tip: Try trading items with friends!',
        '💡 Tip: Rare items are worth showing off!',
        '💡 Tip: Use /shop to buy more items!',
        '💡 Tip: Prestige to unlock new rewards!',
        '💡 Tip: Items now stack automatically!',
        '💡 Tip: Farm items are stored separately!'
      ];
      
      const funFact = secureRandomChoice(tips) || 'No fun fact available.';
      
      // Get embed color
      const { getUserEmbedColor } = require('../../utils/utils');
      const embedColor = getUserEmbedColor(user) || 0x00bfff;
      
      // Build embed
      const embed = new EmbedBuilder()
        .setTitle(`${interaction.user.username}'s Inventory`)
        .setDescription(`${summary}\n${collectionMsg}`)
        .setColor(embedColor)
        .setFooter({ text: 'Kelonomy Inventory' })
        .setTimestamp()
        .addFields({ name: '🎁 Items', value: invText, inline: false });

      // Add bonus fields if applicable
      const { hasItem } = require('../../utils/utils');
      if (hasDiamondShovel && hasItem && hasItem(user, 'Shovel')) {
        embed.addFields({
          name: '\u200B',
          value: '_You must have **Shovel** in your inventory for the Diamond Shovel bonus to work in commands._',
          inline: false
        });
      }
      if (hasGoldenPetBot && hasItem && hasItem(user, 'Pet Bot')) {
        embed.addFields({
          name: '\u200B',
          value: '_You must have **Pet Bot** in your inventory for the Golden Pet Bot bonus to work in commands._',
          inline: false
        });
      }
      
      embed.addFields({
        name: 'Inventory Fun Fact',
        value: funFact,
        inline: false
      });
      
      await reply(interaction, '', { embeds: [embed], isUserBlacklisted, rateLimiter: rateLimiter(userId) });
    } catch (err) {
      logger.error(`[INVENTORY] Error for userId: ${userId}`, err);
      return reply(interaction, 'Error displaying your inventory. Please try again later.');
    }
  })
};
