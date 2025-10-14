require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes, Events, ActivityType, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const { User, ShopItem, createIndexes } = require('./database/db');
const logger = require('./logger');
const { getUserPartyMultiplierInfo, progressQuests, formatKelocoins } = require('./utils/utils');
const { reply } = require('./utils/formatting');
const { SHOP_PRICES } = require('./config/constants');
const { GlobalState } = require('./database/globalState');
const { checkRateLimit } = require('./utils/rateLimiting');

// Initialize global error boundary
const errorBoundary = require('./utils/errorBoundary');
errorBoundary.initialize();

// Import leaderboard service
const { initializeLeaderboardService } = require('./utils/leaderboardService');

// Import shopAdmin logic
const { exec } = require('child_process');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

client.commands = new Collection();

// Validate critical environment variables
const requiredEnv = ['DISCORD_TOKEN', 'CLIENT_ID', 'MONGODB_URI'];
for (const envVar of requiredEnv) {
  if (!process.env[envVar]) {
    process.exit(1);
  }
}

// Only run ESLint in development
if (process.env.NODE_ENV === 'development') {
  (async () => { await runESLintCheck(); })();
}

// Load slash commands from cogs
const commandFiles = fs.readdirSync('./cogs').filter(file => file.endsWith('.js'));
const commands = [];
const commandNames = new Set();
for (const file of commandFiles) {
  const commandExport = require(`./cogs/${file}`);
  if (Array.isArray(commandExport)) {
    for (const command of commandExport) {
      if (command.data && command.execute) {
        if (commandNames.has(command.data.name)) {
          logger.critical(`[STARTUP] Duplicate command name detected: ${command.data.name}. Exiting.`);
          process.exit(1);
        }
        commandNames.add(command.data.name);
        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
      }
    }
  } else if (commandExport.data && commandExport.execute) {
    if (commandNames.has(commandExport.data.name)) {
      logger.critical(`[STARTUP] Duplicate command name detected: ${commandExport.data.name}. Exiting.`);
      process.exit(1);
    }
    commandNames.add(commandExport.data.name);
    client.commands.set(commandExport.data.name, commandExport);
    commands.push(commandExport.data.toJSON());
  }
}
if (commands.length === 0) {
  logger.critical('[STARTUP] No commands loaded. Exiting.');
  process.exit(1);
}
logger.info(`Loaded ${commands.length} commands. Registering slash commands...`);
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    if (process.env.GUILD_ID) {
      logger.info('GUILD_ID from .env:', process.env.GUILD_ID);
      logger.info('About to register GUILD commands for', process.env.GUILD_ID);
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      ).then(() => {
        logger.info('✅ Slash commands registered successfully');
      }).catch(logger.error);
      logger.info('Registered guild slash commands.');
    } else {
      logger.info('About to register GLOBAL commands');
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      ).then(() => {
        logger.info('✅ Slash commands registered successfully');
      }).catch(logger.error);
      logger.info('Registered global slash commands.');
    }
  } catch (error) {
    logger.error('Error registering slash commands:', error);
  }
})();

// On startup, load global event state
async function loadGlobalState() {
  const event = await GlobalState.findOne({ key: 'partyEvent' });
  if (event && event.value) {
    global.partyEventEnd = event.value.partyEventEnd;
    global.partyEventMultiplier = event.value.partyEventMultiplier;
  }
}

// Run shopAdmin.js at startup to clean up unwanted items and update shop
exec('node shop/shopAdmin.js', (error, stdout) => {
  if (error) {
    logger.error(`Error running shopAdmin.js: ${error}`);
    return;
  }
  if (stdout) logger.info(`shopAdmin output: ${stdout}`);
});

