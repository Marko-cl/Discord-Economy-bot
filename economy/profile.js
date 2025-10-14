const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  getUser,
  getUnlockProgress,
  progressQuests,
  reply,
  isUserBlacklisted,
  formatProgressBar,
  formatKelocoins,
  getUserEmbedColor
} = require('../../utils/utils');
const { withSafeReply } = require('../../utils/safeReply');
const { validators } = require('../../utils/validation');
const logger = require('../../logger');
const { secureRandomChoice } = require('../../utils/secureRandom');
const { checkRateLimit } = require('../../utils/rateLimiting');

const rateLimiter = (userId) => checkRateLimit(userId, 'profile', 5, 10000);

module.exports = {
  // /profile
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your profile or another user\'s profile')
    .addUserOption(opt => opt.setName('user').setDescription('User to view')),
  execute: withSafeReply(async (interaction) => {
    const target = interaction.options.getUser('user') || interaction.user;
    const userId = target.id;
    
    // Input validation
    if (!validators.userId(userId)) {
      logger.warn(`Invalid user ID in profile command: ${userId}`);
      return await reply(interaction, {
        content: '❌ Invalid user ID!',
        flags: 1 << 6
      });
    }
    
    try {
      // Get user data
      const user = await getUser(userId, { 
        coins: 1, 
        level: 1, 
        xp: 1, 
        prestigeLevel: 1, 
        inventory: 1, 
        petBot: 1, 
        colorPack: 1, 
        embedColor: 1, 
        hasGoldenPetBot: 1, 
        hasDiamondShovel: 1, 
        afkShieldActiveUntil: 1, 
        mining: 1 
      });
      
      if (!user) {
        return reply(interaction, 'Error: Could not load user data. Please try again.');
      }
      
      // Update quest progress for own profile
      if (target.id === interaction.user.id) {
        progressQuests(interaction.user.id, ['profile_view'], interaction).catch(e => logger.error('progressQuests error in profile:', e));
      }
      
      // Create embed
      const embed = new EmbedBuilder()
        .setTitle(`${target.username}'s Profile`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setColor(getUserEmbedColor(user))
        .setTimestamp();
      
      // Add basic profile fields
      const miningLevel = user.mining?.level || 1;
      embed.addFields(
        { name: '🪙 Coins', value: formatKelocoins(user.coins || 0), inline: true },
        { name: '📊 Level', value: `${user.level || 1}`, inline: true },
        { name: '⭐ XP', value: `${user.xp || 0}`, inline: true },
        { name: '🏆 Prestige', value: `${user.prestigeLevel || 0}`, inline: true },
        { name: '⛏️ Mine Level', value: `${miningLevel}`, inline: true },
        { name: '🤖 Pet Level', value: (user.petBot && user.petBot.level) ? `${user.petBot.level}` : 'None', inline: true }
      );
      
      // Get unlock progress
      const progress = await getUnlockProgress(user);
      
      // Calculate prestige progress
      const { prestigeRanks } = require('../../database/db');
      const maxPrestige = progress.prestige?.max || 0;
      const userCoins = user.coins || 0;
      const userPrestigeLevel = user.prestigeLevel || user.prestige || 1;
      const currentRank = prestigeRanks[Math.max(0, Math.min(userPrestigeLevel - 1, prestigeRanks.length - 1))];
      const nextRank = prestigeRanks[Math.max(0, Math.min(userPrestigeLevel, prestigeRanks.length - 1))];
      
      let prestigeBar, prestigeLabel;
      if (!progress.prestige || !maxPrestige || maxPrestige <= 1) {
        prestigeBar = 'No prestige progress';
        prestigeLabel = '';
      } else if (userPrestigeLevel >= maxPrestige) {
        prestigeBar = '━━━━━━━━━━━━━━━━━━━━ 100%';
        prestigeLabel = 'Max Prestige!';
      } else {
        const coinsRequired = nextRank.coinsRequired;
        const percent = Math.min(Math.floor((userCoins / coinsRequired) * 100), 100);
        const filled = Math.floor((percent / 100) * 10);
        const bar = '─'.repeat(filled) + '┄'.repeat(10 - filled);
        prestigeBar = `${bar} ${percent}%`;
        if (userCoins >= coinsRequired) {
          prestigeLabel = `${currentRank.name} → ${nextRank.name} (Ready to Prestige!)`;
        } else {
          prestigeLabel = `${currentRank.name} → ${nextRank.name} (${userCoins.toLocaleString()} / ${coinsRequired.toLocaleString()} coins)`;
        }
      }
      
      // Calculate progress values for bars
      const levelProgress = progress.level?.current && progress.level?.max ? progress.level.current / progress.level.max : 0;
      const petProgress = progress.pet?.current && progress.pet?.max ? progress.pet.current / progress.pet.max : 0;
      
      // Calculate mining progress
      const mineXp = user.mining?.xp || 0;
      const mineXpRequired = 1000; // Mining levels up every 1000 XP
      const mineCurrentLevelXp = mineXp % mineXpRequired;
      const mineProgress = mineXpRequired > 0 ? mineCurrentLevelXp / mineXpRequired : 0;
      
      embed.addFields(
        { name: '⭐ Prestige', value: `${progress.prestige?.prestigeRank || 'None'} (x${progress.prestige?.prestigeMultiplier || 1})`, inline: true },
        { name: '📊 Level Progress', value: `${formatProgressBar(levelProgress)}\nNext: Level ${progress.level?.next || 1}`, inline: false },
        { name: '📊 Prestige Progress', value: `${prestigeBar}\n${prestigeLabel}`, inline: false },
        { name: '🤖 Pet Progress', value: `${formatProgressBar(petProgress)}\n${(progress.pet?.max > 0 && !isNaN(progress.pet?.max)) ? `Next: Level ${progress.pet.next}` : 'Get a Pet Bot from the shop!'}` , inline: false },
        { name: '⛏️ Mine Progress', value: `${formatProgressBar(mineProgress)}\nNext: Level ${miningLevel + 1}` , inline: false }
      );
      
      // Add AFK shield info if active
      const now = Date.now();
      if (user.afkShieldActiveUntil && user.afkShieldActiveUntil > now) {
        const msLeft = user.afkShieldActiveUntil - now;
        const hours = Math.ceil(msLeft / 3600000);
        embed.addFields({
          name: '🛡️ Shield Boost',
          value: `AFK Shield is **ACTIVE** for another ${hours} hour(s). You are protected from rob/steal!`,
          inline: false
        });
      }
      
      // Add random mood
      const moods = [
        '⭐ Rising Star!',
        '💰 Big Spender!',
        '🏆 Prestige Hunter!',
        '🎣 Fishing Pro!',
        '😂 Meme Collector!',
        '🤖 Pet Lover!',
        '⛏️ Mining Champ!',
        '🎨 Colorful Personality!',
        '🎁 Generous Gifter!',
        '🛒 Shopaholic!'
      ];
      const selectedMood = secureRandomChoice(moods) || '⭐ Welcome to Kelonomy!';
      embed.setDescription(selectedMood);
      
      // Add random tip
      const tips = [
        '💡 Tip: Use /inventory to see your items!',
        '💡 Tip: Prestige for permanent coin multipliers!',
        '💡 Tip: Pet Bots can be leveled up for rewards!',
        '💡 Tip: Try /shop for new items!',
        '💡 Tip: Boosters make you stronger!',
        '💡 Tip: Invite friends for more fun!'
      ];
      const selectedTip = secureRandomChoice(tips) || '💡 Tip: Use /help to see all available commands!';
      embed.addFields({
        name: '🎉 Profile Fun Fact',
        value: selectedTip,
        inline: false
      });
      
      await reply(interaction, '', { embeds: [embed] });
    } catch (err) {
      logger.error('Error in profile command:', err);
      await reply(interaction, 'Error loading profile. Please try again later.');
    }
  }, { deferReply: true, isUserBlacklisted, rateLimiter })
};
