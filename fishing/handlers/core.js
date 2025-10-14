// Core fishing logic and main fishing handler

const { EmbedBuilder } = require('discord.js');
const { getUserFishingData } = require('../database');
const { FISH_TYPES, FISH_RARITIES, FISHING_COOLDOWN, COLLECTION_TIERS, FISHING_BAITS, FISHING_BOOSTERS, MAX_FISH_INVENTORY } = require('../constants');
const { performFishing } = require('../logic');
const { calculateFishValue, getCollectionReward, getRandomItemReward } = require('../rewards');
const { getUserRod } = require('../rod');
const { getUserFishingBoosters } = require('../boosters');
const { User } = require('../../../database/db');
const { hasItem } = require('../../../utils/inventory');
const { progressQuests } = require('../../../utils/utils');
const { reply } = require('../../../utils/formatting');
const mongoose = require('mongoose');
const { getFishWeight } = require('../weights');
const { validators } = require('../../../utils/validation');
const { checkRateLimit } = require('../../../utils/rateLimiting');
const { withSafeReply } = require('../../../utils/safeReply');
const logger = require('../../../logger');

// Check and handle booster expiration (optimized for transaction)
function checkBoosterExpiration(userData) {
  const updates = {};
  if (userData.activeBoosterExpires && Date.now() > userData.activeBoosterExpires) {
    // Booster expired, mark for removal
    updates.activeBooster = null;
    updates.activeBoosterExpires = null;
    userData.activeBooster = null;
    userData.activeBoosterExpires = null;
  }
  return updates;
}

// Check and handle bait expiration (optimized for transaction)
function checkBaitExpiration(userData) {
  const updates = {};
  if (userData.activeBait && userData.activeBaitUses !== undefined) {
    const activeBait = FISHING_BAITS.find(b => b.id === userData.activeBait);
    if (activeBait && userData.activeBaitUses >= activeBait.uses) {
      // Bait expired, mark for removal
      updates.activeBait = null;
      updates.activeBaitUses = 0;
      userData.activeBait = null;
      userData.activeBaitUses = 0;
    }
  }
  return updates;
}

// Process fishing results and update inventory
function processFishingResults(results, userData, now, globalMultiplier) {
  const fishInventory = userData.fishInventory || {};
  const fishLog = userData.fishLog || {}; // PERMANENT collection log
  const caughtFish = [];
  let totalValue = 0;
  const items = [];
  let fishCount = 0;
  let nothingCount = 0;
  let uniqueFishBlocked = false;
  let itemRewardCount = 0;
  const ITEM_REWARD_SESSION_CAP = 2;

  // Count unique fish in inventory
  const uniqueFishCount = Object.keys(fishInventory).length;

  for (const result of results) {
    if (result.type === 'fish') {
      fishCount++;
      const fish = result.fish;
      const fishId = fish.name.toLowerCase().replace(/\s+/g, '_');
      let isFirst = false;
      // Enforce inventory cap for new unique fish
      if (!fishInventory[fishId]) {
        if (uniqueFishCount + Object.keys(fishInventory).filter(id => !userData.fishInventory || !userData.fishInventory[id]).length >= MAX_FISH_INVENTORY) {
          uniqueFishBlocked = true;
          continue; // Skip adding this new unique fish
        }
        fishInventory[fishId] = { count: 0, firstCaught: now };
        isFirst = true;
      }
      fishInventory[fishId].count++;
      // Update fish log (PERMANENT collection tracking)
      if (!fishLog[fishId]) {
        fishLog[fishId] = { count: 0, firstCaught: now, lastCaught: now };
        isFirst = true;
      }
      fishLog[fishId].count++;
      fishLog[fishId].lastCaught = now;
      // Calculate value
      const value = calculateFishValue(fish, { boosters: getUserFishingBoosters(userData), activeBooster: userData.activeBooster }, globalMultiplier);
      totalValue += value;
      caughtFish.push({ fish, value, isFirst });
      // Check for random item reward (with session cap)
      if (itemRewardCount < ITEM_REWARD_SESSION_CAP) {
        const itemReward = getRandomItemReward(fish.rarity);
        if (itemReward) {
          items.push(itemReward);
          itemRewardCount++;
        }
      }
    } else if (result.type === 'nothing') {
      nothingCount++;
    }
  }
  return {
    fishInventory,
    fishLog,
    caughtFish,
    totalValue,
    items,
    fishCount,
    nothingCount,
    uniqueFishBlocked
  };
}

