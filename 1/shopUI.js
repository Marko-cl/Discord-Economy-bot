const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUser, formatKelocoins, hasItem, progressQuests, validateString, clearUserCache, isUserBlacklisted, isSafeDiscordId } = require('../utils/utils');
const { checkRateLimit } = require('../utils/rateLimiting');
const { ensureValidPayload, safeReply } = require('../utils/safeReply');
const { atomicShopPurchase } = require('../utils/atomicOperations');
const { reply } = require('../utils/formatting');

const { ShopItem, User } = require('../database/db');
const { SHOP_REMOVED_ITEMS } = require('../config/constants');
const logger = require('../logger');

const CATEGORY_EMOJIS = {
  Farming: '🌾',
  Requirement: '📋',
  Booster: '⚡',
  Special: '🎁',
  Protection: '🛡️',
  Fun: '😂',
  Premium: '💎',
  Mining: '⛏️',
  Guild: '🏰',
  Companion: '🤖',
  Cosmetic: '🎨',
  Seasonal: '🎉',
  Fishing: '🎣',
  Social: '💬',
  Gambling: '🎰',
  Other: '✨'
};

const rateLimiter = (userId) => checkRateLimit(userId, 'shopUI', 10, 3000); // 10 uses per 3 seconds for shop UI

// Helper functions for UI components
function getCategorySelectRow() {
  const categories = Object.keys(CATEGORY_EMOJIS);
  const select = new StringSelectMenuBuilder()
    .setCustomId('shop_cat_select')
    .setPlaceholder('Select a category...')
    .addOptions(
      categories.map(cat => ({
        label: cat,
        value: cat,
        emoji: CATEGORY_EMOJIS[cat] || '✨'
      }))
    );
  
  return new ActionRowBuilder().addComponents(select);
}

function getCloseRow() {
  const closeButton = new ButtonBuilder()
    .setCustomId('shop_close')
    .setLabel('Close Shop')
    .setStyle(ButtonStyle.Danger);
  
  return new ActionRowBuilder().addComponents(closeButton);
}

function getBackRow() {
  const backButton = new ButtonBuilder()
    .setCustomId('shop_back')
    .setLabel('Back to Categories')
    .setStyle(ButtonStyle.Secondary);
  
  return new ActionRowBuilder().addComponents(backButton);
}

// Helper to capitalize the first letter
function capitalizeCategory(cat) {
  if (!cat) return 'Other';
  return cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
}

// Group items by category (normalized)
function groupItemsByCategory(items) {
  const categories = {};
  items.forEach(item => {
    const category = capitalizeCategory(item.category || 'Other');
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(item);
  });
  return categories;
}

