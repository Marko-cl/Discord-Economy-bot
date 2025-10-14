const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, processPetCollection, calculatePetLevelXp, isUserBlacklisted } = require('../utils/utils');
const { reply } = require('../utils/formatting');
const { checkRateLimit } = require('../utils/rateLimiting');
const { User } = require('../database/db');
const PetChatbot = require('../pet/petChatbot.js');
const logger = require('../logger');
const { withSafeReply } = require('../utils/safeReply');

// Add missing rateLimiter definition
const rateLimiter = (userId) => checkRateLimit(userId, 'pet', 3, 5000);

/**
 * /pet command handler for the AI Pet Bot
 * Handles info, name, color, talk, and collect subcommands
 * Clean, robust, and easy to maintain
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Interact with your AI Pet Bot!')
    .addSubcommand(sub =>
      sub.setName('info').setDescription('Show your pet bot profile')
    )
    .addSubcommand(sub =>
      sub.setName('name').setDescription('Set your pet bot name')
        .addStringOption(opt => opt.setName('name').setDescription('Pet name').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('color').setDescription('Set your pet bot color (hex)')
        .addStringOption(opt => opt.setName('color').setDescription('Hex color, e.g. #ff00ff').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('talk').setDescription('Talk to your pet bot!')
        .addStringOption(opt => opt.setName('message').setDescription('Say something to your pet').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('collect').setDescription('Collect coins from your pet bot (1 hour cooldown)')
    ),

  /**
   * Main execute function for /pet command
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  execute: withSafeReply(async (interaction) => {
    // Apply rate limiting at the start of the command
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();
    const rateLimitResult = rateLimiter(userId);
    if (!rateLimitResult.allowed) {
      return await reply(interaction, { content: rateLimitResult.message, ephemeral: true });
    }
    let user;
    try {
      user = await getUser(userId, { hasPetBot: 1, petBot: 1 });
    } catch {
      logger.error('Database error in /pet getUser:');
      return reply(interaction, 'Database error: Could not load user data. Please try again later.');
    }
    if (!user) {
      return reply(interaction, 'User not found.');
    }
    if (typeof user !== 'object' || user === null) {
      return reply(interaction, 'User data is corrupted.');
    }

    // Each subcommand is wrapped in try/catch for robust error handling
    if (sub === 'info') {
      if (!user.hasPetBot) {
        return reply(interaction, 'You do not own a Pet Bot yet! Buy one from the shop to unlock pet features.');
      }
      try {
        const xpForNextLevel = calculatePetLevelXp(user.petBot.level || 1);
        const currentXp = user.petBot.xp || 0;
        const xpProgress = Math.floor((currentXp / xpForNextLevel) * 100);
        const { formatProgressBar } = require('../utils/utils');
        const progress = { current: currentXp, max: xpForNextLevel };
        const progressBar = formatProgressBar(progress);
        let embedColor;
        try {
          embedColor = require('../utils/utils').getUserEmbedColor(user);
        } catch {
          logger.warn('Error getting user embed color in /pet info:');
          embedColor = 0x0099ff; // Default blue color
        }
        const embed = new EmbedBuilder()
          .setTitle(`${user.petBot.name} (Your AI Pet Bot)`)
          .setDescription(`Personality: **${user.petBot.personality}**`)
          .setColor(embedColor)
          .addFields(
            { name: 'Name', value: user.petBot.name, inline: true },
            { name: 'Color', value: user.petBot.color, inline: true },
            { name: 'Personality', value: user.petBot.personality, inline: true },
            { name: 'Level', value: `${user.petBot.level || 1}`, inline: true },
            { name: 'XP Progress', value: `${currentXp}/${xpForNextLevel} (${xpProgress}%)`, inline: true },
            { name: 'Collection Streak', value: `${user.petBot.collectionStreak || 0}`, inline: true },
            { name: '📊 Level Progress', value: `${progressBar}\nNext: Level ${(user.petBot.level || 1) + 1}`, inline: false },
            { name: 'Total Coins Collected', value: `${user.petBot.totalCoinsCollected || 0} 🪙`, inline: false }
          )
          .setFooter({ text: 'Mini AI Pet - Level up by collecting coins and talking!' })
          .setTimestamp();
        await reply(interaction, '', { embeds: [embed] });
      } catch {
        logger.error('Error in /pet info:');
        return reply(interaction, 'An error occurred while loading pet information. Please try again.');
      }
    } else if (sub === 'collect') {
      if (!user.hasPetBot) {
        return reply(interaction, 'You do not own a Pet Bot yet! Buy one from the shop to unlock pet features.');
      }
      try {
        let result;
        try {
          result = await processPetCollection(userId);
        } catch {
          await reply(interaction, 'Error processing collection. Please try again.');
          return;
        }
        if (!result) {
          await reply(interaction, 'Error processing collection. Please try again.');
          return;
        }
        if (!result.success) {
          await reply(interaction, result.message);
          return;
        }
        let embedColor;
        try {
          embedColor = require('../utils/utils').getUserEmbedColor(user);
        } catch {
          logger.warn('Error getting user embed color in /pet collect:');
          embedColor = 0x0099ff; // Default blue color
        }
        const embed = new EmbedBuilder()
          .setTitle(`🪙 ${user.petBot.name} Collection Complete!`)
          .setColor(embedColor)
          .addFields(
            { name: 'Coins Collected', value: `${result.reward} 🪙`, inline: true },
            { name: 'XP Gained', value: `${result.xpGain} XP`, inline: true },
            { name: 'Seasonal Bonus', value: `${result.seasonalMultiplier ? result.seasonalMultiplier + 'x' : '1x'}`, inline: true }
          );
        if (result.leveledUp) {
          embed.addFields(
            { name: '🎉 Level Up!', value: `${user.petBot.name} reached level ${result.newLevel}!`, inline: false }
          );
        }
        embed.addFields(
          { name: 'Total Collected', value: `${result.totalCollected || 0} 🪙`, inline: false }
        )
        .setFooter({ text: 'Your pet grinds for up to 12 hours. Collect again after at least 1 hour!' })
        .setTimestamp();
        await reply(interaction, '', { embeds: [embed] });
      } catch {
        logger.error('Error in /pet collect:');
        return reply(interaction, 'An error occurred while collecting from your pet. Please try again.');
      }
    } else if (sub === 'name') {
      if (!user.hasPetBot) {
        return reply(interaction, 'You do not own a Pet Bot yet! Buy one from the shop to unlock pet features.');
      }
      try {
        let newName = interaction.options.getString('name');
        if (!newName || typeof newName !== 'string') {
          await reply(interaction, 'Please provide a valid name.');
          return;
        }
        newName = newName.trim().slice(0, 32);
        await User.findByIdAndUpdate(userId, { $set: { 'petBot.name': newName } });
        await reply(interaction, `Your pet's name is now **${newName}**!`);
      } catch {
        logger.error('Error in /pet name:');
        return reply(interaction, 'An error occurred while setting your pet name. Please try again.');
      }
    } else if (sub === 'color') {
      if (!user.hasPetBot) {
        return reply(interaction, 'You do not own a Pet Bot yet! Buy one from the shop to unlock pet features.');
      }
      try {
        let color = interaction.options.getString('color');
        if (!color || typeof color !== 'string') {
          await reply(interaction, 'Please provide a valid hex color (e.g. #ff00ff).');
          return;
        }
        color = color.trim();
        if (!/^#([0-9a-fA-F]{6})$/.test(color)) {
          await reply(interaction, 'Please provide a valid hex color (e.g. #ff00ff).');
          return;
        }
        await User.findByIdAndUpdate(userId, { $set: { 'petBot.color': color } });
        await reply(interaction, `Your pet's color is now **${color}**!`);
      } catch {
        logger.error('Error in /pet color:');
        return reply(interaction, 'An error occurred while setting your pet color. Please try again.');
      }
    } else if (sub === 'talk') {
      if (!user.hasPetBot) {
        return reply(interaction, 'You do not own a Pet Bot yet! Buy one from the shop to unlock pet features.');
      }
      try {
        let message = interaction.options.getString('message');
        
        // Input validation
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
          await reply(interaction, 'Please provide a valid message to say to your pet.');
          return;
        }
        
        // Sanitize and limit message length
        message = message.trim().slice(0, 200);
        
        if (message.length === 0) {
          await reply(interaction, 'Message cannot be empty after trimming.');
          return;
        }
        
        let replyMsg, mood;
        try {
          ({ reply: replyMsg, mood } = PetChatbot.getReply({
            userId,
            userMessage: message,
            petName: user.petBot.name,
            petPersonality: user.petBot.personality
          }));
        } catch {
          require('../logger').error('Error in PetChatbot.getReply in /pet talk:');
          replyMsg = '...';
          mood = 'neutral';
        }
        try {
          const { calculatePetXpGain, calculatePetLevelXp } = require('../utils/utils');
          const xpGain = calculatePetXpGain(user.petBot.level || 1, 'talk');
          const currentXp = (user.petBot.xp || 0) + xpGain;
          const currentLevel = user.petBot.level || 1;
          const xpForNextLevel = calculatePetLevelXp(currentLevel);
          const update = {
            'petBot.lastInteracted': new Date(),
            'petBot.xp': currentXp
          };
          if (currentXp >= xpForNextLevel) {
            update['petBot.level'] = currentLevel + 1;
            update['petBot.xp'] = currentXp - xpForNextLevel;
          }
          await User.findByIdAndUpdate(userId, update);
          let response = `*${user.petBot.name}* (${mood}) says: ${replyMsg}`;
          if (currentXp >= xpForNextLevel) {
            response += `\n\n🎉 **${user.petBot.name}** gained ${xpGain} XP and reached level ${currentLevel + 1}!`;
          } else {
            response += `\n\n✨ **${user.petBot.name}** gained ${xpGain} XP!`;
          }
          await reply(interaction, response);
        } catch {
          await reply(interaction, `*${user.petBot.name}* (${mood}) says: ${replyMsg}`);
        }
      } catch {
        logger.error('Error in /pet talk:');
        return reply(interaction, 'An error occurred while talking to your pet. Please try again.');
      }
    } else {
      // Unknown subcommand fallback
      await reply(interaction, 'Unknown subcommand.');
    }
  }, { isUserBlacklisted, rateLimiter: (userId) => checkRateLimit(userId, 'pet', 5, 10000) }),
}; 