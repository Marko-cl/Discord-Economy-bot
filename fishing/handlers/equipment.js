// Equipment management handlers

const { EmbedBuilder } = require('discord.js');
const { getUserFishingData, updateUserFishingData } = require('../database');
const { ROD_UPGRADES, FISHING_BAITS, FISHING_BOOSTERS } = require('../constants');
const { getUserRod } = require('../rod');
const { User } = require('../../../database/db');
const { removeItemFromInventory } = require('../../../utils/utils');
const logger = require('../../../logger');
const { validators } = require('../../../utils/validation');
const { checkRateLimit } = require('../../../utils/rateLimiting');
const { withSafeReply } = require('../../../utils/safeReply');
const { performAtomicOperation } = require('../../../utils/atomicOperations');

const rateLimiter = (userId) => checkRateLimit(userId, 'fishing_equipment', 5, 5000);

// Rod management handler
const handleRod = withSafeReply(async (interaction) => {
  try {
    const userId = interaction.user.id;
    const action = interaction.options.getString('action');
    
    if (!validators.userId(userId)) {
      return { content: '❌ Invalid user ID!', flags: 1 << 6 };
    }
    if (!rateLimiter(userId)) {
      return { content: '⏳ You are being rate limited. Please wait before using rod commands again.', flags: 1 << 6 };
    }
    if (!validators.string(action)) {
      return { content: '❌ Invalid action parameter!', flags: 1 << 6 };
    }

    if (action === 'info') {
      const userData = await getUserFishingData(userId);
      const rod = getUserRod(userData);
      
      const embed = new EmbedBuilder()
        .setTitle('🎣 Your Fishing Rod')
        .setColor(0x87CEEB)
        .addFields(
          { name: '🎣 Rod', value: rod.name, inline: true },
          { name: '⭐ Level', value: `${rod.level}`, inline: true },
          { name: '🎯 Multi-Catch', value: `${rod.multiCatch || 1}`, inline: true },
          { name: '⏰ Cooldown', value: `${Math.round(rod.cooldown / 1000)}s`, inline: true },
          { name: '💰 Value Bonus', value: `${Math.round((rod.valueMultiplier - 1) * 100)}%`, inline: true },
          { name: '🍀 Luck Bonus', value: `${Math.round((rod.luckMultiplier - 1) * 100)}%`, inline: true }
        )
        .setFooter({ text: 'Use /fish rod upgrade to improve your rod!' });
      
      return { embeds: [embed] };
    } else if (action === 'upgrade') {
      const userData = await getUserFishingData(userId);
      const rod = getUserRod(userData);
      
      // Check if user has enough coins
      const user = await User.findById(userId);
      const upgradeCost = Math.floor(1000 * Math.pow(1.5, rod.level - 1));
      
      if (user.coins < upgradeCost) {
        return {
          content: `💰 You need **${upgradeCost.toLocaleString()}** coins to upgrade your rod. You have **${user.coins.toLocaleString()}** coins.`,
          flags: 1 << 6
        };
      }
      
      // Upgrade rod
      const newLevel = rod.level + 1;
      const newRod = ROD_UPGRADES.find(r => r.level === newLevel);
      
      if (!newRod) {
        return {
          content: '🎣 Your rod is already at maximum level!',
          flags: 1 << 6
        };
      }
      
      // Use atomic operations to update both rod level and coins
      await performAtomicOperation(async (session) => {
        await updateUserFishingData(userId, { rodLevel: newLevel }, session);
        await User.findByIdAndUpdate(userId, { $inc: { coins: -upgradeCost } }, { session });
      });
      
      const embed = new EmbedBuilder()
        .setTitle('🎣 Rod Upgraded!')
        .setColor(0x00ff00)
        .setDescription(`Your rod has been upgraded to **${newRod.name}**!`)
        .addFields(
          { name: '⭐ New Level', value: `${newRod.level}`, inline: true },
          { name: '🎯 Multi-Catch', value: `${newRod.multiCatch || 1}`, inline: true },
          { name: '⏰ Cooldown', value: `${Math.round(newRod.cooldown / 1000)}s`, inline: true },
          { name: '💰 Value Bonus', value: `${Math.round((newRod.valueMultiplier - 1) * 100)}%`, inline: true },
          { name: '🍀 Luck Bonus', value: `${Math.round((newRod.luckMultiplier - 1) * 100)}%`, inline: true },
          { name: '💸 Cost', value: `${upgradeCost.toLocaleString()} coins`, inline: true }
        );
      
      // Progress quests for rod upgrade
      const { progressQuests } = require('../../../utils/utils');
      await progressQuests(userId, ['fishing_rod_upgrade', 'fishing_equipment'], interaction).catch(e => logger.error('progressQuests error:', e));
      
      return { embeds: [embed] };
    }
  } catch (error) {
    logger.error('Error in handleRod:', error);
    return { content: '❌ An error occurred while processing your rod command!', flags: 1 << 6 };
  }
});

