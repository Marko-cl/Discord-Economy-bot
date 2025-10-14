const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  reply,
  isUserBlacklisted
} = require('../../utils/utils');
const { validators } = require('../../utils/validation');
const logger = require('../../logger');
const { User } = require('../../database/db');
const { QUESTS } = require('../../utils/quests');
const { withSafeReply } = require('../../utils/safeReply');
const { checkRateLimit } = require('../../utils/rateLimiting');
const { atomicUserUpdate } = require('../../utils/atomicEconomyOperations');

const rateLimiter = (userId) => checkRateLimit(userId, 'quest', 10, 5000);

const QUESTS_PER_USER = 4; // How many quests to assign per user per 12h
const QUEST_RESET_HOURS = 12;

const { secureRandomInt } = require('../../utils/secureRandom');

function getRandomQuestIds(count) {
  const allQuestIds = Object.keys(QUESTS);
  // Shuffle and pick count using secure random
  for (let i = allQuestIds.length - 1; i > 0; i--) {
    const j = secureRandomInt(0, i);
    [allQuestIds[i], allQuestIds[j]] = [allQuestIds[j], allQuestIds[i]];
  }
  return allQuestIds.slice(0, count);
}

function createThinProgressBar(percentage) {
  // 10 segments, use ▏ for filled, · for empty
  const filled = Math.floor(percentage / 10);
  const empty = 10 - filled;
  return '▏'.repeat(filled) + '·'.repeat(empty);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quest')
    .setDescription('View and manage your quests'),

  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;

    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in quest command: ${userId}`);
      return await reply(interaction, {
        content: '❌ Invalid user ID!',
        flags: 1 << 6
      });
    }

    try {
      // Get user data
      let user = await User.findById(userId);
      
      if (!user) {
        logger.warn(`Failed to load user data for quest check: ${userId}`);
        return await reply(interaction, {
          content: '❌ User not found in database!',
          flags: 1 << 6
        });
      }

      // Initialize quests object if it doesn't exist
      if (!user.quests) {
        user.quests = {
          dailyAssigned: [],
          dailyProgress: {},
          dailyCompleted: [],
          lastDailyReset: null
        };
      }

      // Check/reset quests every 12h
      const now = new Date();
      const lastReset = user.quests.lastDailyReset ? new Date(user.quests.lastDailyReset) : null;
      let needsReset = false;
      
      if (!lastReset || (now.getTime() - lastReset.getTime()) > QUEST_RESET_HOURS * 60 * 60 * 1000) {
        needsReset = true;
      }
      
      if (needsReset) {
        // Assign new random quests using atomic operation
        const newQuestIds = getRandomQuestIds(QUESTS_PER_USER);
        const result = await atomicUserUpdate(userId, {
          'quests.dailyAssigned': newQuestIds,
          'quests.dailyProgress': {},
          'quests.dailyCompleted': [],
          'quests.lastDailyReset': now
        });
        
        if (!result.success) {
          logger.error('Atomic user update failed in quest command:', result.error);
          return await reply(interaction, {
            content: '❌ An error occurred while updating quests!',
            flags: 1 << 6
          });
        }
      }
      
      const assigned = user.quests.dailyAssigned || [];
      const progress = user.quests.dailyProgress || {};
      const completed = user.quests.dailyCompleted || [];
      
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('📋 Your Quests')
        .setTimestamp();

      let hasActive = false;

      for (const questId of assigned) {
        const quest = QUESTS[questId];
        if (!quest) continue;
        
        const prog = progress[questId] || 0;
        const isCompleted = completed.includes(questId) || prog >= quest.goal;
        const percent = Math.min((prog / quest.goal) * 100, 100);
        const bar = createThinProgressBar(percent);
        
        if (!isCompleted) hasActive = true;
        
        embed.addFields({
          name: `${questId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} - ${prog}/${quest.goal}`,
          value: `${quest.goal === 1 ? '' : bar + ' '}${percent.toFixed(1)}%\n**${quest.instruction}**\nReward: ${quest.reward} coins${isCompleted ? '\n✅ Completed!' : ''}`,
          inline: false
        });
      }

      if (!hasActive) {
        embed.setDescription('🎉 All quests completed! New quests in less than 12 hours.');
      } else {
        const nextReset = new Date(user.quests.lastDailyReset.getTime() + QUEST_RESET_HOURS * 60 * 60 * 1000);
        embed.setFooter({ text: `Quests reset <t:${Math.floor(nextReset.getTime()/1000)}:R>` });
      }

      return await reply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('Quest command error:', error);
      return await reply(interaction, {
        content: '❌ An error occurred while fetching quests!',
        flags: 1 << 6
      });
    }
  }, { isUserBlacklisted, rateLimiter })
};
