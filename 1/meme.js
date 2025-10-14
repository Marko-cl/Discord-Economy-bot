const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser } = require('../utils/database.js');
const { buildEmbed } = require('../utils/embeds.js');
const { withSafeReply } = require('../utils/safeReply');
const axios = require('axios');
const { reply } = require('../utils/formatting');
const { atomicSetLastMeme } = require('../utils/atomicOperations');

// Define rateLimiter before usage
const rateLimiter = (userId) => {
  // Simple in-memory rate limit for demonstration (should be replaced with a robust solution)
  if (!global.memeRateLimits) global.memeRateLimits = {};
  const now = Date.now();
  const last = global.memeRateLimits[userId] || 0;
  const cooldown = 5000; // 5 seconds for demo, adjust as needed
  if (now - last < cooldown) {
    return { allowed: false, message: `Please wait ${Math.ceil((cooldown - (now - last)) / 1000)}s before using this command again.` };
  }
  global.memeRateLimits[userId] = now;
  return { allowed: true };
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Generate a random meme! Requires Meme Pack activation.'),

  execute: withSafeReply(async (interaction) => {
    // Apply rate limiting at the start of the command
    const userId = interaction.user.id;
    const rateLimitResult = rateLimiter(userId);
    if (!rateLimitResult.allowed) {
      return await reply(interaction, { content: rateLimitResult.message, ephemeral: true });
    }

    // Check if user has Meme Pack activated
    const userData = await getUser(userId);
    if (!userData.memePack) {
      const embed = buildEmbed({
        title: '❌ Meme Pack Required',
        description: 'You need to activate a **Meme Pack** first!\n\nUse `/use` on a Meme Pack from your inventory to unlock this feature.',
        color: 0xff6b6b,
        footer: { text: 'Meme Pack can be purchased from the shop for 7,500 coins' }
      });
      return await reply(interaction, '', { embeds: [embed], ephemeral: true });
    }

    // Check cooldown (5 minutes = 300000ms)
    const cooldownTime = 300000; // 5 minutes
    const lastMeme = userData.lastMeme;
    const now = Date.now();
    
    if (lastMeme && (now - lastMeme.getTime()) < cooldownTime) {
      const remainingTime = cooldownTime - (now - lastMeme.getTime());
      const minutes = Math.floor(remainingTime / 60000);
      const seconds = Math.floor((remainingTime % 60000) / 1000);
      
      const embed = buildEmbed({
        title: '⏰ Cooldown Active',
        description: `You can generate another meme in **${minutes}m ${seconds}s**`,
        color: 0xffa500,
        footer: { text: 'Meme generation has a 5-minute cooldown' }
      });
      return await reply(interaction, '', { embeds: [embed], ephemeral: true });
    }

    // Fetch random meme from Giphy API
    const giphyApiKey = 'gPRVNi3wFuqFYBCxMOZsxle7qMCobwAR';
    const response = await axios.get('https://api.giphy.com/v1/gifs/random', {
      params: {
        api_key: giphyApiKey,
        tag: 'meme',
        rating: 'g'
      },
      timeout: 10000
    });

    const memeData = response.data.data;
    
    if (!memeData || !memeData.images) {
      throw new Error('No meme data received from API');
    }

    // Create meme embed
    const embed = new EmbedBuilder()
      .setTitle('😂 Random Meme Generated!')
      .setDescription(`Here's a random meme for you, ${interaction.user.username}!`)
      .setImage(memeData.images.original.url)
      .setColor(0x00ff88)
      .setFooter({ 
        text: `Powered by Giphy • Meme Pack activated • Next meme in 5 minutes`,
        iconURL: interaction.user.displayAvatarURL()
      })
      .setTimestamp();

    // Update last meme timestamp and track quest progress
    await atomicSetLastMeme(userId, new Date());
    // Track quest progress (atomic if available)
    const { progressQuests } = require('../utils/quests.js');
    await progressQuests(userId, ['meme_generator'], interaction);

    await reply(interaction, '', { embeds: [embed] });
  })
}; 