// ESLint check function
function runESLintCheck() {
  return new Promise((resolve) => {
    exec('npx eslint . --ext .js --format=stylish', (error, stdout) => {
      // Find the summary line (e.g., '✖ 55 problems (55 errors, 0 warnings)')
      const summaryLine = stdout.split('\n').reverse().find(line => line.trim().startsWith('✖'));
      let errorCount = 0;
      if (summaryLine) {
        const match = summaryLine.match(/\((\d+) errors?/);
        if (match) {
          errorCount = parseInt(match[1], 10);
        }
      }
      global.eslintErrorCount = errorCount;
      if (errorCount > 0) {
        logger.warn(`🔍 ESLint check completed: ${errorCount} error(s) found`);
        logger.warn('ESLint errors found. Consider fixing them for better code quality.');
        resolve(errorCount);
      } else {
        logger.info('✅ ESLint check completed: 0 errors found');
        resolve(0);
      }
    });
  });
}

// Connect to MongoDB ONCE, then update shop prices
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    logger.info('Connected to MongoDB successfully');
    
    // Create database indexes for better performance
    try {
      await createIndexes();
      logger.info('Database indexes created/verified successfully');
    } catch (error) {
      logger.error('Error creating database indexes:', error);
    }
    
    await loadGlobalState();
    
    // Run ESLint check on startup
    await runESLintCheck();
    
    // Auto-update shop prices on bot startup
    try {
      for (const [name, price] of Object.entries(SHOP_PRICES)) {
        await ShopItem.findOneAndUpdate(
          { name },
          { $set: { price } },
          { new: true }
        );
      }
      logger.info('Shop prices synced with constants.js');
    } catch (e) {
      logger.error('Error updating shop prices on startup:', e);
    }
    
    // Clean up unwanted user fields
    try {
      const result = await User.updateMany(
        {},
        {
          $unset: {
            profileBanner: "",
            nicknameToken: ""
          }
        }
      );
      if (result.modifiedCount > 0) {
        logger.info(`Cleaned up ${result.modifiedCount} user documents - removed profileBanner and nicknameToken fields`);
      }
    } catch (e) {
      logger.error('Error cleaning up user fields:', e);
    }
    
    // Start performance monitoring
    logger.info('Performance monitoring initialized');
    
    // Initialize permanent leaderboard service
    initializeLeaderboardService();
  })
  .catch(err => logger.error('MongoDB connection error:', err));

// Bot ready event
client.once(Events.ClientReady, async () => {
  logger.info(`Bot started successfully as ${client.user.tag}`);
  logger.info(`Bot is in ${client.guilds.cache.size} guilds`);
  // Run ESLint check on startup to get the actual error count
  await runESLintCheck();
  logger.info(`🔍 Current ESLint errors: ${global.eslintErrorCount}`);
  
  // Set bot status to "KELONOMY" using modern Discord.js v14 method
  client.user.setPresence({
    activities: [{ name: 'KELONOMY', type: ActivityType.Playing }],
    status: 'online'
  });
  logger.info('🎮 Bot status set to: Playing KELONOMY');
  
  // Guild payout system - moved to economy folder
  // const guildPayoutSystem = require('./economy/guildPayoutSystem');
  // guildPayoutSystem.start();
  // logger.info('💰 Guild business payout system started');
});

// Per-command cooldowns (in ms)
const cooldownMap = {
  'beg': 60000, // 1m
  'work': 60000, // 1m
  'slots': 60000, // 1m
  'rob': 300000, // 5m
  'quest': 3600000, // 1h
  'fish': 3000, // 3s - reduced from 10s
  'duel': 60000, // 1m
  'heist': 600000, // 10m
  'daily': 3600000, // 1h (but handled in command)
  'gift': 10000, // 10s
  'trade': 10000, // 10s
  'bet': 10000, // 10s
  'farm': 1000, // 1s cooldown for all /farm subcommands - reduced from 2s
  // Add more as needed
};
// Commands with their own in-memory cooldowns (handled in their files):
const selfCooldownCommands = ['rob', 'quest', 'fish', 'duel', 'heist', 'mine'];

// Cooldown map: { userId: { commandName: lastUsedTimestamp } }
const cooldowns = new Map();

// Global rate limiter: 10 commands per 10 seconds per user
const globalRateLimiter = (userId) => checkRateLimit(userId, 'global', 10, 10000);

// --- Modular event handlers for clarity ---

/**
 * Handles XP system for eligible commands
 */
