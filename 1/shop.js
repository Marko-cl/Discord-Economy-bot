const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, formatKelocoins, hasItem, progressQuests, clearUserCache, addItemToInventory, removeItemFromInventory, countItem } = require('../utils/utils');
const { safeReply } = require('../utils/safeReply');
const { checkRateLimit } = require('../utils/rateLimiting');
const { withSafeReply } = require('../utils/safeReply');

const { User, ShopItem } = require('../database/db');
const { SHOP_REMOVED_ITEMS } = require('../config/constants');
const logger = require('../logger');
const { showShopUI } = require('./shopUI');

const rateLimiter = (userId) => checkRateLimit(userId, 'shop', 5, 10000);

// Sell prices for items (from the existing sell command)
const itemPrices = {
  'Common Fish': 10,
  'Uncommon Fish': 25,
  'Rare Fish': 50,
  'Epic Fish': 100,
  'Legendary Fish': 250,
  'Mythic Fish': 500,
  'MOBY-DICK': 1000,
  'Wheat': 5,
  'Corn': 8,
  'Tomato': 12,
  'Carrot': 6,
  'Potato': 7,
  'Iron Ore': 15,
  'Gold Ore': 30,
  'Diamond': 100,
  'Emerald': 75,
  'Ruby': 80
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Shop system - list items, buy, or sell')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all available shop items'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('buy')
        .setDescription('Buy an item from the shop')
        .addStringOption(option =>
          option.setName('item')
            .setDescription('Item to buy')
            .setRequired(true)
            .setAutocomplete(true))
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('Amount to buy (default: 1)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('test')
        .setDescription('Test shop UI without wrapper (debug only)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('sell')
        .setDescription('Sell an item from your inventory')
        .addStringOption(option =>
          option.setName('item')
            .setDescription('Item to sell')
            .setRequired(true)
            .setAutocomplete(true))
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('Amount to sell (default: 1)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100))),

  execute: withSafeReply(async (interaction) => {
    // Apply rate limiting at the start of the command
    const userId = interaction.user.id;
    const rateLimitResult = rateLimiter(userId);
    if (!rateLimitResult.allowed) {
      await safeReply(interaction, { content: rateLimitResult.reason || 'Rate limit exceeded.', ephemeral: true });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'list') {
        logger.info('[shop.js] Calling showShopUI for user:', interaction.user.id);
        
        // Test direct call without wrapper
        try {
          await showShopUI(interaction, interaction.user.id);
          return;
        } catch (directError) {
          logger.error('Direct showShopUI call failed:', directError);
          
          // Fallback to wrapped call
          await showShopList(interaction);
          return;
        }
      } else if (subcommand === 'buy') {
        const itemName = interaction.options.getString('item');
        const amount = interaction.options.getInteger('amount') || 1;
        await buyItem(interaction, itemName, amount);
        return;
      } else if (subcommand === 'test') {
        // Test shop UI without wrapper
        await showShopUI(interaction, interaction.user.id);
        return;
      } else if (subcommand === 'sell') {
        const itemName = interaction.options.getString('item');
        const amount = interaction.options.getInteger('amount') || 1;
        await sellItem(interaction, itemName, amount);
        return;
      }
    } catch (error) {
      logger.error('Shop command error:', error);
      await safeReply(interaction, {
        content: '❌ An error occurred while processing shop command!',
        flags: 1 << 6
      });
      return;
    }
  }),

  autocomplete: async (interaction) => {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    
    try {
      if (subcommand === 'buy') {
        // Autocomplete for buying - show shop items
        const items = await ShopItem.find().sort({ price: 1 });
        const filteredItems = items.filter(item => 
          (item.name === 'Box of Seeds' || !/weed|seeds?/i.test(item.name)) && 
          !SHOP_REMOVED_ITEMS.includes(item.name) &&
          item.name.toLowerCase().includes(focusedValue.toLowerCase())
        );
        
        const choices = filteredItems
          .map(item => ({
            name: `${item.icon || '📦'} ${item.name} - ${formatKelocoins(item.price)}`,
            value: item.name
          }))
          .slice(0, 25);
        
        await interaction.respond(choices);
      } else if (subcommand === 'sell') {
        // Autocomplete for selling - show user's inventory items that can be sold
        const user = await getUser(userId);
        const inventory = user?.inventory || {};
        
        const choices = Object.entries(inventory)
          .filter(([itemName, itemData]) => {
            const count = typeof itemData === 'object' ? itemData.count : itemData;
            return count > 0 && 
                   itemName.toLowerCase().includes(focusedValue.toLowerCase()) &&
                   itemPrices[itemName];
          })
          .map(([itemName, itemData]) => {
            const count = typeof itemData === 'object' ? itemData.count : itemData;
            return {
              name: `${itemName} (${count} available) - ${itemPrices[itemName]} coins each`,
              value: itemName
            };
          })
          .slice(0, 25);
        
        await interaction.respond(choices);
      } else {
        await interaction.respond([]);
      }
    } catch (error) {
      logger.error('Shop autocomplete error:', error);
      await interaction.respond([]);
    }
  }
};

async function showShopList(interaction) {
  try {
    // Use the interactive shop UI instead of static embed
    await showShopUI(interaction, interaction.user.id);
    return;
  } catch (error) {
    logger.error('Error showing shop list:', error);
    return await safeReply(interaction, {
      content: '\u274c An error occurred while loading the shop!',
      flags: 1 << 6
    });
  }
}

async function buyItem(interaction, itemName, amount) {
  if (!itemName) {
    return await safeReply(interaction, {
      content: '❌ Please specify an item to buy!',
      flags: 1 << 6
    });
  }

  try {
    // Find item in database
    const item = await ShopItem.findOne({ name: itemName });
    if (!item) {
      return await safeReply(interaction, {
        content: '❌ Item not found in shop!',
        flags: 1 << 6
      });
    }

    const userId = interaction.user.id;
    let user = await getUser(userId);
    
    if (!user) {
      return await safeReply(interaction, {
        content: '❌ User not found in database!',
        flags: 1 << 6
      });
    }

    const totalCost = item.price * amount;
    const userCoins = user.coins || 0;

    if (userCoins < totalCost) {
      return await safeReply(interaction, {
        content: `❌ You don't have enough coins! You need ${formatKelocoins(totalCost)} but have ${formatKelocoins(userCoins)}.`,
        flags: 1 << 6
      });
    }

    // Check if user already owns a one-time item
    if (item.oneTime && hasItem(user, item.name)) {
      return await safeReply(interaction, {
        content: `❌ You already own a ${item.name}! You can't buy more than one.`,
        flags: 1 << 6
      });
    }

    // Add item to inventory
    const itemAdded = await addItemToInventory(userId, item.name, amount);
    if (!itemAdded) {
      return await safeReply(interaction, {
        content: '❌ Failed to add item to inventory. Please try again.',
        flags: 1 << 6
      });
    }

    // Deduct coins
    await User.findByIdAndUpdate(userId, { $inc: { coins: -totalCost } }, { upsert: true });

    // Handle special cases
    if (itemName === 'Pet Bot') {
      if (user.hasPetBot) {
        return await safeReply(interaction, {
          content: '❌ You already own a Pet Bot!',
          flags: 1 << 6
        });
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

    // Update quest progress
    await progressQuests(userId, ['shop', 'shop_spender', 'shop_legend'], interaction);

    // Clear cache
    await clearUserCache(userId);

    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('🛒 Purchase Successful!')
      .setDescription(`You bought **${amount}x ${item.icon || '📦'} ${item.name}** for ${formatKelocoins(totalCost)}!`)
      .addFields(
        { name: '💰 Spent', value: formatKelocoins(totalCost), inline: true },
        { name: '💎 Remaining', value: formatKelocoins(userCoins - totalCost), inline: true },
        { name: '📦 Item', value: item.name, inline: true }
      )
      .setTimestamp();

    await safeReply(interaction, { embeds: [embed] });
  } catch (error) {
    logger.error('Error buying item:', error);
    await safeReply(interaction, {
      content: '❌ An error occurred while buying the item!',
      flags: 1 << 6
    });
  }
}

async function sellItem(interaction, itemName, amount) {
  if (!itemName) {
    return await safeReply(interaction, {
      content: '❌ Please specify an item to sell!',
      flags: 1 << 6
    });
  }

  try {
    const userId = interaction.user.id;
    let user = await getUser(userId);
    
    if (!user) {
      return await safeReply(interaction, {
        content: '❌ User not found in database!',
        flags: 1 << 6
      });
    }

    // Check if item can be sold
    const price = itemPrices[itemName];
    if (!price) {
      return await safeReply(interaction, {
        content: `❌ ${itemName} cannot be sold!`,
        flags: 1 << 6
      });
    }

    // Check if user has the item
    const itemCount = countItem(user, itemName);
    if (itemCount < amount) {
      return await safeReply(interaction, {
        content: `❌ You don't have enough ${itemName}! You have ${itemCount} but want to sell ${amount}.`,
        flags: 1 << 6
      });
    }

    const totalValue = price * amount;

    // Remove item from inventory
    const removed = await removeItemFromInventory(userId, itemName, amount);
    if (!removed) {
      return await safeReply(interaction, {
        content: '❌ Failed to remove item from inventory. Please try again.',
        flags: 1 << 6
      });
    }

    // Add coins
    await User.findByIdAndUpdate(userId, { $inc: { coins: totalValue } }, { upsert: true });

    // Update quest progress
    await progressQuests(userId, ['sell', 'sell_master'], interaction);

    // Clear cache
    await clearUserCache(userId);

    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('💰 Sale Complete!')
      .setDescription(`You sold **${amount}x ${itemName}** for ${formatKelocoins(totalValue)}!`)
      .addFields(
        { name: '💰 Price per Item', value: formatKelocoins(price), inline: true },
        { name: '💎 Total Value', value: formatKelocoins(totalValue), inline: true },
        { name: '📦 Remaining', value: `${itemCount - amount} ${itemName}`, inline: true }
      )
      .setTimestamp();

    await safeReply(interaction, { embeds: [embed] });
  } catch (error) {
    logger.error('Error selling item:', error);
    await safeReply(interaction, {
      content: '❌ An error occurred while selling the item!',
      flags: 1 << 6
    });
  }
}