// Bait management handler
const handleBait = withSafeReply(async (interaction) => {
  try {
    const userId = interaction.user.id;
    const action = interaction.options.getString('action');
    
    if (!validators.userId(userId)) {
      return { content: '❌ Invalid user ID!', flags: 1 << 6 };
    }
    if (!rateLimiter(userId)) {
      return { content: '⏳ You are being rate limited. Please wait before using bait commands again.', flags: 1 << 6 };
    }
    if (!validators.string(action)) {
      return { content: '❌ Invalid action parameter!', flags: 1 << 6 };
    }

    if (action === 'info') {
      const userData = await getUserFishingData(userId);
      const activeBait = userData.activeBait ? FISHING_BAITS.find(b => b.id === userData.activeBait) : null;
      
      const embed = new EmbedBuilder()
        .setTitle('🪱 Your Fishing Bait')
        .setColor(0x87CEEB);
      
      if (activeBait) {
        const usesLeft = activeBait.uses - (userData.activeBaitUses || 0);
        embed.setDescription(`You have **${activeBait.name}** active!`)
          .addFields(
            { name: '🪱 Bait', value: `${activeBait.emoji} ${activeBait.name}`, inline: true },
            { name: '📊 Uses Left', value: `${usesLeft}/${activeBait.uses}`, inline: true },
            { name: '🎯 Catch Bonus', value: `${Math.round((activeBait.effects.catchBonus - 1) * 100)}%`, inline: true },
            { name: '💰 Value Bonus', value: `${Math.round((activeBait.effects.valueBonus - 1) * 100)}%`, inline: true }
          );
      } else {
        embed.setDescription('You don\'t have any active bait.\n\nUse `/fish bait activate <bait>` to activate bait from your inventory!');
      }
      
      return { embeds: [embed] };
    } else if (action === 'activate') {
      const baitName = interaction.options.getString('bait');
      
      if (!validators.string(baitName)) {
        return {
          content: '❌ Please specify which bait to activate.',
          flags: 1 << 6
        };
      }
      
      // Find the bait
      const bait = FISHING_BAITS.find(b => b.name.toLowerCase() === baitName.toLowerCase());
      if (!bait) {
        return {
          content: `❌ Bait "${baitName}" not found. Available baits: ${FISHING_BAITS.map(b => b.name).join(', ')}`,
          flags: 1 << 6
        };
      }
      
      // Check if user has the bait
      const hasBait = await removeItemFromInventory(userId, bait.name, 1);
      if (!hasBait) {
        return {
          content: `❌ You don't have any ${bait.name} in your inventory.`,
          flags: 1 << 6
        };
      }
      
      // Activate bait
      await updateUserFishingData(userId, {
        activeBait: bait.id,
        activeBaitUses: 0
      });
      
      const embed = new EmbedBuilder()
        .setTitle('🪱 Bait Activated!')
        .setColor(0x00ff00)
        .setDescription(`You activated **${bait.emoji} ${bait.name}**!`)
        .addFields(
          { name: '🎯 Catch Bonus', value: `${Math.round((bait.effects.catchBonus - 1) * 100)}%`, inline: true },
          { name: '💰 Value Bonus', value: `${Math.round((bait.effects.valueBonus - 1) * 100)}%`, inline: true },
          { name: '📊 Uses', value: `${bait.uses}`, inline: true }
        )
        .setFooter({ text: 'Your bait will be consumed as you fish!' });
      
      // Progress quests for bait activation
      const { progressQuests } = require('../../../utils/utils');
      await progressQuests(userId, ['fishing_bait_activate', 'fishing_equipment'], interaction).catch(e => logger.error('progressQuests error:', e));
      
      return { embeds: [embed] };
    }
  } catch (error) {
    logger.error('Error in handleBait:', error);
    return { content: '❌ An error occurred while processing your bait command!', flags: 1 << 6 };
  }
});