async function handleXpSystem(interaction) {
  const excludedCommands = ['leaderboard', 'inventory', 'profile', 'help', 'xp', 'level'];
  if (!excludedCommands.includes(interaction.commandName)) {
    try {
      // Always fetch the latest XP and level from the DB
      let user = await User.findById(interaction.user.id);
      if (!user) user = await User.create({ _id: interaction.user.id });
      let baseXp = 10;
      let now = new Date();
      let boosterActive = user.xpBooster && new Date(user.xpBooster) > now;
      let gainedXp = boosterActive ? baseXp * 2 : baseXp;
      let xp = (user.xp || 0) + gainedXp;
      let level = user.level || 0;
      let levelUps = [];
      // Loop: subtract XP needed for next level, increment level, until not enough XP
      while (true) {
        let xpNeeded = 1000 + 250 * level;
        if (xp >= xpNeeded) {
          xp -= xpNeeded;
          level++;
          levelUps.push(level);
        } else {
          break;
        }
      }
      // Store carryover XP and current level
              await User.findByIdAndUpdate(interaction.user.id, { $set: { xp, level } });
      for (const lvl of levelUps) {
        try {
          await interaction.channel.send({ content: `<@${interaction.user.id}> leveled up! They are now level ${lvl}!` });
        } catch (e) {
          logger.warn('Failed to send level up message:', e);
        }
      }
    } catch (e) {
      logger.error('XP system error:', e);
    }
  }
}

/**
 * Handles cooldowns for commands
 */
function handleCooldown(interaction, cooldowns, cooldownMap, selfCooldownCommands) {
  const userId = interaction.user.id;
  const commandName = interaction.commandName;
  const now = Date.now();
  const isOwner = userId === require('./utils/utils').constants.OWNER_ID;
  
  // Don't apply cooldown if this interaction was rate limited
  if (interaction._rateLimited) {
    return true;
  }
  
  if (!global.ownerCooldownImmune || !isOwner) {
    if (!['ping', 'daily'].includes(commandName) && !selfCooldownCommands.includes(commandName)) {
      let cooldownTime = cooldownMap[commandName] || 10000;
      if (!cooldowns.has(userId)) cooldowns.set(userId, {});
      const userCooldowns = cooldowns.get(userId);
      if (userCooldowns[commandName] && now - userCooldowns[commandName] < cooldownTime) {
        const secondsLeft = Math.ceil((cooldownTime - (now - userCooldowns[commandName])) / 1000);
        const minutes = Math.floor(secondsLeft / 60);
        const seconds = secondsLeft % 60;
        reply(interaction, { content: `⏳ Please wait ${minutes > 0 ? minutes + 'm ' : ''}${seconds}s before using "/${commandName}" again.`, flags: 1 << 6 });
        return false;
      }
      userCooldowns[commandName] = now;
      cooldowns.set(userId, userCooldowns);
    }
  }
  return true;
}

/**
 * Main interaction handler
 */
