const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN;

if (!clientId || !token) {
  console.error('Missing required environment variables: CLIENT_ID or DISCORD_TOKEN');
  process.exit(1);
}

if (!fs.existsSync('./cogs')) {
  console.error('Cogs directory not found');
  process.exit(1);
}

const commands = [];
const commandNames = new Set();

// Load all command files
const commandFiles = fs.readdirSync(path.join(__dirname, 'cogs')).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  try {
    const commandExport = require(`./cogs/${file}`);
    
    if (Array.isArray(commandExport)) {
      // Handle array of commands (like economy.js, games.js, fishing.js)
      for (const command of commandExport) {
        if (command.data && command.execute) {
          if (commandNames.has(command.data.name)) {
            console.error(`Duplicate command name detected: ${command.data.name} in ${file}`);
            process.exit(1);
          }
          commandNames.add(command.data.name);
          commands.push(command.data.toJSON());
          console.log(`Added command: ${command.data.name} from ${file}`);
        }
      }
    } else if (commandExport.data && commandExport.execute) {
      // Handle single command
      if (commandNames.has(commandExport.data.name)) {
        console.error(`Duplicate command name detected: ${commandExport.data.name} in ${file}`);
        process.exit(1);
      }
      commandNames.add(commandExport.data.name);
      commands.push(commandExport.data.toJSON());
      console.log(`Added command: ${commandExport.data.name} from ${file}`);
    } else {
      console.warn(`Skipping ${file}: missing data or execute`);
    }
  } catch (error) {
    console.error(`Error loading ${file}:`, error.message);
    process.exit(1);
  }
}

const testEmbed = require('./cogs/testEmbed');
commands.push(testEmbed.data.toJSON());

if (commands.length === 0) {
  console.error('No valid commands found');
  process.exit(1);
}

console.log(`Found ${commands.length} commands: ${Array.from(commandNames).join(', ')}`);

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    if (guildId) {
      // Register guild commands (faster for testing)
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log(`Successfully reloaded ${commands.length} guild (/) commands.`);
    } else {
      // Register global commands
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log(`Successfully reloaded ${commands.length} global (/) commands.`);
    }
  } catch (error) {
    console.error('Error deploying commands:', error);
    process.exit(1);
  }
})(); 