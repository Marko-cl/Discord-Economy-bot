const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser } = require('../../utils/utils');
const { withSafeReply } = require('../../utils/safeReply');
const { progressQuests } = require('../../utils/utils');
const { validators } = require('../../utils/validation');
const { reply } = require('../../utils/formatting');
const { atomicUserUpdate } = require('../../utils/atomicEconomyOperations');
const logger = require('../../logger');

const PRESTIGE_REQUIREMENT = 10000; // Coins required to prestige
const PRESTIGE_MILESTONE_REWARD = 1000; // Coins given after prestige

const prestigeRanks = [
  { level: 1, name: 'Novice', multiplier: 1.0 },
  { level: 2, name: 'Apprentice', multiplier: 1.1 },
  { level: 3, name: 'Journeyman', multiplier: 1.2 },
  { level: 4, name: 'Expert', multiplier: 1.3 },
  { level: 5, name: 'Master', multiplier: 1.5 },
  { level: 6, name: 'Grandmaster', multiplier: 1.7 },
  { level: 7, name: 'Legend', multiplier: 2.0 },
  { level: 8, name: 'Mythic', multiplier: 2.5 },
  { level: 9, name: 'Divine', multiplier: 3.0 },
  { level: 10, name: 'Transcendent', multiplier: 5.0 }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('prestige')
    .setDescription('Prestige for a permanent coin multiplier (requires 10,000 coins)'),

  execute: withSafeReply(async (interaction) => {
    const userId = interaction.user.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in prestige command: ${userId}`);
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

      const currentLevel = user.prestigeLevel || 1;
      const currentCoins = user.coins || 0;
      const nextRank = prestigeRanks.find(rank => rank.level === currentLevel + 1);

      if (!nextRank) {
        return await reply(interaction, {
          content: `🏆 **Maximum Prestige Reached!** 🏆\n\nYou are already at the highest rank: **${user.prestigeRank || 'Novice'}** (Prestige ${currentLevel})\nYour permanent coin multiplier is **x${user.prestigeMultiplier || 1.0}**!`,
          flags: 1 << 6
        });
      }

      if (currentCoins < PRESTIGE_REQUIREMENT) {
        const missing = PRESTIGE_REQUIREMENT - currentCoins;
        return await reply(interaction, {
          content: `You need **${PRESTIGE_REQUIREMENT.toLocaleString()} coins** to prestige to **${nextRank.name}**!\n\nYou have **${currentCoins.toLocaleString()} coins** (${missing.toLocaleString()} more needed).\n\nCurrent rank: **${user.prestigeRank || 'Novice'}** (x${user.prestigeMultiplier || 1.0})\nNext rank: **${nextRank.name}** (x${nextRank.multiplier})`,
          flags: 1 << 6
        });
      }

      // Perform prestige with atomic operation
      const result = await atomicUserUpdate(userId, {
        coins: PRESTIGE_MILESTONE_REWARD,
        inventory: {},
        prestigeLevel: nextRank.level,
        prestigeMultiplier: nextRank.multiplier,
        prestigeRank: nextRank.name,
        mining: {
          level: 1,
          xp: 0,
          totalOresMined: 0,
          totalCoinsEarned: 0,
          lastMined: null,
          currentTool: 'Wooden Pickaxe',
          tools: ['Wooden Pickaxe'],
          ores: {},
          upgrades: {
            efficiency: 0,
            luck: 0,
            depth: 0,
            capacity: 0
          },
          quests: {
            active: [],
            completed: [],
            progress: {}
          },
          team: {
            inTeam: false,
            teamId: null,
            teamStartTime: null
          },
          streaks: {
            current: 0,
            longest: 0,
            lastMined: null
          },
          stats: {
            oresMined: {},
            toolsUsed: {},
            depthsMined: {},
            rareFinds: 0,
            totalMiningTime: 0
          }
        }
      });

      if (!result.success) {
        logger.error('Atomic user update failed in prestige command:', result.error);
        return await reply(interaction, {
          content: '❌ An error occurred while processing prestige!',
          flags: 1 << 6
        });
      }

      // Update quest progress
      progressQuests(userId, ['prestige'], interaction).catch(e => logger.error('progressQuests error:', e));

      const embed = new EmbedBuilder()
        .setColor('#ffd700')
        .setTitle('🌟 Prestige Complete!')
        .setDescription(`You are now **${nextRank.name}** (Prestige ${nextRank.level})`)
        .addFields(
          { name: '⚡ Multiplier', value: `x${nextRank.multiplier}`, inline: true },
          { name: '💰 Milestone Reward', value: `${PRESTIGE_MILESTONE_REWARD.toLocaleString()} coins`, inline: true },
          { name: '🔄 Reset', value: 'All coins and items reset for new journey', inline: true }
        )
        .setTimestamp();

      return await reply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('Prestige command error:', error);
      return await reply(interaction, {
        content: '❌ An error occurred while processing prestige!',
        flags: 1 << 6
      });
    }
  })
}; 