async function handleInteraction(interaction, client, cooldowns, cooldownMap, selfCooldownCommands) {
  const startTime = Date.now();

  // IMMEDIATELY defer reply for all commands to prevent interaction timeout
  // Only skip for autocomplete and special commands that handle their own replies
  if (interaction.isAutocomplete()) {
    // Handle autocomplete separately
  } else if (interaction.isChatInputCommand() && !['ping', 'eslint'].includes(interaction.commandName)) {
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Failed to defer reply:', error);
      return; // Exit if we can't defer
    }
  }

  // 1. Global rate limit check (ALWAYS FIRST)
  if (!interaction.user?.bot) {
    if (!globalRateLimiter(interaction.user.id)) {
      interaction._rateLimited = true;
      try {
        if (interaction.deferred) {
          await interaction.editReply({ content: '⏳ You are sending commands too quickly. Please slow down.', flags: 1 << 6 });
        } else {
        await reply(interaction, { content: '⏳ You are sending commands too quickly. Please slow down.', flags: 1 << 6 });
        }
      } catch (error) {
        logger.warn('Failed to send rate limit message:', error);
      }
      return;
    }
  }

  // 2. Per-command rateLimiter check (if present, BEFORE anything else)
  const command = client.commands.get(interaction.commandName);
  if (command && command.rateLimiter) {
    if (!command.rateLimiter(interaction.user.id)) {
      interaction._rateLimited = true;
      try {
        if (interaction.deferred) {
          await interaction.editReply({ content: '⏳ You are using this command too frequently. Please wait a moment.', flags: 1 << 6 });
        } else {
        await reply(interaction, { content: '⏳ You are using this command too frequently. Please wait a moment.', flags: 1 << 6 });
        }
      } catch (error) {
        logger.warn('Failed to send per-command rate limit message:', error);
      }
      return;
    }
  }

  // 3. Handle autocomplete interactions
  if (interaction.isAutocomplete()) {
    if (!command || !command.autocomplete) return;
    try {
      await command.autocomplete(interaction);
    } catch (error) {
      logger.error('Error in autocomplete:', error);
      await interaction.respond([]);
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;

  // 4. Special commands (ping, eslint)
  if (interaction.commandName === 'ping') {
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply({ content: `🏓 Pong! Latency is ${latency}ms.` });
    return;
  }
  if (interaction.commandName === 'eslint') {
    const OWNER_ID = require('./utils/utils').constants.OWNER_ID;
    if (interaction.user.id !== OWNER_ID) {
      await reply(interaction, { content: '❌ Only the bot owner can use this command.', flags: 1 << 6 });
      return;
    }
    await interaction.deferReply({ flags: 1 << 6 });
    const errorCount = await runESLintCheck();
    await interaction.editReply({ 
      content: `🔍 ESLint check completed!\n\n**Results:** ${errorCount} error(s) found\n\n${errorCount === 0 ? '✅ Code is clean!' : '⚠️ Consider fixing the errors for better code quality.'}` 
    });
    return;
  }

  logger.command(interaction.user.id, interaction.commandName, 'started');
  await handleXpSystem(interaction);
  if (!command) {
    logger.warn(`Command not found: ${interaction.commandName} by ${interaction.user.id}`);
    return;
  }

  // 5. Cooldown check (AFTER rate limiter, BEFORE execution)
  let cooldownBlocked = false;
  const now = Date.now();
  const userId = interaction.user.id;
  const commandName = interaction.commandName;
  let cooldownTime = cooldownMap[commandName] || 10000;
  if (!cooldowns.has(userId)) cooldowns.set(userId, {});
  const userCooldowns = cooldowns.get(userId);
  if (!['ping', 'daily'].includes(commandName) && !selfCooldownCommands.includes(commandName)) {
    if (userCooldowns[commandName] && now - userCooldowns[commandName] < cooldownTime) {
      const secondsLeft = Math.ceil((cooldownTime - (now - userCooldowns[commandName])) / 1000);
      const minutes = Math.floor(secondsLeft / 60);
      const seconds = secondsLeft % 60;
      try {
        if (interaction.deferred) {
          await interaction.editReply({ content: `⏳ Please wait ${minutes > 0 ? minutes + 'm ' : ''}${seconds}s before using "/${commandName}" again.`, flags: 1 << 6 });
        } else {
        await reply(interaction, { content: `⏳ Please wait ${minutes > 0 ? minutes + 'm ' : ''}${seconds}s before using "/${commandName}" again.`, flags: 1 << 6 });
        }
      } catch (error) {
        logger.warn('Failed to send cooldown message:', error);
      }
      cooldownBlocked = true;
    }
  }
  if (cooldownBlocked) return;

  // 6. Execute command
  let commandErrored = false;
  try {
    await command.execute(interaction, client);
    const duration = Date.now() - startTime;
    logger.command(interaction.user.id, interaction.commandName, 'success', duration);
  } catch (error) {
    commandErrored = true;
    const duration = Date.now() - startTime;
    logger.errorWithContext(error, `Command execution failed: ${interaction.commandName}`);
    logger.command(interaction.user.id, interaction.commandName, 'error', duration);
    if (error.code === 429 || error.code === 40060 || error.code === 40062) {
      interaction._rateLimited = true;
      logger.warn(`Discord rate limit/interaction error for ${interaction.commandName}: ${error.code}`);
    }
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: 'There was an error executing this command.', flags: 1 << 6 });
      } else if (!interaction.replied) {
        await reply(interaction, { content: 'There was an error executing this command.', flags: 1 << 6 });
      } else {
        await interaction.followUp({ content: 'There was an error executing this command.', flags: 1 << 6 });
      }
    } catch (replyError) {
      logger.errorWithContext(replyError, `Failed to send error message for ${interaction.commandName}`);
    }
  }

  // 7. Only set cooldown if not rate limited and command did not error out before execution
  if (!interaction._rateLimited && !commandErrored) {
    userCooldowns[commandName] = now;
    cooldowns.set(userId, userCooldowns);
  }
}

