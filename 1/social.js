const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, getUserPartyMultiplierInfo, getTotalCoinMultiplier, clearUserCache, isUserBlacklisted, removeItemFromInventory } = require('../utils/utils');
const { reply } = require('../utils/formatting');
const { withSafeReply } = require('../utils/safeReply');

const { User } = require('../database/db');
const logger = require('../logger');
const { hasItemFlexible } = require('../utils/utils');
const { isSafeDiscordId, validateNumber } = require('../utils/utils');
const { checkRateLimit } = require('../utils/rateLimiting');
const { progressQuests, updateUser } = require('../utils/utils');

// Transaction Tax System: 2% fee on coin transfers (trades/gifts) to prevent abuse
const TRANSACTION_TAX_RATE = 0.02; // 2%
const { atomicEconomyTransfer, atomicGiftTracking, atomicAfkShieldActivation, atomicSocialReward } = require('../utils/atomicOperations');

const SOCIAL_COOLDOWN_MS = 60 * 1000; // 1 minute cooldown

const socialActions = [
  {
    name: 'wave',
    description: 'Wave at someone',
    emoji: '👋',
    reward: 5
  },
  {
    name: 'hug',
    description: 'Give someone a hug',
    emoji: '🤗',
    reward: 10
  },
  {
    name: 'highfive',
    description: 'High five someone',
    emoji: '✋',
    reward: 8
  },
  {
    name: 'dance',
    description: 'Dance with someone',
    emoji: '💃',
    reward: 12
  }
];

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('trade')
      .setDescription('Trade items or Kelocoins with another user')
      .addUserOption(opt => opt.setName('member').setDescription('User to trade with').setRequired(true))
      .addStringOption(opt => opt.setName('offer').setDescription('What you offer (item name or Kelocoin amount)').setRequired(true)),
    execute: withSafeReply(async (interaction) => {
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const member = interaction.options.getUser('member');
      const offer = interaction.options.getString('offer');
      
              // Input validation
        if (!offer || typeof offer !== 'string' || offer.trim().length === 0 || offer.length > 50) {
         return reply(interaction, 'Please provide a valid offer (1-50 characters).', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
        }
        if (!member || !isSafeDiscordId(member.id)) return reply(interaction, 'Invalid user to trade with.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
        if (!offer || typeof offer !== 'string' || offer.length < 1 || offer.length > 50) return reply(interaction, 'Invalid offer.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
        if (member.id === interaction.user.id) {
         return reply(interaction, 'You cannot trade with yourself!', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
        }
      let sender;
      try {
        sender = await getUser(interaction.user.id);
      } catch (err) {
        logger.error('Error getting sender in /trade:', err);
        return reply(interaction, 'Database error. Please try again later.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      }
              // Validate user object structure
        if (typeof sender !== 'object' || sender === null) {
          return reply(interaction, 'User data is corrupted.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
        }
      if (!sender) {
        try {
          sender = await require('../utils/utils').updateUser(interaction.user.id, {});
        } catch (err) {
          logger.error('Error updating sender in /trade:', err);
          return reply(interaction, 'Database error. Please try again later.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
        }
      }
      let isCoin = !isNaN(offer);
      let item = null;
      let amount = 0;
      if (isCoin) {
        amount = parseInt(offer);
        if (amount <= 0 || sender.coins < amount) {
          return reply(interaction, 'You do not have enough Kelocoins to trade.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
        }
      } else {
        item = sender.inventory.find(i => i.toLowerCase() === offer.toLowerCase());
        if (!item) {
          return reply(interaction, `You do not have "${offer}" in your inventory.`, { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
        }
      }
      // Prevent trading one-time buy items (dynamic)
      let oneTimeItems = [];
      try {
        const { getOneTimeItemNames } = require('../database/db');
        oneTimeItems = await getOneTimeItemNames();
      } catch (err) {
        logger.error('Error getting one-time items in /trade:', err);
        return reply(interaction, 'Database error. Please try again later.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      }
      if (oneTimeItems.includes(item)) {
        return reply(interaction, `You cannot trade ${item} as it is a one-time buy item.`, { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      }
      // Send trade offer to recipient
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('accept_trade').setLabel('Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('decline_trade').setLabel('Decline').setStyle(ButtonStyle.Danger)
      );
      const taxInfo = isCoin ? ` (2% transaction tax applies)` : '';
      try {
        await reply(interaction, `${member}, ${interaction.user} wants to trade ${isCoin ? `${amount} Kelocoins` : item} with you.${taxInfo} Do you accept?`, { components: [row], flags: 64, isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      } catch (err) {
        logger.error('Error sending trade offer in /trade:', err);
        return;
      }
      // Wait for recipient's response
      const filter = i => i.user.id === member.id && (i.customId === 'accept_trade' || i.customId === 'decline_trade');
      try {
        const response = await interaction.channel.awaitMessageComponent({ filter, time: 30000 });
        if (response.customId === 'accept_trade') {
          // Transfer
          if (isCoin) {
            // Calculate transaction tax
            const taxAmount = Math.floor(amount * TRANSACTION_TAX_RATE);
            const netAmount = amount - taxAmount;
            try {
              // Use atomic transfer for coin transactions
              await atomicEconomyTransfer(interaction.user.id, member.id, amount, 'trade');
              clearUserCache(interaction.user.id);
              clearUserCache(member.id);
            } catch (err) {
              logger.error('DB error in /trade coin transfer:', err);
              await response.update({ content: 'Database error. Please try again later.', components: [] });
              return;
            }
            progressQuests(interaction.user.id, ['trade', 'trade_merchant', 'trade_expert', 'trade_legend'], interaction).catch(e => logger.error('progressQuests error:', e));
            logger.economy(interaction.user.id, 'trade_coins', `To: ${member.id}, Amount: ${amount}, Net: ${netAmount}`);
            const { multiplier, hasEventPass } = getUserPartyMultiplierInfo(sender);
            const totalMultiplier = getTotalCoinMultiplier(sender) * multiplier;
            const finalAmount = Math.round(netAmount * totalMultiplier);
            await response.update({ content: `Trade complete! ${interaction.user} gave ${amount} Kelocoins to ${member}. After the 2% transaction tax (${taxAmount} coins), they received ${finalAmount} Kelocoins.${multiplier > 1 ? ` (${multiplier}x event!${hasEventPass ? ' Event Pass active' : ''})` : ''}`, components: [] });
          } else {
            // Remove only one instance of the item from inventory when trading
            try {
              // Use atomic operation for item transfer
              await atomicEconomyTransfer(interaction.user.id, member.id, 1, 'trade_item', item);
              clearUserCache(interaction.user.id);
              clearUserCache(member.id);
            } catch (err) {
              logger.error('DB error in /trade item transfer:', err);
              await response.update({ content: 'Database error. Please try again later.', components: [] });
              return;
            }
            progressQuests(interaction.user.id, ['trade', 'trade_merchant', 'trade_expert', 'trade_legend'], interaction).catch(e => logger.error('progressQuests error:', e));
            logger.economy(interaction.user.id, 'trade_item', `To: ${member.id}, Item: ${item}`);
            const { multiplier, hasEventPass } = getUserPartyMultiplierInfo(sender);
            const totalMultiplier = getTotalCoinMultiplier(sender) * multiplier;
            amount = Math.round(amount * totalMultiplier);
            await response.update({ content: `Trade complete! ${interaction.user} gave ${item} to ${member}.${multiplier > 1 ? ` (${multiplier}x event!${hasEventPass ? ' Event Pass active' : ''})` : ''}`, components: [] });
          }
        } else {
          await response.update({ content: 'Trade declined.', components: [] });
        }
      } catch (err) {
        logger.error('Error in /trade recipient response:', err);
        return reply(interaction, 'Trade timed out or was not accepted.', { components: [], isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      }
    }, { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) })
  },
  {
    data: new SlashCommandBuilder()
      .setName('gift')
      .setDescription('Gift Kelocoins to another user (requires Gift Coins item)')
      .addUserOption(opt => opt.setName('member').setDescription('User to gift to').setRequired(true))
      .addIntegerOption(opt => opt.setName('amount').setDescription('Amount to gift').setRequired(true)),
    execute: withSafeReply(async (interaction) => {
      const member = interaction.options.getUser('member');
      const receiverId = member.id;
      let amount = interaction.options.getInteger('amount');
      // --- Input validation ---
      if (!member || !isSafeDiscordId(receiverId)) return reply(interaction, 'Invalid user to gift to.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      if (!validateNumber(amount, { min: 1, max: 500 })) return reply(interaction, 'Invalid amount.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      if (amount > 500) {
        logger.debug(`Gift attempted with excessive amount: ${amount} by ${interaction.user.id}`);
        return reply(interaction, 'You can only gift up to 500 coins at a time.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      }
      if (amount <= 0) {
        logger.debug(`Gift attempted with invalid amount: ${amount} by ${interaction.user.id}`);
        return reply(interaction, 'Amount must be positive!', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      }
      // Persistent gift limit logic
      const nowGift = Date.now();
      let sender;
      try {
        sender = await User.findById(interaction.user.id);
      } catch (err) {
        logger.error('Error getting sender in /gift:', err);
        return reply(interaction, 'Database error. Please try again later.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      }
      if (!sender || sender.coins < amount) {
        return reply(interaction, 'You do not have enough Kelocoins to gift.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      }
      let giftedTodayObj = sender.giftedToday || {};
      let giftData = giftedTodayObj[receiverId] || { count: 0, lastGift: 0 };
      if (nowGift - giftData.lastGift > 86400000) {
        giftData = { count: 0, lastGift: nowGift };
      }
      if (giftData.count >= 3) {
        return reply(interaction, 'You can only gift to the same person 3 times per day.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      }
      giftData.count += 1;
      giftData.lastGift = nowGift;
      giftedTodayObj[receiverId] = giftData;
      // Require and consume Gift Coins item
      if (!hasItemFlexible(sender, 'Gift Coins')) {
        logger.debug(`Gift attempted without Gift Coins item: ${interaction.user.id}`);
        return reply(interaction, 'You need a Gift Coins item in your inventory to gift coins.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      }
      // Calculate transaction tax
      const taxAmount = Math.floor(amount * TRANSACTION_TAX_RATE);
      const netAmount = amount - taxAmount;
      // Remove only one Gift Coins from inventory
      try {
        const removed = await removeItemFromInventory(interaction.user.id, 'Gift Coins', 1);
        if (!removed) {
          return reply(interaction, 'Failed to remove Gift Coins from inventory. Please try again.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
        }
        // Use atomic transfer for gift transactions and atomic gift tracking
        await atomicEconomyTransfer(interaction.user.id, member.id, amount, 'gift');
        await atomicGiftTracking(interaction.user.id, receiverId, giftedTodayObj);
      } catch (err) {
        logger.error('DB error in /gift transfer:', err);
        return reply(interaction, 'Database error. Please try again later.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      }
      clearUserCache(interaction.user.id);
      clearUserCache(member.id);
      progressQuests(interaction.user.id, ['gift', 'gift_multiple', 'gift_legend'], interaction).catch(e => logger.error('progressQuests error:', e));
      logger.economy(interaction.user.id, 'gift_sent', `Receiver: ${receiverId}, Amount: ${amount}, Tax: ${taxAmount}, Net: ${netAmount}`);
      const { multiplier, hasEventPass } = getUserPartyMultiplierInfo(sender);
      const totalMultiplier = getTotalCoinMultiplier(sender) * multiplier;
      const netAmountMultiplied = Math.round(netAmount * totalMultiplier);
      return reply(interaction, `You gifted ${amount} Kelocoins to ${member}. After the 2% transaction tax (${taxAmount} coins), they received ${netAmountMultiplied} Kelocoins.${multiplier > 1 ? ` (${multiplier}x event!${hasEventPass ? ' Event Pass active' : ''})` : ''}`, { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
    }, { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) })
  },
  {
    data: new SlashCommandBuilder()
      .setName('afk')
      .setDescription('Activate AFK Shield (immune to rob/steal for 36h, requires AFK Shield item)'),
    execute: withSafeReply(async (interaction) => {
      let user;
      try {
        user = await getUser(interaction.user.id);
      } catch (err) {
        logger.error('Error getting user in /afk:', err);
        return reply(interaction, 'Database error. Please try again later.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      }
      if (!hasItemFlexible(user, 'AFK Shield')) {
        return reply(interaction, 'You need an AFK Shield from the shop to use this command.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      }
      const nowGift = Date.now();
      if (user.afkShieldActiveUntil && user.afkShieldActiveUntil > nowGift) {
        const msLeft = user.afkShieldActiveUntil - nowGift;
        const hours = Math.ceil(msLeft / 3600000);
        return reply(interaction, `Your AFK Shield is already active for another ${hours} hour(s).`, { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      }
      const until = nowGift + 36 * 3600000;
      try {
        // Use atomic operation for AFK Shield activation
        await atomicAfkShieldActivation(interaction.user.id, until);
      } catch (err) {
        logger.error('DB error in /afk activate:', err);
        return reply(interaction, 'Database error. Please try again later.', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      }
      clearUserCache(interaction.user.id);
      return reply(interaction, '\ud83d\udee1\ufe0f AFK Shield activated! You are immune to rob/steal for 36 hours. (1 AFK Shield consumed)', { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
    }, { isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) })
  },
  {
    data: new SlashCommandBuilder()
      .setName('social')
      .setDescription('Interact socially with other users')
      .addStringOption(option =>
        option.setName('action')
          .setDescription('Social action to perform')
          .setRequired(true)
          .addChoices(
            { name: '👋 Wave', value: 'wave' },
            { name: '🤗 Hug', value: 'hug' },
            { name: '✋ High Five', value: 'highfive' },
            { name: '💃 Dance', value: 'dance' }
          ))
      .addUserOption(option =>
        option.setName('target')
          .setDescription('User to interact with')
          .setRequired(true)),
    execute: withSafeReply(async (interaction) => {
      const userId = interaction.user.id;
      const action = interaction.options.getString('action');
      const targetUser = interaction.options.getUser('target');
      try {
        if (targetUser.id === userId) {
          return reply(interaction, '❌ You cannot interact with yourself!', { flags: 1 << 6, isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
        }
        let user = await getUser(userId);
        if (!user) {
          return reply(interaction, '❌ User not found in database!', { flags: 1 << 6, isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
        }
        const nowSocial = Date.now();
        const lastSocial = user.lastSocial || 0;
        const timeSinceLastSocial = nowSocial - lastSocial;
        if (timeSinceLastSocial < SOCIAL_COOLDOWN_MS) {
          const timeRemaining = SOCIAL_COOLDOWN_MS - timeSinceLastSocial;
          const seconds = Math.ceil(timeRemaining / 1000);
          return reply(interaction, `⏰ You need to wait ${seconds} seconds before socializing again!`, { flags: 1 << 6, isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
        }
        const socialAction = socialActions.find(a => a.name === action);
        if (!socialAction) {
          return reply(interaction, '❌ Invalid social action!', { flags: 1 << 6, isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
        }
        // Update user
        await updateUser(userId, {
          coins: (user.coins || 0) + socialAction.reward,
          lastSocial: nowSocial
        });
        const embed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle(`${socialAction.emoji} Social Interaction!`)
          .setDescription(`${interaction.user.username} ${socialAction.description.toLowerCase()} ${targetUser.username}!`)
          .addFields(
            { name: '💰 Reward', value: `${socialAction.reward} coins`, inline: true },
            { name: '⏰ Next Social', value: 'Available in 1 minute', inline: true }
          )
          .setTimestamp();
        // Use atomic operation for social reward
        await atomicSocialReward(userId, socialAction.reward, nowSocial);
        return reply(interaction, '', { embeds: [embed], isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      } catch (error) {
        logger.error('Social command error:', error);
        return reply(interaction, '❌ An error occurred while performing social action!', { flags: 1 << 6, isUserBlacklisted, rateLimiter: (uid) => checkRateLimit(uid, 'social', 5, 10000) });
      }
    })
  }
]; 