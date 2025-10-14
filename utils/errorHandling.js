// Error handling utilities for Discord bot
const logger = require('../logger');
const { constants } = require('./constants');
const { reply } = require('./formatting');

/**
 * Standardized error response for commands
 */
async function handleCommandError(error, interaction, context = '') {
  const errorInfo = {
    type: error.name || 'UnknownError',
    message: error.message,
    context,
    userId: interaction?.user?.id,
    commandName: interaction?.commandName,
    timestamp: new Date().toISOString()
  };

  // Log the error
  logError(error, context, interaction?.user?.id);

  // Determine user-friendly message
  let userMessage = 'An error occurred while processing your request.';
  
  if (error.name === 'ValidationError') {
    userMessage = 'Invalid input provided. Please check your command parameters.';
  } else if (error.name === 'DatabaseError' || error.code === 11000) {
    userMessage = 'Database error occurred. Please try again later.';
  } else if (error.code && [10008, 10013, 10014, 10015].includes(error.code)) {
    userMessage = 'Resource not found. Please try again.';
  } else if (error.code && [50001, 50013].includes(error.code)) {
    userMessage = 'Missing permissions to perform this action.';
  } else if (error.code === 40060 || error.code === 40062) {
    userMessage = 'Interaction expired. Please try the command again.';
  }

  // Send error message to user
  try {
    if (!interaction.replied && !interaction.deferred) {
      await reply(interaction, { content: userMessage, flags: 1 << 6 });
    } else {
      await interaction.followUp({ content: userMessage, flags: 1 << 6 });
    }
  } catch (replyError) {
    logger.error('Failed to send error message to user:', replyError);
  }

  return errorInfo;
}

/**
 * Standardized database operation with error handling
 */
async function safeDatabaseOperation(operation, interaction, context = '') {
  try {
    return await operation();
  } catch (error) {
    await handleCommandError(error, interaction, `Database operation failed: ${context}`);
    return null;
  }
}

/**
 * Standardized Discord API operation with error handling
 */
async function safeDiscordOperation(operation, interaction, context = '') {
  try {
    return await operation();
  } catch (error) {
    await handleCommandError(error, interaction, `Discord API operation failed: ${context}`);
    return null;
  }
}

/**
 * Standardized validation with error handling
 */
function safeValidation(validationFn, interaction, context = '') {
  try {
    return validationFn();
  } catch (error) {
    handleCommandError(error, interaction, `Validation failed: ${context}`);
    return false;
  }
}

/**
 * Retry mechanism with exponential backoff
 */
async function withRetry(fn, retries = constants.MAX_RETRIES, delay = constants.RETRY_DELAY) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
}

/**
 * Safe async function execution with fallback
 */
async function safeAsync(fn, fallback = null, context = '') {
  try {
    return await fn();
  } catch (error) {
    logger.error(`Error in ${context}:`, error);
    return fallback;
  }
}

/**
 * Log error with context
 */
function logError(error, context = '', userId = null) {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    context,
    userId,
    timestamp: new Date().toISOString()
  };

  if (error.code) {
    errorInfo.code = error.code;
  }

  logger.error('Application error:', errorInfo);
}

module.exports = {
  handleCommandError,
  safeDatabaseOperation,
  safeDiscordOperation,
  safeValidation,
  withRetry,
  safeAsync,
  logError
}; 