client.on(Events.InteractionCreate, async interaction => {
  await handleInteraction(interaction, client, cooldowns, cooldownMap, selfCooldownCommands);
});

// Auto Collector: background job to auto-claim dailies for users with active autoCollector
setInterval(async () => {
  const start = Date.now();
  try {
    const now = Date.now();
    // Find all users with active autoCollector
    const users = await User.find({ autoCollector: { $gt: new Date() } });
    for (const user of users) {
      let last = user.last_daily ? Number(user.last_daily) : 0;
      if (!user.last_daily || now - last >= 86400000) {
        // 24h passed since last daily, auto-claim
        const { multiplier, hasEventPass } = getUserPartyMultiplierInfo(user);
        let coins = 100 * multiplier;
        await User.findByIdAndUpdate(user._id, { $inc: { coins }, last_daily: now });
        // Progress daily quest
        await progressQuests(user._id, ['daily']);
        // DM the user when auto collector claims daily
        const discordUser = await client.users.fetch(user._id).catch(() => null);
        if (discordUser) {
          discordUser.send(`🤖 Your Auto Collector claimed your daily: ${formatKelocoins(coins)}!${multiplier > 1 ? ` (${multiplier}x event!${hasEventPass ? ' Event Pass active' : ''})` : ''}`);
        }
      }
    }
    logger.performance('AutoCollectorJob', Date.now() - start, `Processed ${users.length} users`);
  } catch (e) {
    logger.errorWithContext(e, 'Auto Collector error');
    logger.performance('AutoCollectorJob (ERROR)', Date.now() - start);
  }
}, 10 * 60 * 1000); // every 10 minute

// Passive Pet Collection: background job to collect coins from pet bots every hour
setInterval(async () => {
  const start = Date.now();
  try {
    const now = new Date();
    // Find all users with pet bots
    const users = await User.find({ 'petBot.level': { $exists: true, $gte: 1 } });
    let collectedCount = 0;
    
    for (const user of users) {
      try {
        const lastCollection = user.petBot.lastCollection ? new Date(user.petBot.lastCollection) : null;
        
        // Check if enough time has passed (1 hour)
        if (!lastCollection || (now - lastCollection) >= 3600000) {
          const { processPetCollection } = require('./utils/utils');
          const result = await processPetCollection(user._id);
          
          if (result && result.success) {
            collectedCount++;
            // Do NOT DM the user. Only /pet collect should notify.
            // Optionally, you could log or track the collection here.
          }
        }
      } catch (userError) {
        logger.errorWithContext(userError, `Pet collection error for user ${user._id}`);
      }
    }
    logger.performance('PetCollectionJob', Date.now() - start, `Collected from ${collectedCount} pets`);
  } catch (e) {
    logger.errorWithContext(e, 'Pet collection job error');
    logger.performance('PetCollectionJob (ERROR)', Date.now() - start);
  }
}, 60 * 60 * 1000); // every hour

