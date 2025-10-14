const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { User } = require('../database/db');
const quizFile = path.join(__dirname, 'games/quiz_questions.json');
const { isUserBlacklisted, isSafeDiscordId } = require('../utils/utils');
const { checkRateLimit } = require('../utils/rateLimiting');
const { withSafeReply } = require('../utils/safeReply');
const { reply } = require('../utils/formatting');
const logger = require('../logger');

const rateLimiter = (userId) => checkRateLimit(userId, 'quiz', 5, 10000);
const { secureRandomInt, secureShuffle } = require('../utils/secureRandom');

// Helper to load questions
function loadQuestions() {
  if (!fs.existsSync(quizFile)) return {};
  return JSON.parse(fs.readFileSync(quizFile, 'utf8'));
}

// Helper to pick a random question
function getRandomQuestion(questions) {
  if (!questions || questions.length === 0) return null;
  return questions[secureRandomInt(0, questions.length)];
}

// Helper to shuffle options
function shuffleArray(array) {
  return secureShuffle(array);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('Start the quiz!'),
  execute: withSafeReply(async (interaction) => {
    // Apply rate limiting at the start of the command
    const userId = interaction.user.id;
    const rateLimitResult = rateLimiter(userId);
    if (!rateLimitResult.allowed) {
      return await reply(interaction, { content: rateLimitResult.message, ephemeral: true });
    }
    if (!isSafeDiscordId(userId)) {
      logger.warn(`Invalid user ID in quiz command: ${userId}`);
      await reply(interaction, { content: 'Invalid user ID.', flags: 1 << 6 });
      return;
    }
    try {
      let questionsData;
      try {
        questionsData = loadQuestions();
      } catch (err) {
        logger.error('Error loading quiz questions:', err);
        await reply(interaction, { content: 'Error loading quiz questions. Please try again later.', flags: 1 << 6 });
        return;
      }
      const categories = Object.keys(questionsData);
      const difficulties = ['easy', 'medium', 'hard'];
      if (!categories.length) {
        await reply(interaction, { content: 'No quiz categories available. Please contact the bot owner.', flags: 1 << 6 });
        return;
      }
      // 1. Show embed with categories and difficulties
      let embed;
      try {
        embed = new EmbedBuilder()
          .setTitle('Quiz Setup')
          .setDescription('Select a category and difficulty to begin!')
          .addFields(
            { name: 'Categories', value: categories.map(c => `• ${c}`).join('\n') },
            { name: 'Difficulties', value: difficulties.map(d => `• ${d.charAt(0).toUpperCase() + d.slice(1)}`).join('\n') }
          );
      } catch (err) {
        logger.error('Error building quiz setup:', err);
        await reply(interaction, { content: 'Error building quiz setup. Please try again later.', flags: 1 << 6 });
        return;
      }
      // 2. Create select menus
      let row1, row2;
      try {
        const categoryMenu = new StringSelectMenuBuilder()
          .setCustomId('quiz_category')
          .setPlaceholder('Select a category')
          .addOptions(categories.map(c => ({ label: c, value: c })));
        const difficultyMenu = new StringSelectMenuBuilder()
          .setCustomId('quiz_difficulty')
          .setPlaceholder('Select a difficulty')
          .addOptions(difficulties.map(d => ({
            label: d.charAt(0).toUpperCase() + d.slice(1),
            value: d
          })));
        row1 = new ActionRowBuilder().addComponents(categoryMenu);
        row2 = new ActionRowBuilder().addComponents(difficultyMenu);
      } catch (err) {
        logger.error('Error building quiz menus:', err);
        await reply(interaction, { content: 'Error building quiz menus. Please try again later.', flags: 1 << 6 });
        return;
      }
      await reply(interaction, { embeds: [embed], components: [row1, row2], flags: 1 << 6 });
      // 3. Collect user selections
      const filter = i => i.user.id === interaction.user.id;
      const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000 });
      let selectedCategory = null;
      let selectedDifficulty = null;
      collector.on('collect', async i => {
        try {
          if (i.customId === 'quiz_category') {
            selectedCategory = i.values[0];
            await i.reply({ content: `Category selected: **${selectedCategory}**`, flags: 1 << 6 });
          }
          if (i.customId === 'quiz_difficulty') {
            selectedDifficulty = i.values[0];
            await i.reply({ content: `Difficulty selected: **${selectedDifficulty}**`, flags: 1 << 6 });
          }
          if (selectedCategory && selectedDifficulty) {
            collector.stop();
            // Fetch a question and start the quiz as before
            const questions = questionsData[selectedCategory]?.[selectedDifficulty] || [];
            if (!questions.length) {
              await interaction.followUp({ content: 'No questions available for this category/difficulty yet.', flags: 1 << 6 });
              return;
            }
            const questionObj = getRandomQuestion(questions);
            if (!questionObj) {
              await interaction.followUp({ content: 'No questions found.', flags: 1 << 6 });
              return;
            }
            const optionKeys = ['A', 'B', 'C', 'D'];
            const optionValues = Object.values(questionObj.options);
            // Shuffle the texts
            const shuffledOptionValues = shuffleArray(optionValues);
            // Map shuffled texts to A, B, C, D
            const orderedOptions = {};
            optionKeys.forEach((key, idx) => {
              orderedOptions[key] = shuffledOptionValues[idx];
            });
            // Find the new correct answer letter
            const correctAnswerText = questionObj.options[questionObj.answer];
            const correctAnswer = optionKeys[shuffledOptionValues.indexOf(correctAnswerText)];
            // Add rules description based on difficulty
            const timeLimits = { easy: 20000, medium: 15000, hard: 15000 };
            let rules = '';
            let gambling = false;
            if (selectedDifficulty === 'easy') {
              rules = '🟢 **Easy:** 20 seconds, max 3 tries. Answer with A, B, C, or D.';
            } else if (selectedDifficulty === 'medium') {
              rules = '🟡 **Medium:** 15 seconds, max 2 tries. Answer with A, B, C, or D.';
            } else if (selectedDifficulty === 'hard') {
              rules = '🔴 **Hard:** 15 seconds, only 1 try. Answer with A, B, C, or D.\n\n**Optional:** Gamble for a chance to win or lose 5,000 coins!';
            }
            // If hard, ask if they want to gamble BEFORE showing the question
            if (selectedDifficulty === 'hard') {
              let user;
              try {
                user = await User.findById(interaction.user.id);
              } catch (err) {
                logger.error('Error finding user for quiz gamble:', err);
                await interaction.followUp({ content: 'Error loading your profile for gambling. Please try again later.', flags: 1 << 6 });
                return;
              }
              const now = Date.now();
              const lastGamble = user && user.lastQuizGamble ? new Date(user.lastQuizGamble).getTime() : 0;
              const cooldownMs = 30 * 60 * 1000;
              const canGamble = !lastGamble || (now - lastGamble >= cooldownMs);
              const hasEnoughCoins = user && user.coins >= 5000;
              let gambleRow;
              let gambleEmbed;
              if (canGamble && hasEnoughCoins) {
                gambleRow = new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId('gamble_yes')
                    .setLabel('Gamble 5,000 coins')
                    .setStyle(ButtonStyle.Danger),
                  new ButtonBuilder()
                    .setCustomId('gamble_no')
                    .setLabel('No Gamble')
                    .setStyle(ButtonStyle.Secondary)
                );
                gambleEmbed = new EmbedBuilder()
                  .setTitle('Gamble Option')
                  .setDescription('Would you like to gamble for a chance to win or lose 5,000 coins on this hard question?')
                  .setColor(0xff0000);
              } else if (!hasEnoughCoins) {
                gambleRow = new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId('gamble_no')
                    .setLabel('Continue without gambling')
                    .setStyle(ButtonStyle.Secondary)
                );
                gambleEmbed = new EmbedBuilder()
                  .setTitle('Insufficient Coins')
                  .setDescription('You need at least 5,000 coins to gamble on hard difficulty. You can still play the quiz without gambling.')
                  .setColor(0xffa500);
              } else {
                const minsLeft = Math.ceil((cooldownMs - (now - lastGamble)) / 60000);
                gambleRow = new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId('gamble_no')
                    .setLabel('Continue without gambling')
                    .setStyle(ButtonStyle.Secondary)
                );
                gambleEmbed = new EmbedBuilder()
                  .setTitle('Gambling on Cooldown')
                  .setDescription(`You must wait ${minsLeft} more minute(s) before gambling on a hard quiz again. You can still play the quiz without gambling.`)
                  .setColor(0xffa500);
              }
              try {
                await interaction.followUp({ embeds: [gambleEmbed], components: [gambleRow], ephemeral: false });
              } catch (err) {
                logger.error('Error sending gamble option embed:', err);
                return;
              }
              
              // Add clear timer message for gamble button
              await interaction.followUp({ 
                content: `⏱️ **Gamble Decision Timer:** You have 15 seconds to decide whether to gamble. This is NOT the quiz timer!`, 
                flags: 1 << 6 
              });
              
              // Wait for button interaction
              const buttonFilter = btn => btn.user.id === interaction.user.id && (btn.customId === 'gamble_yes' || btn.customId === 'gamble_no');
              try {
                const buttonInteraction = await interaction.channel.awaitMessageComponent({ filter: buttonFilter, time: 15000 });
                if (buttonInteraction.customId === 'gamble_yes') {
                  try {
                    await User.findByIdAndUpdate(interaction.user.id, { $set: { lastQuizGamble: new Date() } }, { upsert: true });
                  } catch (err) {
                    logger.error('Error setting lastQuizGamble in quiz:', err);
                  }
                  gambling = true;
                  await buttonInteraction.reply({ content: 'You chose to gamble! If you answer correctly, you win 5,000 coins. If wrong, you lose 5,000 coins.', flags: 1 << 6 });
                } else {
                  await buttonInteraction.reply({ content: 'You chose not to gamble.', flags: 1 << 6 });
                }
              } catch (err) {
                logger.warn('No response for gamble option:', err);
                await interaction.followUp({ content: 'No response for gamble option. Proceeding without gambling.', flags: 1 << 6 });
              }
            }
            // Now show the question (for all difficulties)
            let quizEmbed;
            try {
              quizEmbed = new EmbedBuilder()
                .setTitle(`Quiz: ${selectedCategory} (${selectedDifficulty.charAt(0).toUpperCase() + selectedDifficulty.slice(1)})`)
                .setDescription(rules + '\n\n**' + questionObj.question + '**\n\n' +
                  optionKeys.map(key => `**${key}.** ${orderedOptions[key]}`).join('\n'))
                .setColor(0x00bfff)
                .setFooter({ text: `${selectedDifficulty.charAt(0).toUpperCase() + selectedDifficulty.slice(1)} • Timer: ${(timeLimits[selectedDifficulty]+3000)/1000}s` });
            } catch (err) {
              logger.error('Error building quiz question embed:', err);
              await interaction.followUp({ content: 'Error building quiz question. Please try again later.', flags: 1 << 6 });
              return;
            }
            try {
              await interaction.followUp({ embeds: [quizEmbed], ephemeral: false });
            } catch (err) {
              logger.error('Error sending quiz question embed:', err);
              return;
            }
            // Add timer start message with clear countdown
            const buffer = 3000; // 3 seconds buffer
            const effectiveTimeLimit = timeLimits[selectedDifficulty] + buffer;
            await interaction.followUp({ 
              content: `⏰ **Quiz Timer Started!** You have **${effectiveTimeLimit/1000} seconds** to answer.`, 
              flags: 1 << 6 
            });
            // Answer collection logic
            let tries = 0;
            let answered = false;
            const answerFilter = m => m.author.id === interaction.user.id && ['A','B','C','D'].includes(m.content.toUpperCase());
            // Start the timer and collector only after question is sent
            const startTime = Date.now();
            const msgCollector = interaction.channel.createMessageCollector({ filter: answerFilter, time: effectiveTimeLimit });
            // Add countdown timer
            const countdownInterval = setInterval(async () => {
              const remainingTime = Math.ceil((effectiveTimeLimit - (Date.now() - startTime)) / 1000);
              if (remainingTime > 0 && remainingTime <= 10 && !answered) {
                try {
                  await interaction.followUp({ 
                    content: `⏰ **${remainingTime} seconds remaining!**`, 
                    flags: 1 << 6 
                  });
                } catch { /* ESLint: intentionally empty catch block */ }
              }
            }, 5000); // Update every 5 seconds
            
            msgCollector.on('collect', async m => {
              try {
                tries++;
                const userAnswer = m.content.toUpperCase();
                if (userAnswer === correctAnswer) {
                  answered = true;
                  msgCollector.stop('answered');
                  // Track quest progress for winning a quiz game
                  const { progressQuests } = require('../utils/utils');
                  try {
                    await progressQuests(interaction.user.id, ['quiz_win', 'quiz_game_win', 'quiz_master'], interaction);
                  } catch {
                    // ESLint: intentionally empty catch block
                  }
                  if (selectedDifficulty === 'hard' && gambling) {
                    try {
                      await User.findByIdAndUpdate(interaction.user.id, { $inc: { coins: 5000 } }, { upsert: true });
                    } catch {
                      // ESLint: intentionally empty catch block
                    }
                    await m.reply('✅ Correct! You win! You gained 5,000 coins!');
                  } else {
                    await m.reply('✅ Correct! You win!');
                  }
                } else {
                  if (selectedDifficulty === 'hard') {
                    answered = true;
                    msgCollector.stop('wrong');
                    if (gambling) {
                      try {
                        await User.findByIdAndUpdate(interaction.user.id, { $inc: { coins: -5000 } }, { upsert: true });
                      } catch (err) {
                        logger.error('Error deducting coins for quiz gamble loss:', err);
                      }
                      await m.reply('❌ **Wrong! You lost!** You lost 5,000 coins!');
                    } else {
                      await m.reply('❌ **Wrong! You lost!**');
                    }
                  } else if (selectedDifficulty === 'medium') {
                    if (tries >= 2) {
                      answered = true;
                      msgCollector.stop('wrong');
                      await m.reply('❌ **Wrong! You lost!** No more tries remaining.');
                    } else {
                      await m.reply('❌ Wrong! Try again!');
                    }
                  } else if (selectedDifficulty === 'easy') {
                    if (tries >= 3) {
                      answered = true;
                      msgCollector.stop('wrong');
                      await m.reply('❌ **Wrong! You lost!** No more tries remaining.');
                    } else {
                      await m.reply('❌ Wrong! Try again!');
                    }
                  }
                }
              } catch { /* ESLint: intentionally empty catch block */ }
            });
            msgCollector.on('end', async () => {
              try {
                // Clear the countdown interval
                clearInterval(countdownInterval);
                
                if (!answered) {
                  await interaction.followUp({ content: '⏰ Time is up! No correct answer was given.', flags: 1 << 6 });
                }
              } catch {
                // ESLint: intentionally empty catch block
              }
            });
          }
        } catch (err) {
          logger.error('Error in quiz collector collect handler:', err);
          try { await i.reply({ content: '❌ An error occurred in the quiz menu. Please try again.', flags: 1 << 6 }); } catch { /* ESLint: intentionally empty catch block */ }
        }
      });

      collector.on('end', () => {
        if (!selectedCategory || !selectedDifficulty) {
          interaction.followUp({ content: 'Quiz setup timed out.', flags: 1 << 6 });
        }
      });
    } catch (err) {
      logger.error('Unhandled error in quiz command:', err);
              try {
          await reply(interaction, { content: 'An unexpected error occurred in the quiz. Please try again later.', flags: 1 << 6 });
      } catch { /* ESLint: intentionally empty catch block */ }
    }
  }, { isUserBlacklisted, rateLimiter }),
}; 