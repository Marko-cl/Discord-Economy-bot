const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser } = require('../utils/utils');
const { withSafeReply } = require('../utils/safeReply');
const { reply } = require('../utils/formatting');
const { checkRateLimit } = require('../utils/rateLimiting');
const { atomicBoosterPurchase, atomicBoosterUse } = require('../utils/atomicOperations');

const boosters = [
  {
    name: 'XP Booster',
    description: 'Doubles XP gain for 1 hour',
    price: 1500,
    emoji: '⚡',
    effect: 'xp_boost',
    duration: 60 * 60 * 1000 // 1 hour
  },
  {
    name: 'Coin Booster',
    description: 'Doubles coin earnings for 30 minutes',
    price: 2000,
    emoji: '💰',
    effect: 'coin_boost',
    duration: 30 * 60 * 1000 // 30 minutes
  },
  {
    name: 'Luck Booster',
    description: 'Increases luck for all activities for 2 hours',
    price: 3000,
    emoji: '🍀',
    effect: 'luck_boost',
    duration: 2 * 60 * 60 * 1000 // 2 hours
  }
];

// Rate limiting handled by checkRateLimit function

module.exports = {
  data: new SlashCommandBuilder()
    .setName('boosters')
    .setDescription('View and manage your boosters')
    .addStringOption(option =>
      option.setName('action')
        .setDescription('What to do')
        .setRequired(true)
        .addChoices(
          { name: 'View Boosters', value: 'view' },
          { name: 'Buy Booster', value: 'buy' },
          { name: 'Use Booster', value: 'use' }
        ))
    .addStringOption(option =>
      option.setName('booster')
        .setDescription('Booster to buy/use (if buying/using)')
        .setRequired(false)
        .setAutocomplete(true)),

  execute: withSafeReply(async (interaction) => {
    // Apply rate limiting at the start of the command
    const userId = interaction.user.id;
    const rateLimitResult = checkRateLimit(userId);
    if (!rateLimitResult.allowed) {
      return await reply(interaction, { content: rateLimitResult.message, ephemeral: true });
    }
    const action = interaction.options.getString('action');
    const boosterName = interaction.options.getString('booster');

    try {
      if (action === 'view') {
        return await viewBoosters(interaction);
      } else if (action === 'buy') {
        return await buyBooster(interaction, boosterName);
      } else if (action === 'use') {
        return await useBooster(interaction, boosterName);
      }
    } catch (error) {
      console.error('Boosters command error:', error);
      return await reply(interaction, {
        content: '❌ An error occurred while processing boosters command!',
        flags: 1 << 6
      });
    }
  }),

  autocomplete: async (interaction) => {
    const focusedValue = interaction.options.getFocused();
    
    const choices = boosters
      .filter(booster => booster.name.toLowerCase().includes(focusedValue.toLowerCase()))
      .map(booster => ({
        name: `${booster.emoji} ${booster.name} - ${booster.price} coins`,
        value: booster.name
      }))
      .slice(0, 25);
    
    await interaction.respond(choices);
  }
};

async function viewBoosters(interaction) {
  const userId = interaction.user.id;
  let user = await getUser(userId);
  
  if (!user) {
    return await reply(interaction, {
      content: '❌ User not found in database!',
      flags: 1 << 6
    });
  }

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('⚡ Available Boosters')
    .setDescription('Boosters provide temporary bonuses to your activities!')
    .setTimestamp();

  for (const booster of boosters) {
    const activeEffects = user.activeEffects || {};
    const isActive = activeEffects[booster.effect] && activeEffects[booster.effect] > Date.now();
    
    embed.addFields({
      name: `${booster.emoji} ${booster.name} - ${booster.price} coins`,
      value: `${booster.description}\nStatus: ${isActive ? '🟢 Active' : '🔴 Inactive'}`,
      inline: false
    });
  }

  return await reply(interaction, { embeds: [embed] });
}

async function buyBooster(interaction, boosterName) {
  if (!boosterName) {
    return await reply(interaction, {
      content: '❌ Please specify a booster to buy!',
      flags: 1 << 6
    });
  }
  const booster = boosters.find(b => b.name.toLowerCase() === boosterName.toLowerCase());
  if (!booster) {
    return await reply(interaction, {
      content: '❌ Booster not found!',
      flags: 1 << 6
    });
  }
  const userId = interaction.user.id;
  let user = await getUser(userId);
  if (!user) {
    return await reply(interaction, {
      content: '❌ User not found in database!',
      flags: 1 << 6
    });
  }
  const userCoins = user.coins || 0;
  if (userCoins < booster.price) {
    return await reply(interaction, {
      content: `❌ You don't have enough coins! You need ${booster.price} coins but have ${userCoins} coins.`,
      flags: 1 << 6
    });
  }
  // Use atomicBoosterPurchase for atomicity
  const purchaseResult = await atomicBoosterPurchase(userId, booster.name, booster.price);
  if (!purchaseResult.success) {
    return await reply(interaction, {
      content: purchaseResult.message || 'Failed to purchase booster. Please try again.',
      flags: 1 << 6
    });
  }
  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('⚡ Booster Purchased!')
    .setDescription(`You bought **${booster.emoji} ${booster.name}** for ${booster.price} coins.`)
    .addFields(
      { name: '💰 Spent', value: `${booster.price} coins`, inline: true },
      { name: '💎 Remaining', value: `${userCoins - booster.price} coins`, inline: true },
      { name: '📦 New Total', value: `${(user.inventory[booster.name] || 0) + 1} ${booster.name}`, inline: true }
    )
    .setTimestamp();
  return await reply(interaction, { embeds: [embed] });
}

async function useBooster(interaction, boosterName) {
  if (!boosterName) {
    return await reply(interaction, {
      content: '❌ Please specify a booster to use!',
      flags: 1 << 6
    });
  }
  const booster = boosters.find(b => b.name.toLowerCase() === boosterName.toLowerCase());
  if (!booster) {
    return await reply(interaction, {
      content: '❌ Booster not found!',
      flags: 1 << 6
    });
  }
  const userId = interaction.user.id;
  let user = await getUser(userId);
  if (!user) {
    return await reply(interaction, {
      content: '❌ User not found in database!',
      flags: 1 << 6
    });
  }
  // Use atomicBoosterUse for atomicity
  const useResult = await atomicBoosterUse(userId, booster.name, booster.effect, booster.duration);
  if (!useResult.success) {
    return await reply(interaction, {
      content: useResult.message || `❌ You don't have any ${booster.name}!`,
      flags: 1 << 6
    });
  }
  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('⚡ Booster Activated!')
    .setDescription(`You used **${booster.emoji} ${booster.name}**`)
    .addFields(
      { name: '🎯 Effect', value: booster.description, inline: false },
      { name: '⏰ Duration', value: `${Math.floor(booster.duration / (60 * 1000))} minutes`, inline: true },
      { name: '📦 Remaining', value: `${(user.inventory[booster.name] || 0) - 1} ${booster.name}`, inline: true }
    )
    .setTimestamp();
  return await reply(interaction, { embeds: [embed] });
} 