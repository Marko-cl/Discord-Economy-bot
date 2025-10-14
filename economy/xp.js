const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, reply, isUserBlacklisted } = require('../../utils/utils');
const { withSafeReply } = require('../../utils/safeReply');
const { validators } = require('../../utils/validation');
const { checkRateLimit } = require('../../utils/rateLimiting');
const logger = require('../../logger');

const XP_PER_LEVEL = 1000; // Base XP required for level 1
const XP_INCREASE = 250; // Additional XP per level

const rateLimiter = (userId) => checkRateLimit(userId, 'xp', 10, 5000); // 10 uses per 5 seconds

function calculateLevel(xp) {
  let level = 1;
  let requiredXP = XP_PER_LEVEL;
  
  while (xp >= requiredXP) {
    xp -= requiredXP;
    level++;
    requiredXP = XP_PER_LEVEL + (XP_INCREASE * (level - 1));
  }
  
  return level;
}

function calculateXPForNextLevel(level) {
  return XP_PER_LEVEL + (XP_INCREASE * (level - 1));
}

function calculateProgress(xp, level) {
  let totalXPForCurrentLevel = 0;
  for (let i = 1; i < level; i++) {
    totalXPForCurrentLevel += XP_PER_LEVEL + (XP_INCREASE * (i - 1));
  }
  
  const currentLevelXP = xp - totalXPForCurrentLevel;
  const requiredXP = calculateXPForNextLevel(level);
  
  return {
    current: currentLevelXP,
    required: requiredXP,
    percentage: Math.floor((currentLevelXP / requiredXP) * 100)
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('xp')
    .setDescription('View your XP and level information')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to check XP for (optional)')
        .setRequired(false)),

  execute: withSafeReply(async (interaction) => {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const userId = targetUser.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in xp command: ${userId}`);
      return await reply(interaction, {
        content: '❌ Invalid user ID!',
        flags: 1 << 6
      });
    }

    try {
      // Get user data
      let user = await getUser(userId);
      
      if (!user) {
        return await reply(interaction, {
          content: '❌ User not found in database!',
          flags: 1 << 6
        });
      }

      const xp = user.xp || 0;
      const level = calculateLevel(xp);
      const progress = calculateProgress(xp, level);
      const xpForNextLevel = calculateXPForNextLevel(level);

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`📊 ${targetUser.username}'s XP & Level`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          { name: '⭐ Total XP', value: `${xp.toLocaleString()}`, inline: true },
          { name: '📈 Level', value: `${level}`, inline: true },
          { name: '🎯 XP to Next Level', value: `${xpForNextLevel.toLocaleString()}`, inline: true },
          { name: '📊 Progress', value: `${progress.current}/${progress.required} (${progress.percentage}%)`, inline: false }
        )
        .setTimestamp();

      return await reply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('Error in xp command:', error);
      return await reply(interaction, {
        content: '❌ An error occurred while fetching XP information!',
        flags: 1 << 6
      });
    }
  }, { isUserBlacklisted, rateLimiter })
}; 