// Check for collection completion rewards
function checkCollectionRewards(userData, fishLog) {
  const fishingCollectionCompleted = userData.fishingCollectionCompleted || {};
  const fishingCollectionTiers = userData.fishingCollectionTiers || {};
  const collectionRewards = [];
  const tierRewards = [];
  
  for (const rarity of Object.keys(FISH_RARITIES)) {
    const fishOfRarity = FISH_TYPES.filter(fish => fish.rarity === rarity);
    const caughtOfRarity = fishOfRarity.filter(fish => {
      const fishId = fish.name.toLowerCase().replace(/\s+/g, '_');
      return fishLog[fishId] && fishLog[fishId].count > 0;
    });
    // Check for basic collection completion (all fish of rarity)
    if (caughtOfRarity.length === fishOfRarity.length && fishOfRarity.length > 0 && !fishingCollectionCompleted[rarity]) {
      // Collection completed!
      const reward = getCollectionReward(rarity);
      collectionRewards.push({
        rarity,
        reward,
        fishCount: fishOfRarity.length
      });
      fishingCollectionCompleted[rarity] = true;
    }
    // Check for tier progression
    const currentTier = fishingCollectionTiers[rarity] || 0;
    const tiers = COLLECTION_TIERS[rarity] || [];
    for (let tierIndex = currentTier; tierIndex < tiers.length; tierIndex++) {
      const tier = tiers[tierIndex];
      if (caughtOfRarity.length >= tier.requirement) {
        // Tier completed!
        tierRewards.push({
          rarity,
          tier: tierIndex + 1,
          reward: tier.reward,
          fishCount: caughtOfRarity.length,
          requirement: tier.requirement
        });
        fishingCollectionTiers[rarity] = tierIndex + 1;
      } else {
        break; // Stop checking higher tiers if this one isn't complete
      }
    }
  }
  return {
    collectionRewards,
    tierRewards,
    fishingCollectionCompleted,
    fishingCollectionTiers
  };
}

function formatWeight(kg) {
  if (kg >= 1000) return (kg / 1000).toFixed(2) + ' tons';
  if (kg >= 1) return kg.toFixed(2) + ' kg';
  return (kg * 1000).toFixed(0) + ' g';
}