async function showShopUI(interaction, userId) {
  // Declare allItems and categories at the top so they are accessible in the collector
  let allItems = [];
  let categories = {};
  
  // Wrap the entire function in a try/catch to catch any unhandled errors
  try {
    if (!isSafeDiscordId(userId)) {
      return reply(interaction, 'Invalid user ID.', { flags: 1 << 6 });
    }
    if (isUserBlacklisted(userId)) {
      if (!(interaction.replied || interaction.deferred)) return reply(interaction, '❌ You are blacklisted from using bot commands.');
      return;
    }
    const rateLimitResult = rateLimiter(userId);
    if (!rateLimitResult.allowed) {
      if (!(interaction.replied || interaction.deferred)) return reply(interaction, rateLimitResult.reason ? rateLimitResult.reason.toString() : 'Rate limit exceeded.');
      else return reply(interaction, { content: rateLimitResult.reason ? rateLimitResult.reason.toString() : 'Rate limit exceeded.' });
    }
    let items;
    try {
      items = await ShopItem.find().sort({ price: 1 });
    } catch (err) {
      logger.error('DB error in ShopItem.find:', err);
      if (!(interaction.replied || interaction.deferred)) return reply(interaction, 'Database error. Please try again later.');
      else return reply(interaction, { content: 'Database error. Please try again later.' });
    }
    if (!items.length) {
      if (!(interaction.replied || interaction.deferred)) return reply(interaction, 'The shop is empty!');
      else return reply(interaction, { content: 'The shop is empty!' });
    }
    // Filter out removed/hidden items
    const filteredItems = items.filter(item =>
      (item.name === 'Box of Seeds' || !/weed|seeds?/i.test(item.name)) &&
      !SHOP_REMOVED_ITEMS.includes(item.name)
    );
    if (!filteredItems.length) {
      if (!(interaction.replied || interaction.deferred)) return reply(interaction, 'The shop is empty!');
      else return reply(interaction, { content: 'The shop is empty!' });
    }
    let seasonalItems = [];
    try {
      const { getSeasonalSpecialItems } = require('../utils/utils');
      seasonalItems = getSeasonalSpecialItems();
    } catch (err) {
      logger.error('Error getting seasonal items:', err);
    }
    const seasonalItemObjects = seasonalItems.map(itemName => ({
      name: itemName,
      price: 1000,
      category: 'Seasonal',
      icon: '\ud83c\udf81',
      description: `Limited time seasonal item!`,
      oneTime: false,
      consumable: false
    }));
    allItems = [...filteredItems, ...seasonalItemObjects];
    if (!allItems.length) {
      await safeReply(interaction, { content: "No items in the shop right now.", ephemeral: false });
      return;
    }
    // Group items by category and assign to the higher-scope variable
    categories = groupItemsByCategory(allItems);
    
    let user;
    try {
      user = await getUser(userId, { coins: 1, inventory: 1, farmInventory: 1, petBot: 1, hasPetBot: 1 });
    } catch (err) {
      logger.error('DB error in getUser:', err);
      try {
        await reply(interaction, 'Database error. Please try again later.');
      } catch (apiErr) {
        logger.error('Discord API error in getUser:', apiErr);
      }
      return;
    }
    if (typeof user !== 'object' || user === null) {
      logger.error('User data is corrupted:', userId);
      try {
        await reply(interaction, 'User data is corrupted.');
      } catch (err) {
        logger.error('Discord API error user data corrupted:', err);
      }
      return;
    }
    let embedColor;
    try {
      embedColor = require('../utils/utils').getUserEmbedColor(user);
    } catch (err) {
      logger.error('Error getting user embed color:', err);
      embedColor = 0x0099ff;
    }
    const getIntroEmbed = () => {
      const embed = new EmbedBuilder()
        .setTitle('🛒 Kelonomy Shop')
        .setDescription('Pick a category below to see items you can buy!\n\n💡 **Tip:** When buying items, you can type the name without emojis or with different casing. The shop will find the closest match!')
        .setColor(embedColor)
        .setFooter({ text: 'Kelonomy Shop - Use /shop buy <item> to purchase • /use <item> for consumables' })
        .setTimestamp();
      return embed;
    };
    try {
      if (!(interaction.replied || interaction.deferred)) {
        await safeReply(interaction, { content: "", embeds: [getIntroEmbed()], components: [getCategorySelectRow(), getCloseRow()], ephemeral: false });
      } else {
        const introEmbed = getIntroEmbed();
        if (!introEmbed) {
          await interaction.editReply(ensureValidPayload({ content: "An error occurred loading the shop.", components: [], ephemeral: false }, 'editReply'));
        } else {
          await interaction.editReply(ensureValidPayload({ content: "", embeds: [introEmbed], components: [getCategorySelectRow(), getCloseRow()], ephemeral: false }, 'editReply'));
        }
      }
    } catch (err) {
      logger.error('Error sending shop intro embed:', err);
      return;
    }
    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && (['shop_cat_select', 'shop_back', 'shop_close'].includes(i.customId) || i.customId.startsWith('buy_shop_')),
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
    collector.on('collect', async i => {
      try {
        // Check if interaction is still valid
        if (!i || i.ended) {
          return;
        }
        
        if (i.customId === 'shop_close') {
          active = false;
          cleanup();
          try {
            await i.update(ensureValidPayload({ content: 'Shop closed. Type /shop to open again.', components: [] }, 'update'));
          } catch (updateErr) {
            logger.error('Error updating shop close:', updateErr);
          }
          return;
        }
        if (i.customId === 'shop_cat_select') {
          const cat = capitalizeCategory(i.values[0]);
          const catItems = categories[cat] || [];
          let embedColorCat;
          try {
            embedColorCat = require('../utils/utils').getUserEmbedColor(user);
          } catch (err) {
            logger.warn('Error getting user embed color in shop_cat_select:', err);
            embedColorCat = 0x0099ff; // Default blue color
          }
          const catEmbed = new EmbedBuilder()
            .setTitle(`${CATEGORY_EMOJIS[cat] || ''} ${cat} Shop Items`)
            .setDescription(catItems.length > 0 ? catItems.map(item => `${item.icon || '\ud83d\udce6'} **${item.name}**${item.oneTime ? ' *(one-time)*' : ''}${item.consumable ? ' *(consumable)*' : ''}\n${item.description ? item.description + '\n' : ''}**Price:** ${formatKelocoins(item.price)}`).join('\n\n') : 'No items in this category.')
            .setColor(embedColorCat)
            .setFooter({ text: 'Kelonomy Shop - Use /shop buy <item> to purchase \u2022 /use <item> for consumables' })
            .setTimestamp();
          // Create multiple rows for buy buttons (max 5 buttons per row)
          const buyRows = [];
          for (let i = 0; i < catItems.length; i += 5) {
            const rowItems = catItems.slice(i, i + 5);
            const buyRow = new ActionRowBuilder().addComponents(
              ...rowItems.map(item => {
                // Create a safe custom ID by removing special characters and spaces
                const safeItemName = item.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                return new ButtonBuilder()
                  .setCustomId(`buy_shop_${safeItemName}`)
                  .setLabel(`Buy ${item.name}`)
                  .setStyle(ButtonStyle.Success);
              })
            );
            buyRows.push(buyRow);
          }
          const rows = [getBackRow(), ...buyRows];
          if (!catItems || catItems.length === 0) {
            await i.update(ensureValidPayload({ content: "No items in this category.", components: [] }, 'update'));
          } else {
            await i.update(ensureValidPayload({ content: "", embeds: [catEmbed], components: rows, ephemeral: false }, 'update'));
          }
          return;
        }
        if (i.customId === 'shop_back') {
          try {
            await i.update(ensureValidPayload({ content: "", embeds: [getIntroEmbed()], components: [getCategorySelectRow(), getCloseRow()], ephemeral: false }, 'update'));
          } catch (updateErr) {
            logger.error('Error updating shop back button:', updateErr);
          }
          return;
        }
        if (i.customId.startsWith('buy_shop_')) {
          const safeItemName = i.customId.replace('buy_shop_', '');
          if (!validateString(safeItemName, { min: 1, max: 50 })) {
            try {
              await i.update(ensureValidPayload({ content: 'Invalid item name.', components: [] }, 'update'));
            } catch (replyErr) {
              logger.error('Error updating invalid item name:', replyErr);
            }
            return;
          }
          
          // Try to find the item with improved normalization matching
          let item;
          try {
            // Get all shop items for better matching
            const allShopItems = await ShopItem.find({});
            if (!allShopItems || allShopItems.length === 0) {
              await i.update(ensureValidPayload({ content: 'No items available in the shop.', components: [] }, 'update'));
              return;
            }
            
            // Find the item by matching the safe custom ID with the item name
            item = allShopItems.find(shopItem => {
              const itemSafeName = shopItem.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
              return itemSafeName === safeItemName;
            });
            
            if (!item) {
              // Show some suggestions based on what the user typed
              const suggestions = allShopItems
                .filter(shopItem => {
                  const itemSafeName = shopItem.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                  return itemSafeName.includes(safeItemName) || 
                         safeItemName.includes(itemSafeName) ||
                         shopItem.name.toLowerCase().includes(safeItemName);
                })
                .slice(0, 3)
                .map(shopItem => shopItem.name);
              
              let errorMessage = `Item not found.`;
              if (suggestions.length > 0) {
                errorMessage += `\n\nDid you mean: ${suggestions.join(', ')}?`;
              }
              
              try {
                await i.update(ensureValidPayload({ content: errorMessage, components: [] }, 'update'));
              } catch (replyErr) {
                logger.error('Error updating item not found:', replyErr);
              }
              return;
            }
          } catch (err) {
            logger.error('DB error in shopUI buy_shop_ ShopItem.find:', err);
            await i.update(ensureValidPayload({ content: 'Database error. Please try again later.', components: [] }, 'update'));
            return;
          }
          
          const balance = user ? (user.coins || 0) : 0;
          if (item.oneTime && hasItem(user, item.name)) {
            try {
              await i.update(ensureValidPayload({ content: `You already own a ${item.name}! You can't buy more than one.`, components: [] }, 'update'));
            } catch (replyErr) {
              logger.error('Error updating already owned item:', replyErr);
            }
            return;
          }
          if (balance < item.price) {
            try {
              await i.update(ensureValidPayload({ content: `You don't have enough Kelocoins. You have ${formatKelocoins(balance)} but need ${formatKelocoins(item.price)}.`, components: [] }, 'update'));
            } catch (replyErr) {
              logger.error('Error updating insufficient funds:', replyErr);
            }
            return;
          }
          try {
            // Use atomicShopPurchase for atomicity
            const purchaseResult = await atomicShopPurchase(userId, item.name, item.price);
            if (!purchaseResult.success) {
              await i.update(ensureValidPayload({ content: purchaseResult.message ? purchaseResult.message.toString() : 'Failed to purchase item. Please try again.', components: [] }, 'update'));
              return;
            }
            // Handle special cases (e.g., Pet Bot)
            if (item.name === 'Pet Bot') {
              if (user.hasPetBot) {
                await i.update(ensureValidPayload({ content: 'You already own a Pet Bot!', components: [] }, 'update'));
                return;
              }
              await User.findByIdAndUpdate(userId, {
                hasPetBot: true,
                petBot: {
                  name: 'Pet Bot',
                  color: '#00ff99',
                  personality: 'playful',
                  lastInteracted: null,
                  level: 1,
                  xp: 0,
                  totalCoinsCollected: 0,
                  lastCollection: null,
                  collectionStreak: 0
                }
              }, { upsert: true });
            }
          } catch (err) {
            logger.error('DB error in shopUI buy_shop_ atomicShopPurchase:', err);
            await i.update(ensureValidPayload({ content: 'Database error. Please try again later.', components: [] }, 'update'));
            return;
          }
          try {
            // Use atomic quest update if available
            await progressQuests(userId, ['shop', 'shop_spender', 'shop_legend'], interaction);
          } catch (err) {
            logger.error('progressQuests error in shopUI buy_shop_:', err);
          }
          logger.economy(userId, 'shop_buy', `Item: ${item.name}, Price: ${item.price}, Balance: ${balance - item.price}`);
          try {
            await i.update(ensureValidPayload({ content: `You bought ${item.icon || '\ud83d\udce6'} ${item.name} for ${formatKelocoins(item.price)}!`, components: [] }, 'update'));
          } catch (err) {
            logger.error('Error sending shopUI buy_shop_ update:', err);
          }
          try {
            await clearUserCache(userId);
          } catch (err) {
            logger.error('clearUserCache error in shopUI buy_shop_:', err);
          }
          return;
        }
      } catch (err) {
        logger.error('Error in shopUI collector collect handler:', err);
        try { await i.update(ensureValidPayload({ content: '❌ An error occurred in the shop menu.', components: [] }, 'update')); } catch { /* ESLint: intentionally empty catch block */ }
      }
    });
    
    collector.on('end', async (collected, reason) => {
      if (active && reason !== 'cleanup') {
        await reply(interaction, 'Shop menu expired. Type /shop to open again.', { embeds: [], components: [], flags: 1 << 6 });
      }
      active = false;
    });
    
    // Cleanup on process exit
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  } catch (error) {
    console.error('[DEBUG] Top-level error in showShopUI:', error);
    console.error('[DEBUG] Error stack:', error.stack);
    
    // Try to send an error message if possible
    try {
      if (!(interaction.replied || interaction.deferred)) {
        await safeReply(interaction, { 
          content: '❌ An error occurred while loading the shop. Please try again.',
          flags: 1 << 6 
        });
      } else {
        await interaction.editReply({ 
          content: '❌ An error occurred while loading the shop. Please try again.',
          flags: 1 << 6 
        });
      }
    } catch (replyError) {
      console.error('[DEBUG] Failed to send error message:', replyError);
    }
  }
}

// Export showShopUI as a plain async function (no withSafeReply)
module.exports = { showShopUI }; 