// Weekly Leaderboard Reward Distribution: check for ended leaderboards and distribute rewards
setInterval(async () => {
  const start = Date.now();
  try {
    const { LeaderboardConfig } = require('./database/db');
    const { formatKelocoins } = require('./utils/utils');
    
    // Find active leaderboard configs
    const configs = await LeaderboardConfig.find();
    
    for (const config of configs) {
      const now = new Date();
      const startTime = new Date(config.startTime);
      const endTime = new Date(startTime.getTime() + (7 * 24 * 60 * 60 * 1000)); // 1 week
      
      // Check if leaderboard has ended
      if (now > endTime) {
        try {
          // Get all users and sort by the metric
          const allUsers = await User.find();
          let sortedUsers;
          
          switch (config.metric) {
            case 'coins':
              sortedUsers = allUsers
                .map(user => ({
                  ...user.toObject(),
                  totalCoins: (user.coins || 0) + (user.bank || 0)
                }))
                .sort((a, b) => b.totalCoins - a.totalCoins);
              break;
            case 'xp':
              sortedUsers = allUsers
                .sort((a, b) => (b.xp || 0) - (a.xp || 0));
              break;
            case 'multiplier':
              sortedUsers = allUsers
                .sort((a, b) => (b.prestigeLevel || 1) - (a.prestigeLevel || 1));
              break;
            default:
              continue;
          }
          
          // Get top 3 winners
          const winners = sortedUsers.slice(0, 3);
          const rewards = [config.rewards.first, config.rewards.second, config.rewards.third];
          
          // Distribute rewards
          for (let i = 0; i < winners.length; i++) {
            const winner = winners[i];
            const reward = rewards[i];
            
            if (reward > 0) {
              await User.findByIdAndUpdate(winner._id, { $inc: { coins: reward } });
              
              // DM the winner
              const discordUser = await client.users.fetch(winner._id).catch(() => null);
              if (discordUser) {
                const rank = i + 1;
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
                discordUser.send(`🏆 **Weekly Leaderboard Results!**\n\n${medal} You placed **${rank}${rank === 1 ? 'st' : rank === 2 ? 'nd' : 'rd'}** in the ${config.metric} leaderboard!\n💰 Reward: ${formatKelocoins(reward)} coins\n\nCongratulations!`).catch(() => {
                  // Silently fail if we can't DM the user
                });
              }
            }
          }
          
          // Send announcement to configured channel
          if (config.announceChannel) {
            try {
              const channel = await client.channels.fetch(config.announceChannel);
              if (channel) {
                const metricNames = { coins: 'Coins', xp: 'XP', multiplier: 'Multiplier' };
                const embed = new EmbedBuilder()
                  .setTitle('🏆 Weekly Leaderboard Results!')
                  .setDescription(`The ${metricNames[config.metric]} leaderboard has ended!`)
                  .setColor(0xffd700)
                  .setTimestamp();
                
                for (let i = 0; i < winners.length; i++) {
                  const winner = winners[i];
                  const reward = rewards[i];
                  const rank = i + 1;
                  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
                  
                  let value;
                  switch (config.metric) {
                    case 'coins':
                      value = `${(winner.coins || 0) + (winner.bank || 0)} coins`;
                      break;
                    case 'xp':
                      value = `${winner.xp || 0} XP`;
                      break;
                    case 'multiplier':
                      value = `Level ${winner.prestigeLevel || 1}`;
                      break;
                  }
                  
                  embed.addFields({
                    name: `${medal} ${winner.username || 'Unknown User'}`,
                    value: `${value} - ${formatKelocoins(reward)} coins`,
                    inline: false
                  });
                }
                
                await channel.send({ embeds: [embed] });
              }
            } catch (channelError) {
              logger.error('Failed to send leaderboard results to channel:', channelError);
            }
          }
          
          // Delete the config since it's completed
          await LeaderboardConfig.findByIdAndDelete(config._id);
          
          logger.info(`Weekly leaderboard ended: ${config.metric}, winners: ${winners.map(w => w.username).join(', ')}`);
          
        } catch (configError) {
          logger.error('Error processing ended leaderboard config:', configError);
        }
      }
    }
    
    logger.performance('WeeklyLeaderboardJob', Date.now() - start, `Processed ${configs.length} configs`);
  } catch (e) {
    logger.errorWithContext(e, 'Weekly leaderboard job error');
    logger.performance('WeeklyLeaderboardJob (ERROR)', Date.now() - start);
  }
}, 30 * 60 * 1000); // every 30 minutes

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

module.exports = {
  client,
  GlobalState,
  handleCooldown,
};

// Initialize auto-farming system
const { initializeAutoFarming, setClient } = require('./cogs/farm/autoFarm');
setClient(client);
initializeAutoFarming().catch(error => {
  console.error('Failed to initialize auto-farming:', error);
});

// Initialize auto daily collector system
const { initializeAutoDailyCollector } = require('./autoDailyCollector');
initializeAutoDailyCollector().catch(error => {
  console.error('Failed to initialize auto daily collector:', error);
});

// Global unhandled rejection handler
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', reason);
});