const rateLimiter = (userId) => checkRateLimit(userId, 'fish', 3, 5000);
const handleFish = withSafeReply(async (interaction) => {
  const userId = interaction.user.id;
  const now = Date.now();
  if (!validators.userId(userId)) {
    return await reply(interaction, { content: '❌ Invalid user ID!', flags: 1 << 6 });
  }
  if (!rateLimiter(userId)) {
    return await reply(interaction, { content: '⏳ You are being rate limited. Please wait before fishing again.', flags: 1 << 6 });
  }
  let transactionResult = {};
  
  try {
    // Use MongoDB's built-in withTransaction API for automatic retry handling
    const session = await mongoose.startSession();
    
    // Add timeout to prevent hanging transactions
    const transactionPromise = session.withTransaction(async () => {
      // Fishing rod requirement - quick check
      const user = await User.findById(userId, null, { session });
      if (!hasItem(user, 'Fishing Rod')) {
        throw new Error('🎣 You need a **Fishing Rod** from the shop to use /fish! Purchase it with `/shop`.');
      }
      
      // Get user's fishing data and rod
      const userData = await getUserFishingData(userId, session);
      const rod = getUserRod(userData);
      let rodCooldown = typeof rod.cooldown === 'number' ? rod.cooldown : FISHING_COOLDOWN;
      
      // Apply cooldown reduction from active booster
      if (userData.activeBooster) {
        const activeBooster = FISHING_BOOSTERS.find(b => b.id === userData.activeBooster);
        if (activeBooster && activeBooster.effects.cooldownReduction) {
          rodCooldown = Math.max(5000, rodCooldown * (1 - activeBooster.effects.cooldownReduction));
        }
      }
      
      // Atomic cooldown check and set using adjusted rod cooldown
      const userOnCooldown = await User.findOneAndUpdate(
        {
          _id: userId,
          $or: [
            { lastFished: { $exists: false } },
            { lastFished: null },
            { lastFished: { $lt: now - rodCooldown } }
          ]
        },
        { $set: { lastFished: now } },
        { new: true, upsert: false, session }
      );
      
      if (!userOnCooldown) {
        // User is on cooldown
        const user = await User.findById(userId, null, { session });
        const lastFished = user?.lastFished || 0;
        const remainingTime = Math.ceil((rodCooldown - (now - lastFished)) / 1000);
        throw new Error(`⏰ You need to wait **${remainingTime} seconds** before fishing again!`);
      }
      
      // Get user's fishing equipment and boosters
      const activeBait = userData.activeBait ? FISHING_BAITS.find(b => b.id === userData.activeBait) : null;
      const activeBooster = userData.activeBooster ? FISHING_BOOSTERS.find(b => b.id === userData.activeBooster) : null;
      const boosters = getUserFishingBoosters(userData);
      const luckBooster = userData.luckBooster || 0;
      
      // Check if active booster has expired (optimized - no DB calls)
      const boosterUpdates = checkBoosterExpiration(userData);
      
      // Check if active bait has expired (optimized - no DB calls)
      const baitUpdates = checkBaitExpiration(userData);
      
      // Determine global multiplier
      let globalMultiplier = 1;
      if (global.partyEvent && (!global.partyEvent.endTime || global.partyEvent.endTime > Date.now()) && global.partyEvent.multiplier) {
        globalMultiplier = global.partyEvent.multiplier;
      }
      
      // Perform fishing with new logic
      const results = performFishing({
        rodLevel: rod.level,
        bait: activeBait ? activeBait.id : undefined,
        boosters,
        luckBooster,
        multiCatch: rod.multiCatch || 1,
        activeBait: userData.activeBait,
        activeBooster: userData.activeBooster
      });
      
      // Process fishing results
      const {
        fishInventory,
        fishLog,
        caughtFish,
        totalValue,
        items,
        fishCount,
        nothingCount,
        uniqueFishBlocked
      } = processFishingResults(results, userData, now, globalMultiplier);
      
      // Check for collection completion rewards
      const {
        collectionRewards,
        tierRewards,
        fishingCollectionCompleted,
        fishingCollectionTiers
      } = checkCollectionRewards(userData, fishLog);
      
      // Calculate total coin rewards to batch the update
      let totalCoinReward = 0;
      for (const { reward } of collectionRewards) {
        totalCoinReward += reward.coins;
      }
      for (const { reward } of tierRewards) {
        totalCoinReward += reward;
      }
      
      // Batch all updates into a single atomic operation
      const updateData = {
        fishInventory,
        fishLog,
        fishingCollectionCompleted,
        fishingCollectionTiers,
        ...boosterUpdates,
        ...baitUpdates
      };
      
      if (userData.activeBait) {
        updateData.activeBaitUses = (userData.activeBaitUses || 0) + 1;
      }
      
      // Single atomic update with all changes
      await User.findByIdAndUpdate(
        userId, 
        { 
          $set: updateData,
          $inc: { coins: totalCoinReward }
        }, 
        { session }
      );
      
      // Store results for embed building after transaction
      transactionResult = {
        rod,
        activeBait,
        activeBooster,
        globalMultiplier,
        caughtFish,
        fishCount,
        nothingCount,
        totalValue,
        items,
        collectionRewards,
        tierRewards,
        uniqueFishBlocked,
        rodCooldown
      };
    }, {
      // Transaction options for better retry handling
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary'
    });
    
    // Add timeout to prevent hanging
    await Promise.race([
      transactionPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Transaction timeout')), 10000)
      )
    ]);
    
    await session.endSession();
    
    // Handle quest progress OUTSIDE the transaction to avoid hanging
    const questPromises = [];
    
    // Collection quests
    (transactionResult.collectionRewards || []).forEach(() => {
      questPromises.push(
        progressQuests(userId, ['fishing_collection'], interaction)
          .catch(e => logger.error('progressQuests error:', e))
      );
    });
    
    // Tier quests
    (transactionResult.tierRewards || []).forEach(() => {
      questPromises.push(
        progressQuests(userId, ['fishing_tier'], interaction)
          .catch(e => logger.error('progressQuests error:', e))
      );
    });
    
    // General fishing quests
    questPromises.push(
      progressQuests(userId, ['fishing', 'fishing_success', 'fishing_champion', 'fishing_legend'], interaction)
        .catch(e => logger.error('progressQuests error:', e))
    );
    
    // Fire and forget quest updates (don't wait for them)
    Promise.all(questPromises).catch(e => logger.error('Quest updates failed:', e));
    
  } catch (err) {
    // Check if it's a user-facing error (like cooldown or missing rod)
    if (err.message && (err.message.includes('🎣') || err.message.includes('⏰'))) {
      return await reply(interaction, { content: err.message, flags: 1 << 6 });
    }
    
    return await reply(interaction, { content: '❌ An error occurred during fishing. Please try again later!', flags: 1 << 6 });
  }
  
  // Build the embed after transaction is committed
  const {
    rod,
    activeBait,
    activeBooster,
    globalMultiplier,
    caughtFish,
    fishCount,
    nothingCount,
    totalValue,
    items,
    collectionRewards,
    tierRewards,
    uniqueFishBlocked,
    rodCooldown
  } = transactionResult;
  
  const embed = new EmbedBuilder().setColor(0x87CEEB);
  if (fishCount === 0 && nothingCount > 0) {
    embed.setTitle('🎣 Fishing Results')
      .setDescription(`😔 **No luck this time!** You didn't catch anything.`);
  } else if (fishCount > 0 && nothingCount === 0) {
    embed.setTitle('🎣 Fishing Results')
      .setDescription(`🎉 **Great catch!** You caught **${fishCount}** fish!`);
  } else {
    embed.setTitle('🎣 Fishing Results')
      .setDescription(`🎉 **Mixed results!** You caught **${fishCount}** fish and missed **${nothingCount}** attempts.`);
  }
  
  let statusLine = `**Rod:** ${rod.name}`;
  if (activeBait) statusLine += `  |  **Bait:** ${activeBait.emoji} ${activeBait.name}`;
  if (activeBooster) statusLine += `  |  **Booster:** ${activeBooster.emoji} ${activeBooster.name}`;
  if (globalMultiplier > 1) statusLine += `  |  **Event Multiplier:** x${globalMultiplier}`;
  embed.addFields({ name: '🎣 Your Setup', value: statusLine, inline: false });
  
  if (caughtFish && caughtFish.length > 0) {
    for (const { fish, value, isFirst } of caughtFish) {
      const rarityInfo = FISH_RARITIES[fish.rarity];
      const weight = getFishWeight(fish.name.toLowerCase().replace(/\s+/g, '_'));
      let name = `${fish.emoji} ${fish.name}`;
      if (isFirst) name += ' 🆕 *New catch!*';
      embed.addFields({
        name,
        value: `${rarityInfo.emoji} ${rarityInfo.label} • 💰 ${value} coins • ⚖️ ${formatWeight(weight)}`,
        inline: true
      });
    }
  }
  
  if (collectionRewards && collectionRewards.length > 0) {
    const rewardText = collectionRewards.map(({ rarity, reward, fishCount }) =>
      `🎉 **${FISH_RARITIES[rarity].emoji} ${rarity} Collection Complete!**\n` +
      `You caught all ${fishCount} ${rarity.toLowerCase()} fish! +${reward.coins} coins`
    ).join('\n\n');
    embed.addFields({
      name: '🏆 Collection Achievement!',
      value: rewardText,
      inline: false
    });
  }
  
  if (tierRewards && tierRewards.length > 0) {
    const tierText = tierRewards.map(({ reward }) =>
      `⭐ **${FISH_RARITIES[reward.rarity].emoji} ${reward.rarity}**\n` +
      `You caught ${reward.coins} coins`
    ).join('\n\n');
    embed.addFields({
      name: '⭐ Achievement Unlocked!',
      value: tierText,
      inline: false
    });
  }
  
  if (items && items.length > 0) {
    embed.addFields({
      name: '🎁 Special Items Found!',
      value: items.map(item => `${item.item} x${item.amount}`).join('\n'),
      inline: false
    });
  }
  
  if (totalValue > 0) {
    embed.addFields({
      name: '💰 Total Value',
      value: `**${totalValue} coins**`,
      inline: false
    });
  }
  
  if (uniqueFishBlocked) {
    embed.addFields({
      name: '⚠️ Inventory Full',
      value: `You have reached the maximum number of unique fish (${MAX_FISH_INVENTORY}). Catching new types of fish is blocked until you sell or remove some!`,
      inline: false
    });
  }
  
  embed.setFooter({ text: `⏰ Next fishing available in ${Math.round(rodCooldown / 1000)} seconds` });
  return await reply(interaction, { embeds: [embed] });
});

module.exports = {
  handleFish
}; 