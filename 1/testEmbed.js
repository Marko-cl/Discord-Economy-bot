const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { withSafeReply } = require('../utils/safeReply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testembed')
    .setDescription('Test sending a simple embed and button'),
  execute: withSafeReply(async (interaction) => {
    const embed = new EmbedBuilder()
      .setTitle('Test Embed')
      .setDescription('If you see this, embeds and components are working!')
      .setColor(0x00ff00);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('test_button')
        .setLabel('Test Button')
        .setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ embeds: [embed], components: [row] });
  })
}; 