// Booster management handler
const handleBooster = withSafeReply(async (interaction) => {
  try {
    const userId = interaction.user.id;
    const action = interaction.options.getString('action');
    
    if (!validators.userId(userId)) {
      return { content: '❌ Invalid user ID!', flags: 1 << 6 };
    }
    if (!rateLimiter(userId)) {
      return { content: '⏳ You are being rate limited. Please wait before using booster commands again.', flags: 1 << 6 };
    }
    if (!validators.string(action)) {
      return { content: '❌ Invalid action parameter!', flags: 1 << 6 };
    }

    if (action === 'info') {
      const userData = await getUserFishingData(userId);
      const activeBooster = userData.activeBooster ? FISHING_BOOSTERS.find(b => b.id === userData.activeBooster) : null;
      
      const embed = new EmbedBuilder()
        .setTitle('⚡ Your Fishing Booster')
        .setColor(0x87CEEB);
      
      if (activeBooster && userData.activeBoosterExpires && Date.now() < userData.activeBoosterExpires) {
        const timeLeft = Math.ceil((userData.activeBoosterExpires - Date.now()) / 1000 / 60); // minutes
        embed.setDescription(`You have **${activeBooster.emoji} ${activeBooster.name}** active!`)
          .addFields(
            { name: '⚡ Booster', value: `${activeBooster.emoji} ${activeBooster.name}`, inline: true },
            { name: '⏰ Time Left', value: `${timeLeft} minutes`, inline: true },
            { name: '🎯 Catch Bonus', value: `${Math.round((activeBooster.effects.catchBonus - 1) * 100)}%`, inline: true },
            { name: '💰 Value Bonus', value: `${Math.round((activeBooster.effects.valueBonus - 1) * 100)}%`, inline: true },
            { name: '⏱️ Cooldown Reduction', value: `${Math.round(activeBooster.effects.cooldownReduction * 100)}%`, inline: true }
          );
      } else {
        embed.setDescription('You don\'t have any active booster.\n\nUse `/fish booster activate <booster>` to activate a booster from your inventory!');
      }
      
      return { embeds: [embed] };
    } else if (action === 'activate') {
      const boosterName = interaction.options.getString('booster');
      
      if (!validators.string(boosterName)) {
        return {
          content: '❌ Please specify which booster to activate.',
          flags: 1 << 6
        };
      }
      
      // Find the booster
      const booster = FISHING_BOOSTERS.find(b => b.name.toLowerCase() === boosterName.toLowerCase());
      if (!booster) {
        return {
          content: `❌ Booster "${boosterName}" not found. Available boosters: ${FISHING_BOOSTERS.map(b => b.name).join(', ')}`,
          flags: 1 << 6
        };
      }
      
      // Check if user has the booster
      const hasBooster = await removeItemFromInventory(userId, booster.name, 1);
      if (!hasBooster) {
        return {
          content: `❌ You don't have any ${booster.name} in your inventory.`,
          flags: 1 << 6
        };
      }
      
      // Activate booster
      const expiresAt = Date.now() + (booster.duration || 3600000); // 1 hour default
      await updateUserFishingData(userId, {
        activeBooster: booster.id,
        activeBoosterExpires: expiresAt
      });
      
      const durationMinutes = Math.floor((booster.duration || 3600000) / 1000 / 60);
      const embed = new EmbedBuilder()
        .setTitle('⚡ Booster Activated!')
        .setColor(0x00ff00)
        .setDescription(`You activated **${booster.emoji} ${booster.name}**!`)
        .addFields(
          { name: '🎯 Catch Bonus', value: `${Math.round((booster.effects.catchBonus - 1) * 100)}%`, inline: true },
          { name: '💰 Value Bonus', value: `${Math.round((booster.effects.valueBonus - 1) * 100)}%`, inline: true },
          { name: '⏱️ Cooldown Reduction', value: `${Math.round(booster.effects.cooldownReduction * 100)}%`, inline: true },
          { name: '⏰ Duration', value: `${durationMinutes} minutes`, inline: true }
        )
        .setFooter({ text: 'Your booster will expire automatically!' });
      
      // Progress quests for booster activation
      const { progressQuests } = require('../../../utils/utils');
      await progressQuests(userId, ['fishing_booster_activate', 'fishing_equipment'], interaction).catch(e => logger.error('progressQuests error:', e));
      
      return { embeds: [embed] };
    }
  } catch (error) {
    logger.error('Error in handleBooster:', error);
    return { content: '❌ An error occurred while processing your booster command!', flags: 1 << 6 };
  }
});

module.exports = {
  handleRod,
  handleBait,
  handleBooster
}; 