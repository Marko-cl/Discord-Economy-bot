// Command handler for Discord bot
const logger = require('../logger');
const { handleCommandError } = require('./errorHandling');
const { reply } = require('./formatting');

/**
 * Command handler wrapper with error handling and rate limiting
 */
function commandHandler(fn, {
  rateLimiter = () => true, // Disabled for now
  isUserBlacklisted = () => false,
  deferReply = true
} = {}) {
  return async (interaction) => {
    const userId = interaction.user.id;
    const commandName = interaction.commandName || 'unknown';

    // === LOGGING FOR TEST ===
    // console.log(`[commandHandler] Called for command: ${commandName} by user: ${userId}`);
    
    try {
      // Check blacklist
      if (isUserBlacklisted(userId)) {
        try {
          await reply(interaction, { 
            content: 'You are blacklisted from using this command.', 
            flags: 1 << 6 
          });
        } catch (error) {
          logger.error('Failed to send blacklist message:', error);
        }
        return;
      }

      // Rate limiting
      if (!rateLimiter(userId)) {
        // Mark this interaction as rate limited to prevent cooldown application
        interaction._rateLimited = true;
        try {
          await reply(interaction, { 
            content: 'You are using this command too frequently. Please wait a moment.', 
            flags: 1 << 6 
          });
        } catch (error) {
          logger.error('Failed to send rate limit message:', error);
        }
        return;
      }

      // Defer reply if requested (but let commands handle this by default)
      if (deferReply && !interaction.replied && !interaction.deferred) {
        try {
          await interaction.deferReply({ flags: 1 << 6 });
        } catch (error) {
          logger.error('Failed to defer reply:', error);
          return;
        }
      }

      // Execute command with error handling
      try {
        await fn(interaction);
      } catch (error) {
        logger.error(`Error in command ${commandName}:`, error);
        
        // Check if this is a Discord rate limit error (429) or interaction failed error
        if (error.code === 429 || error.code === 40060 || error.code === 40062) {
          // Mark interaction as rate limited to prevent cooldown application
          interaction._rateLimited = true;
          logger.warn(`Discord rate limit/interaction error in commandHandler for ${commandName}: ${error.code}`);
        }
        
        await handleCommandError(error, interaction, commandName);
      }
    } catch (outerError) {
      logger.error(`Outer error in commandHandler for ${commandName}:`, outerError);
      
      // Check if this is a Discord rate limit error
      if (outerError.code === 429 || outerError.code === 40060 || outerError.code === 40062) {
        // Mark interaction as rate limited to prevent cooldown application
        interaction._rateLimited = true;
        logger.warn(`Discord rate limit/interaction error in outer catch for ${commandName}: ${outerError.code}`);
      }
    }
  };
}

module.exports = {
  commandHandler
}; 