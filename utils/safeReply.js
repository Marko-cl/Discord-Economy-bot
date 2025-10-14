/**
 * Safe Reply Utility
 * Prevents double reply errors and handles interaction states properly
 */

const logger = require('../logger');

/**
 * Validates and logs payload before sending to Discord
 * @param {Object} payload - The payload to validate
 * @param {string} method - The method being used (reply, editReply, followUp)
 * @returns {Object} Validated payload
 */
function ensureValidPayload(payload, method = 'unknown') {
  // If embeds is present, ensure it's a non-empty array of valid objects
  if (payload.embeds) {
    payload.embeds = payload.embeds.filter(Boolean);
    if (payload.embeds.length === 0) delete payload.embeds;
  }
  
  // If content is present and empty, and no embeds, set a fallback message
  if ((!payload.embeds || payload.embeds.length === 0) && (!payload.content || payload.content === "")) {
    payload.content = "An error occurred. Please try again.";
  }
  
  // Log the payload for debugging
  logger.info(`[safeReply.js] Sending payload via ${method}:`, {
    content: payload.content,
    embeds: payload.embeds ? payload.embeds.length : 0,
    components: payload.components ? payload.components.length : 0,
    files: payload.files ? payload.files.length : 0,
    flags: payload.flags
  });
  
  return payload;
}

/**
 * Safe reply wrapper that prevents double replies
 * @param {Object} interaction - Discord interaction object
 * @param {Object} options - Reply options
 * @param {string} options.content - Message content
 * @param {Array} options.embeds - Message embeds
 * @param {boolean} options.ephemeral - Whether message is ephemeral
 * @param {Array} options.components - Message components
 * @param {Array} options.files - Message files
 * @returns {Promise<boolean>} Success status
 */
async function safeReply(interaction, options = {}) {
  try {
    // Validate and log the payload
    const validatedOptions = ensureValidPayload(options, 'reply');
    
    // Convert ephemeral to flags if present
    if (validatedOptions.ephemeral) {
      validatedOptions.flags = 1 << 6;
      delete validatedOptions.ephemeral;
    }
    
    // Check if interaction has already been replied to
    if (interaction.replied) {
      logger.warn('Attempted to reply to already replied interaction', {
        commandName: interaction.commandName,
        userId: interaction.user?.id
      });
      return false;
    }

    // Check if interaction has been deferred
    if (interaction.deferred) {
      await interaction.editReply(validatedOptions);
      return true;
    }

    // Normal reply
    await interaction.reply(validatedOptions);
    return true;
  } catch (error) {
    logger.error('Safe reply failed:', {
      error: error.message,
      code: error.code,
      commandName: interaction.commandName,
      userId: interaction.user?.id
    });
    return false;
  }
}

/**
 * Safe follow-up wrapper
 * @param {Object} interaction - Discord interaction object
 * @param {Object} options - Follow-up options
 * @returns {Promise<boolean>} Success status
 */
async function safeFollowUp(interaction, options = {}) {
  try {
    // Validate and log the payload
    const validatedOptions = ensureValidPayload(options, 'followUp');
    
    await interaction.followUp(validatedOptions);
    return true;
  } catch (error) {
    logger.error('Safe follow-up failed:', {
      error: error.message,
      code: error.code,
      commandName: interaction.commandName,
      userId: interaction.user?.id
    });
    return false;
  }
}

/**
 * Safe edit reply wrapper
 * @param {Object} interaction - Discord interaction object
 * @param {Object} options - Edit options
 * @returns {Promise<boolean>} Success status
 */
async function safeEditReply(interaction, options = {}) {
  try {
    // Validate and log the payload
    const validatedOptions = ensureValidPayload(options, 'editReply');
    
    await interaction.editReply(validatedOptions);
    return true;
  } catch (error) {
    logger.error('Safe edit reply failed:', {
      error: error.message,
      code: error.code,
      commandName: interaction.commandName,
      userId: interaction.user?.id
    });
    return false;
  }
}

/**
 * Command wrapper that prevents double replies
 * @param {Function} commandFn - Command function to wrap
 * @returns {Function} Wrapped command function
 */
function withSafeReply(commandFn) {
  return async (interaction, ...args) => {
    let hasReplied = false;
    
    // Create a safe interaction wrapper
    const safeInteraction = {
      ...interaction,
      channel: interaction.channel,
      user: interaction.user,
      guild: interaction.guild,
      client: interaction.client,
      reply: async (options) => {
        if (hasReplied) {
          logger.warn('Double reply prevented', {
            commandName: interaction.commandName,
            userId: interaction.user?.id
          });
          return;
        }
        const success = await safeReply(interaction, options);
        if (success) hasReplied = true;
        return success;
      },
      followUp: async (options) => {
        return await safeFollowUp(interaction, options);
      },
      editReply: async (options) => {
        return await safeEditReply(interaction, options);
      },
      deferReply: async (options) => {
        if (hasReplied) {
          logger.warn('Attempted to defer already replied interaction', {
            commandName: interaction.commandName,
            userId: interaction.user?.id
          });
          return;
        }
        try {
          await interaction.deferReply(options);
          hasReplied = true;
        } catch (error) {
          logger.error('Safe defer reply failed:', {
            error: error.message,
            code: error.code,
            commandName: interaction.commandName,
            userId: interaction.user?.id
          });
          throw error;
        }
      }
    };

    try {
      return await commandFn(safeInteraction, ...args);
    } catch (error) {
      // If no reply was sent yet, send an error message
      if (!hasReplied && !interaction.replied && !interaction.deferred) {
        await safeReply(interaction, {
          content: '❌ An error occurred while processing your command. Please try again.',
          flags: 1 << 6
        });
      }
      throw error;
    }
  };
}

/**
 * Check if interaction can be replied to
 * @param {Object} interaction - Discord interaction object
 * @returns {boolean} Whether interaction can be replied to
 */
function canReply(interaction) {
  return !interaction.replied && !interaction.deferred;
}

/**
 * Get appropriate reply method based on interaction state
 * @param {Object} interaction - Discord interaction object
 * @returns {string} Reply method to use ('reply', 'editReply', or 'followUp')
 */
function getReplyMethod(interaction) {
  if (interaction.replied) return 'followUp';
  if (interaction.deferred) return 'editReply';
  return 'reply';
}

module.exports = {
  safeReply,
  safeFollowUp,
  safeEditReply,
  withSafeReply,
  canReply,
  getReplyMethod,
  ensureValidPayload
}; 