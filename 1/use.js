const { SlashCommandBuilder } = require('discord.js');
const { getUser, formatKelocoins, progressQuests, isUserBlacklisted, isSafeDiscordId, updateUserField } = require('../utils/utils');
const { reply } = require('../utils/formatting');
const { withSafeReply } = require('../utils/safeReply');
const { checkRateLimit } = require('../utils/rateLimiting');
const { clearUserCache } = require('../utils/cache');

const { ShopItem, User } = require('../database/db');
const { getTotalCoinMultiplier, getUserPartyMultiplierInfo } = require('../utils/utils');
const logger = require('../logger');
const { secureRandomInt, secureRandomFloat } = require('../utils/secureRandom');
const { isFarmItem, countItem, removeItemFromInventory, addItemToInventory } = require('../utils/inventory');

const rateLimiter = (userId) => checkRateLimit(userId, 'use', 5, 10000);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('use')
    .setDescription('Use an item from your inventory')
    .addStringOption(opt => 
      opt.setName('item')
        .setDescription('Name of the item to use')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(opt =>
      opt.setName('amount')
        .setDescription('How many to use (default 1)')
        .setMinValue(1)
        .setMaxValue(99)
        .setRequired(false)
    ),
  
  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const userId = interaction.user.id;
    if (!isSafeDiscordId(userId)) {
      await interaction.respond([]);
      return;
    }
    try {
      const user = await getUser(userId, { inventory: 1, farmInventory: 1, gambleTokens: 1, petBot: 1 });
      const consumableItems = [];
      
      // Use the new inventory system to get all items
      const { getAllItems } = require('../utils/inventory');
      const allItems = getAllItems(user);
      
      // Check regular inventory items
      for (const [itemName, itemData] of Object.entries(allItems)) {
        if (itemData.type === 'regular' && itemData.count > 0) {
          try {
            const item = await ShopItem.findOne({ name: itemName });
            if (item && item.consumable) {
              consumableItems.push(itemName);
            }
          } catch (err) {
            logger.error('Error finding ShopItem in autocomplete:', err);
          }
        }
      }
      
      // Check farmInventory items
      if (user && user.farmInventory) {
        for (const [itemName, itemData] of Object.entries(user.farmInventory)) {
          if (itemData.count > 0) {
            try {
              const item = await ShopItem.findOne({ name: itemName });
              if (item && item.consumable && !consumableItems.includes(itemName) && itemName !== 'Fertilizer') {
                consumableItems.push(itemName);
              }
            } catch (err) {
              logger.error('Error finding ShopItem in autocomplete (farmInventory):', err);
            }
          }
        }
      }
      
      if (user && user.gambleTokens && user.gambleTokens > 0) {
        consumableItems.push('Gamble Token');
      }
      
      const filtered = consumableItems
        .filter(item => item.toLowerCase().includes(focusedValue))
        .slice(0, 25);
      await interaction.respond(
        filtered.map(item => ({ name: item, value: item }))
      );
    } catch (error) {
      logger.error('Error in use autocomplete:', error);
      try { 
        await interaction.respond([]);
      } catch (e) { 
        logger.error('Error responding in autocomplete:', e);
      }
    }
  },

  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    if (!isSafeDiscordId(userId)) {
      await reply(interaction, 'Invalid user ID.', { flags: 1 << 6 });
      return;
    }
    if (isUserBlacklisted(userId)) {
      await reply(interaction, '❌ You are blacklisted from using bot commands.');
      return;
    }
    const rateLimitResult = rateLimiter(userId);
    if (!rateLimitResult.allowed) {
      await reply(interaction, rateLimitResult.message);
      return;
    }
    const itemName = interaction.options.getString('item');
    const amount = interaction.options.getInteger('amount') || 1;
    
    // Input validation
    if (!itemName || typeof itemName !== 'string' || itemName.trim().length === 0) {
      await reply(interaction, 'Please provide a valid item name.');
      return;
    }
    
    if (!amount || amount < 1 || amount > 99) {
      await reply(interaction, 'Amount must be between 1 and 99.');
      return;
    }
    
    logger.info(`/use command started for user ${userId} with item: ${itemName}, amount: ${amount}`);
    
    let user;
    try {
      logger.info(`Getting user data for ${userId}`);
      user = await getUser(userId, { inventory: 1, farmInventory: 1, gambleTokens: 1, petBot: 1 });
      logger.info(`User data retrieved successfully for ${userId}`);
    } catch (err) {
      logger.error('Error getting user in /use:', err);
      try {
        await reply(interaction, 'Database error. Please try again later.');
      } catch (apiErr) {
        logger.error('Discord API error in /use getUser:', apiErr);
      }
      return;
    }
    // Validate user object structure
    if (typeof user !== 'object' || user === null) {
      try {
        await reply(interaction, 'User data is corrupted.');
      } catch (err) {
        logger.error('Discord API error in /use user data corrupted:', err);
      }
      return;
    }
    // Special handling for gamble tokens
    if (itemName === 'Gamble Token') {
      try {
        // Use the new inventory system to check and remove tokens
        const inventoryTokens = countItem(user, 'Gamble Token');
        if (inventoryTokens > 0) {
          await removeItemFromInventory(userId, 'Gamble Token', inventoryTokens);
          await updateUserField(userId, { $inc: { gambleTokens: inventoryTokens } });
          user.gambleTokens = (user.gambleTokens || 0) + inventoryTokens;
        }
        if (!user.gambleTokens || user.gambleTokens <= 0) {
          return reply(interaction, `You don't have any Gamble Tokens. Use /gamble to play exciting gambling games!`);
        }
        return reply(interaction, `🎰 You have ${user.gambleTokens} Gamble Token(s)! Use /gamble to play exciting games:\n\n• **🎲 Dice Roll** (1 token) - Win up to 3000 coins\n• **🪙 Coin Flip** (1 token) - 50/50 chance\n• **🎰 High Stakes Slots** (2 tokens) - Win up to 10000 coins\n• **🎡 Roulette** (3 tokens) - Win up to 10000 coins\n• **🃏 Blackjack** (2 tokens) - Win up to 5000 coins\n• **🎫 Scratch Card** (1 token) - Win up to 8000 coins`);
      } catch (err) {
        logger.error('Error handling Gamble Token in /use:', err);
        return reply(interaction, 'Database error. Please try again later.');
      }
    }
    // Check if user has the item in inventory or farmInventory
    logger.info(`Checking if user ${userId} has item: ${itemName}`);
    let itemCount = 0;
    if (isFarmItem(itemName)) {
      itemCount = user.farmInventory && user.farmInventory[itemName] ? user.farmInventory[itemName].count : 0;
    } else {
      itemCount = countItem(user, itemName);
    }
    if (itemCount < amount) {
      logger.info(`User ${userId} does not have enough of item: ${itemName} (has ${itemCount}, needs ${amount})`);
      return reply(interaction, `You don't have enough of ${itemName}. You have ${itemCount}, but tried to use ${amount}.`);
    }
    logger.info(`User ${userId} has enough of item: ${itemName} (has ${itemCount}, needs ${amount})`);
    
    // Prevent using AFK Shield from /use
    if (itemName === 'AFK Shield') {
      return reply(interaction, 'Use /afk to activate your AFK Shield.');
    }
    // Prevent using Pet Bot from /use
    if (itemName === 'Pet Bot') {
      return reply(interaction, 'To activate your Pet Bot, buy it from the shop. Use /shop to get started!');
    }
    // Prevent using Fertilizer from /use
    if (itemName === 'Fertilizer') {
      return reply(interaction, 'Use /farm fertilize to apply fertilizer to your crops!');
    }
    // Handle Box of Seeds opening by name, regardless of effect
    if (itemName === 'Box of Seeds') {
      try {
        logger.info(`Opening ${amount} Box of Seeds for user ${userId}`);
        await removeItemFromInventory(userId, 'Box of Seeds', amount);
        const { SEED_TYPES } = require('./farm/constants');
        let allDrops = [];
        let rareSeeds = [];
        
        for (let box = 0; box < amount; box++) {
          const numSeeds = secureRandomInt(1, 5);
          let boxDrops = [];
          for (let i = 0; i < numSeeds; i++) {
            let roll = secureRandomFloat();
            let acc = 0;
            for (const s of SEED_TYPES) {
              acc += s.drop;
              if (roll < acc) {
                boxDrops.push(s);
                // Track rare seeds for special announcement
                if (['Epic', 'Legendary', 'Mythic', 'Divine', 'Ancient', 'Cursed', 'Galactic'].includes(s.rarity)) {
                  rareSeeds.push(s);
                }
                break;
              }
            }
          }
          allDrops.push(...boxDrops);
        }
        
        // Add all seeds to inventory
        for (const s of allDrops) {
          await addItemToInventory(userId, s.name);
        }
        
        clearUserCache(userId);
        await getUser(userId);
        
        let msg = `🌱 **Box of Seeds Opened!** 🌱\n\nYou opened ${amount} Box of Seeds and received:`;
        
        // Group seeds by type and count them
        const seedCounts = {};
        for (const s of allDrops) {
          seedCounts[s.name] = (seedCounts[s.name] || 0) + 1;
        }
        
        for (const [seedName, count] of Object.entries(seedCounts)) {
          const seed = SEED_TYPES.find(s => s.name === seedName);
          const rarity = seed ? seed.rarity : 'Unknown';
          const emoji = seed ? seed.emoji : '🌱';
          msg += `\n• ${emoji} **${seedName}** (${rarity}) x${count}`;
        }
        
        // Add rare seed announcement
        if (rareSeeds.length > 0) {
          const uniqueRareSeeds = [...new Set(rareSeeds.map(s => s.name))];
          msg += `\n\n🌟 **RARE SEEDS FOUND!** ${uniqueRareSeeds.map(name => `**${name}**`).join(', ')}`;
        }
        
        // Update quest progress for Box of Seeds opening
        await progressQuests(userId, ['seed_collector', 'premium_user', 'premium_master', 'premium_legend'], interaction);
        
        logger.info(`Box of Seeds opened successfully for user ${userId}`);
        return reply(interaction, msg);
      } catch (err) {
        logger.error('Error opening Box of Seeds in /use:', err);
        return reply(interaction, 'Database error. Please try again later.');
      }
    }
    // Handle Mystery Box opening by name, regardless of effect
    if (itemName === 'Mystery Box') {
      try {
        logger.info(`Opening ${amount} Mystery Box(es) for user ${userId}`);
        await removeItemFromInventory(userId, 'Mystery Box', amount);
        let results = [];
        for (let i = 0; i < amount; i++) {
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
          const totalWeight = mysteryBoxPool.reduce((sum, item) => sum + item.weight, 0);
                       let random = secureRandomFloat() * totalWeight;
          let selectedItem = null;
          for (const item of mysteryBoxPool) {
            random -= item.weight;
            if (random <= 0) {
              selectedItem = item;
              break;
            }
          }
          if (!selectedItem) {
            selectedItem = mysteryBoxPool[0];
          }
          await addItemToInventory(userId, selectedItem.name);
          results.push(`${selectedItem.icon} **${selectedItem.name}** (*${selectedItem.price.toLocaleString()} coins*)`);
        }
        clearUserCache(userId);
        await getUser(userId);
        const resultMsg = `📦 **Mystery Box Opened!** 📦\n\nYou opened ${amount} Mystery Box(es) and found:\n\n${results.map(r => `• ${r}`).join('\n')}`;
        await progressQuests(userId, ['mystery_explorer', 'premium_user', 'premium_master', 'premium_legend'], interaction);
        logger.info(`Mystery Box opened successfully for user ${userId}`);
        return reply(interaction, resultMsg);
      } catch (err) {
        logger.error('Error opening Mystery Box in /use:', err);
        return reply(interaction, 'Database error. Please try again later.');
      }
    }
    // Handle Loot Crate opening by name, regardless of effect
    if (itemName === 'Loot Crate') {
      try {
        logger.info(`Opening ${amount} Loot Crate(s) for user ${userId}`);
        await removeItemFromInventory(userId, 'Loot Crate', amount);
        let totalCoins = 0;
        let rareItems = [];
        for (let i = 0; i < amount; i++) {
                        let coins = 0;
              let rareItem = null;
              const roll = secureRandomFloat();
              if (roll < 0.01) {
            if (secureRandomInt(0, 2) === 0) {
              coins = 25000;
            } else {
              const rareItemsList = ['Event Pass', 'Auto Collector', 'Double Drop Card', 'Pet Bot', 'Color Pack'];
              rareItem = rareItemsList[secureRandomInt(0, rareItemsList.length)];
              await addItemToInventory(userId, rareItem);
              rareItems.push(rareItem);
            }
          } else if (roll < 0.05) {
            coins = secureRandomInt(15000, 50001);
          } else if (roll < 0.20) {
            coins = secureRandomInt(5000, 50001);
          } else {
            coins = secureRandomInt(1000, 1001);
          }
          const { multiplier } = getUserPartyMultiplierInfo(user);
          const totalMultiplier = getTotalCoinMultiplier(user) * multiplier;
          if (coins > 0) {
            const total = Math.round(coins * totalMultiplier);
            totalCoins += total;
          }
        }
        if (totalCoins > 0) {
          await updateUserField(userId, { $inc: { coins: totalCoins } });
        }
        clearUserCache(userId);
        await getUser(userId);
        let msg = `📦 **Loot Crate Results** 📦\n\nYou opened ${amount} Loot Crate(s) and received:`;
        if (totalCoins > 0) msg += `\n• ${formatKelocoins(totalCoins)} (total coins)`;
        if (rareItems.length > 0) msg += `\n• 🎉 **RARE DROP!** ${rareItems.map(x => `**${x}**`).join(', ')}`;
        if (totalCoins === 0 && rareItems.length === 0) msg += '\n• Nothing! (Unlucky!)';
        await progressQuests(userId, ['loot_opener', 'premium_user', 'premium_master', 'premium_legend'], interaction);
        logger.info(`Loot Crate(s) opened successfully for user ${userId}`);
        return reply(interaction, msg);
      } catch (err) {
        logger.error('Error opening Loot Crate in /use:', err);
        return reply(interaction, 'Database error. Please try again later.');
      }
    }
    let item;
    try {
      logger.info(`Looking up ShopItem for: ${itemName}`);
      item = await ShopItem.findOne({ name: itemName });
      logger.info(`ShopItem lookup completed for: ${itemName}`);
    } catch (err) {
      logger.error('Error finding ShopItem in /use:', err);
      return reply(interaction, 'Database error. Please try again later.');
    }
    if (!item || !item.consumable) {
      logger.info(`Item ${itemName} is not consumable or not found`);
      return reply(interaction, `${itemName} is not a consumable item.`);
    }
    logger.info(`Processing consumable item: ${itemName} with effect: ${item.effect}`);
    let result = '';
    let removeFromInventory = true;
    let totalCoins = 0;
    let totalItems = [];
    let totalBoosterTime = 0;
    let singleResult = '';
    
    try {
      // Process the effect for each item
      for (let i = 0; i < amount; i++) {
        let singleCoins = 0;
        let singleItems = [];
        
        switch (item.effect) {
          case 'loot_crate': {
            let coins = 0;
            let rareItem = null;
            const roll = secureRandomFloat();
            if (roll < 0.01) {
              if (secureRandomInt(0, 2) === 0) {
                coins = 25000;
              } else {
                const rareItems = ['Event Pass', 'Auto Collector', 'Double Drop Card', 'Pet Bot', 'Color Pack'];
                rareItem = rareItems[secureRandomInt(0, rareItems.length)];
                await addItemToInventory(userId, rareItem);
                singleItems.push(rareItem);
              }
            } else if (roll < 0.05) {
              coins = secureRandomInt(15000, 50001);
            } else if (roll < 0.20) {
              coins = secureRandomInt(5000, 50001);
            } else {
              coins = secureRandomInt(1000, 1001);
            }
            const { multiplier } = getUserPartyMultiplierInfo(user);
            const totalMultiplier = getTotalCoinMultiplier(user) * multiplier;
            if (coins > 0) {
              const total = Math.round(coins * totalMultiplier);
              singleCoins = total;
              singleResult = `Found ${formatKelocoins(total)}!`;
            } else if (rareItem) {
              singleResult = `🎉 **RARE DROP!** Found a **${rareItem}**!`;
            }
            await progressQuests(userId, ['loot_opener', 'premium_user', 'premium_master', 'premium_legend'], interaction);
            break;
          }
          case 'mystery_box': {
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
            const totalWeight = mysteryBoxPool.reduce((sum, item) => sum + item.weight, 0);
            let random = secureRandomFloat() * totalWeight;
            let selectedItem = null;
            for (const item of mysteryBoxPool) {
              random -= item.weight;
              if (random <= 0) {
                selectedItem = item;
                break;
              }
            }
            if (!selectedItem) {
              selectedItem = mysteryBoxPool[0];
            }
            await addItemToInventory(userId, selectedItem.name);
            singleItems.push(selectedItem.name);
            singleResult = `Found ${selectedItem.icon} **${selectedItem.name}**!`;
            await progressQuests(userId, ['mystery_explorer', 'premium_user', 'premium_master', 'premium_legend'], interaction);
            break;
          }
          case 'joke_generator': {
            const jokes = [
              "Why don't scientists trust atoms? Because they make up everything!",
              "Why did the scarecrow win an award? Because he was outstanding in his field!",
              "Why don't eggs tell jokes? They'd crack each other up!",
              "What do you call a fake noodle? An impasta!",
              "Why did the math book look so sad? Because it had too many problems!",
              "What do you call a bear with no teeth? A gummy bear!",
              "Why don't skeletons fight each other? They don't have the guts!",
              "What do you call a fish wearing a bowtie? So-fish-ticated!",
              "Why did the golfer bring two pairs of pants? In case he got a hole in one!",
              "What do you call a can opener that doesn't work? A can't opener!"
            ];
            singleResult = `**Random Joke:** ${jokes[secureRandomInt(0, jokes.length)]}`;
            await progressQuests(userId, ['joke_teller', 'premium_user', 'premium_master', 'premium_legend'], interaction);
            break;
          }
          case 'gift_coins':
            singleResult = `Use /gift to send coins to a friend!`;
            removeFromInventory = false;
            break;
          case 'xp_booster': {
            const now = new Date();
            const endTime = new Date(now.getTime() + (item.duration || 7200000));
            await updateUserField(userId, { xpBooster: endTime });
            const hours = Math.floor((item.duration || 7200000) / 3600000);
            totalBoosterTime += hours;
            singleResult = `⚡ **XP Booster activated!** You'll get **double XP** for **${hours} hours**!`;
            await progressQuests(userId, ['booster_user', 'booster_master', 'premium_user', 'premium_master', 'premium_legend'], interaction);
            break;
          }
          case 'coin_booster': {
            const now = new Date();
            const coinEndTime = new Date(now.getTime() + (item.duration || 10800000));
            await updateUserField(userId, { coinBooster: coinEndTime });
            const coinHours = Math.floor((item.duration || 10800000) / 3600000);
            totalBoosterTime += coinHours;
            singleResult = `💰 **Coin Booster activated!** You'll get **1.5x coins** for **${coinHours} hours**!`;
            await progressQuests(userId, ['booster_user', 'booster_master', 'premium_user', 'premium_master', 'premium_legend'], interaction);
            break;
          }
          case 'luck_booster': {
            const now = new Date();
            const luckEndTime = new Date(now.getTime() + (item.duration || 3600000));
            await updateUserField(userId, { luckBooster: luckEndTime });
            const luckHours = Math.floor((item.duration || 3600000) / 3600000);
            totalBoosterTime += luckHours;
            singleResult = `🍀 **Luck Booster activated!** You'll get **better gambling odds** for **${luckHours} hour**!`;
            await progressQuests(userId, ['booster_user', 'booster_master', 'premium_user', 'premium_master', 'premium_legend'], interaction);
            break;
          }
          case 'speed_booster': {
            const now = new Date();
            const speedEndTime = new Date(now.getTime() + (item.duration || 7200000));
            await updateUserField(userId, { speedBooster: speedEndTime });
            const speedHours = Math.floor((item.duration || 7200000) / 3600000);
            totalBoosterTime += speedHours;
            singleResult = `🏃 **Speed Booster activated!** You'll get **reduced cooldowns** for **${speedHours} hours**!`;
            await progressQuests(userId, ['booster_user', 'booster_master', 'premium_user', 'premium_master', 'premium_legend'], interaction);
            break;
          }
          case 'mega_booster': {
            const now = new Date();
            const megaEndTime = new Date(now.getTime() + (item.duration || 3600000));
            await updateUserField(userId, { 
              xpBooster: megaEndTime,
              coinBooster: megaEndTime,
              luckBooster: megaEndTime,
              speedBooster: megaEndTime
            });
            const megaHours = Math.floor((item.duration || 3600000) / 3600000);
            totalBoosterTime += megaHours;
            singleResult = `🌟 **MEGA BOOSTER ACTIVATED!** 🌟\n\n⚡ **Double XP**\n💰 **1.5x Coins**\n🍀 **Better Gambling Odds**\n🏃 **Reduced Cooldowns**\n\n**Duration:** ${megaHours} hour(s)`;
            await progressQuests(userId, ['booster_user', 'booster_master', 'premium_user', 'premium_master', 'premium_legend'], interaction);
            break;
          }
          case 'meme_pack': {
            await updateUserField(userId, { memePack: true });
            singleResult = 'Meme Pack activated! You can now use /meme once every 5 minutes.';
            break;
          }
          case 'color_pack': {
            await updateUserField(userId, { colorPack: true });
            singleResult = 'Color Pack activated! You can now use custom embed colors.';
            await progressQuests(userId, ['premium_user', 'premium_master', 'premium_legend'], interaction);
            break;
          }
          case 'double_drop':
          case 'double_drop_card': {
            if (user.doubleDropCard && new Date(user.doubleDropCard) > Date.now()) {
              singleResult = `You already have Double Drop Card active! Time left: ${Math.ceil((new Date(user.doubleDropCard) - Date.now())/3600000)}h.`;
              removeFromInventory = false;
              break;
            }
            const end = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await updateUserField(userId, { doubleDropCard: end });
            singleResult = 'Double Drop Card activated! For the next 24 hours, you will receive a random coin drop every 5 minutes. Use the Collect button to claim each drop!';
            async function sendDrop() {
              try {
                const freshUser = await getUser(userId);
                if (!freshUser.doubleDropCard || new Date(freshUser.doubleDropCard) < Date.now()) {
                  if (global.doubleDropIntervals && global.doubleDropIntervals[userId]) {
                    clearInterval(global.doubleDropIntervals[userId]);
                    delete global.doubleDropIntervals[userId];
                  }
                  return;
                }
                const coins = secureRandomInt(200, 401) + 300;
                const { ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
                const collectBtn = new ButtonBuilder()
                  .setCustomId(`collect_drop_${Date.now()}`)
                  .setLabel(`Collect ${coins} Kelocoins`)
                  .setStyle(ButtonStyle.Success);
                const row = new ActionRowBuilder().addComponents(collectBtn);
                const msg = await interaction.followUp({ content: `You have a coin drop!`, components: [row], flags: 1 << 6 });
                try {
                  const filter = i => i.user.id === userId && i.customId.startsWith('collect_drop_');
                  const collected = await msg.awaitMessageComponent({ filter, time: 30 * 1000 });
                  await User.findByIdAndUpdate(userId, { $inc: { coins } });
                  await collected.update({ content: `You collected ${coins} Kelocoins!`, components: [] });
                } catch (err) {
                  logger.warn('Coin drop collect expired or failed:', err);
                  await msg.edit({ content: 'Coin drop expired.', components: [] });
                }
              } catch (err) {
                logger.error('Error in sendDrop for Double Drop Card:', err);
              }
            }
            await sendDrop();
            if (!global.doubleDropIntervals) global.doubleDropIntervals = {};
            if (global.doubleDropIntervals[userId]) clearInterval(global.doubleDropIntervals[userId]);
            global.doubleDropIntervals[userId] = setInterval(sendDrop, 5 * 60 * 1000);
            break;
          }
          case 'event_pass':
          case 'eventPass': {
            if (!global.partyEventEnd || Date.now() >= global.partyEventEnd) {
              singleResult = 'There is no active party event. You can only activate Event Pass during a /party event.';
              removeFromInventory = false;
              break;
            }
            await User.findByIdAndUpdate(userId, { $set: { eventPass: true, eventPassEnd: new Date(global.partyEventEnd) } });
            
            // Use the new inventory system to remove Event Pass
            const removed = await removeItemFromInventory(userId, 'Event Pass', 1);
            if (!removed) {
              singleResult = 'Failed to remove Event Pass from inventory. Please try again.';
              break;
            }
            
            const updatedUserEventPass = await getUser(userId);
            if (updatedUserEventPass.eventPass && updatedUserEventPass.eventPassEnd && new Date(updatedUserEventPass.eventPassEnd) > Date.now()) {
              const until = new Date(updatedUserEventPass.eventPassEnd);
              singleResult = `Event Pass activated! You now get double rewards for the duration of this /party event.\n(Event Pass active until: ${until.toLocaleString()})`;
            } else {
              singleResult = 'Event Pass activation failed. Please try again or contact support.';
            }
            const msLeft = global.partyEventEnd - Date.now();
            setTimeout(async () => {
              try {
                await User.findByIdAndUpdate(userId, { $set: { eventPass: false, eventPassEnd: null } });
              } catch (err) {
                logger.error('Error deactivating Event Pass after party:', err);
              }
            }, msLeft);
            break;
          }
          case 'auto_collector':
          case 'autoCollector': {
            if (user.autoCollector) {
              singleResult = 'You already have Auto Collector permanently active! Your daily rewards are automatically claimed every 24 hours.';
              removeFromInventory = false;
              break;
            }
            // Set autoCollector to a far-future date to indicate permanent activation
            const farFuture = new Date('2999-12-31T23:59:59.999Z');
            await User.findByIdAndUpdate(userId, { $set: { autoCollector: farFuture } });
            singleResult = '🤖 **Auto Collector activated permanently!** Your daily rewards will now be automatically claimed every 24 hours forever!';
            break;
          }
          default:
            singleResult = `${item.name} effect: ${item.effect} (Not yet implemented)`;
            removeFromInventory = false;
        }
        
        // Accumulate results
        totalCoins += singleCoins;
        totalItems.push(...singleItems);
      }
      
      // For single item, use the result directly
      if (amount === 1) {
        result = singleResult;
      }
      
      // For multiple items, create a summary
      if (amount > 1) {
        if (totalCoins > 0) {
          result = `💰 **Used ${amount} ${itemName}(s)!**\n\n**Total coins earned:** ${formatKelocoins(totalCoins)}`;
        } else if (totalItems.length > 0) {
          // Count items
          const itemCounts = {};
          for (const item of totalItems) {
            itemCounts[item] = (itemCounts[item] || 0) + 1;
          }
          const itemList = Object.entries(itemCounts).map(([name, count]) => `• ${name} x${count}`).join('\n');
          result = `📦 **Used ${amount} ${itemName}(s)!**\n\n**Items received:**\n${itemList}`;
        } else if (totalBoosterTime > 0) {
          result = `⚡ **Used ${amount} ${itemName}(s)!**\n\n**Total booster time:** ${totalBoosterTime} hours`;
        } else {
          result = `✅ **Used ${amount} ${itemName}(s) successfully!**`;
        }
      }
      
      // Add coins to user balance if any were earned
      if (totalCoins > 0) {
        await updateUserField(userId, { $inc: { coins: totalCoins } });
      }
      
      clearUserCache(userId);
      await getUser(userId);
    } catch (err) {
      logger.error('Error handling item effect in /use:', err);
      return reply(interaction, 'Database error. Please try again later.');
    }
    if (removeFromInventory) {
      try {
        logger.info(`Removing ${amount} ${itemName}(s) from inventory for user ${userId}`);
        if (itemName === 'Shovel' || itemName === 'Pet Bot') {
          // For these items, remove them one by one
          for (let i = 0; i < amount; i++) {
            await require('../utils/utils').removeItemAndSyncCosmetic(userId, itemName);
          }
        } else {
          // For regular items, remove the correct amount
          await removeItemFromInventory(userId, itemName, amount);
        }
        logger.info(`${amount} ${itemName}(s) removed from inventory for user ${userId}`);
      } catch (err) {
        logger.error('Error removing item from inventory in /use:', err);
      }
    }
    logger.info(`/use command processing completed for user ${userId} with item ${itemName}`);
    return await reply(interaction, result);
  }, { isUserBlacklisted, rateLimiter })
}; 