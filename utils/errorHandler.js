/**
 * Comprehensive Error Handling System
 * Centralizes error handling, logging, and recovery strategies
 */

const logger = require('../logger');

// ============================================================================
// ERROR TYPES
// ============================================================================

class BotError extends Error {
  constructor(message, code, context = {}) {
    super(message);
    this.name = 'BotError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date();
  }
}

class DatabaseError extends BotError {
  constructor(message, context = {}) {
    super(message, 'DATABASE_ERROR', context);
    this.name = 'DatabaseError';
  }
}

class DiscordAPIError extends BotError {
  constructor(message, context = {}) {
    super(message, 'DISCORD_API_ERROR', context);
    this.name = 'DiscordAPIError';
  }
}

class ValidationError extends BotError {
  constructor(message, context = {}) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }
}

class RateLimitError extends BotError {
  constructor(message, context = {}) {
    super(message, 'RATE_LIMIT_ERROR', context);
    this.name = 'RateLimitError';
  }
}

// ============================================================================
// ERROR HANDLERS
// ============================================================================

/**
 * Handle Discord API errors
 */
function handleDiscordError(error, interaction = null, context = '') {
  const errorInfo = {
    type: 'DiscordAPIError',
    message: error.message,
    code: error.code,
    status: error.status,
    method: error.method,
    url: error.url,
    context,
    userId: interaction?.user?.id,
    guildId: interaction?.guildId,
    channelId: interaction?.channelId,
    timestamp: new Date().toISOString()
  };

  logger.error('Discord API Error:', errorInfo);

  // Handle specific Discord error codes
  switch (error.code) {
    case 10008: // Unknown Message
      return { handled: true, message: 'Message not found or already deleted.' };
    case 10013: // Unknown User
      return { handled: true, message: 'User not found.' };
    case 10014: // Unknown Channel
      return { handled: true, message: 'Channel not found.' };
    case 10015: // Unknown Guild
      return { handled: true, message: 'Server not found.' };
    case 50001: // Missing Access
      return { handled: true, message: 'Missing permissions to access this resource.' };
    case 50013: // Missing Permissions
      return { handled: true, message: 'Missing required permissions.' };
    case 50035: // Invalid Form Body
      return { handled: true, message: 'Invalid request format.' };
    case 40060: // Interaction Failed
      return { handled: true, message: 'Interaction failed. Please try again.' };
    case 40062: // Unknown Interaction
      return { handled: true, message: 'Interaction expired. Please try again.' };
    case 429: // Rate Limited
      return { handled: true, message: `Rate limited. Please wait ${Math.ceil(error.retryAfter / 1000)} seconds.` };
    default:
      return { handled: false, message: 'An unexpected error occurred.' };
  }
}

/**
 * Handle database errors
 */
function handleDatabaseError(error, context = '') {
  const errorInfo = {
    type: 'DatabaseError',
    message: error.message,
    code: error.code,
    name: error.name,
    context,
    timestamp: new Date().toISOString()
  };

  logger.error('Database Error:', errorInfo);

  // Handle specific database errors
  if (error.name === 'ValidationError') {
    return { handled: true, message: 'Invalid data format.' };
  }
  
  if (error.name === 'CastError') {
    return { handled: true, message: 'Invalid data type.' };
  }
  
  if (error.code === 11000) {
    return { handled: true, message: 'Duplicate entry found.' };
  }
  
  if (error.name === 'MongoNetworkError') {
    return { handled: true, message: 'Database connection error. Please try again later.' };
  }

  if (error.name === 'MongoTimeoutError') {
    return { handled: true, message: 'Database operation timed out. Please try again.' };
  }

  return { handled: false, message: 'Database error occurred.' };
}

/**
 * Handle validation errors
 */
function handleValidationError(error, context = '') {
  const errorInfo = {
    type: 'ValidationError',
    message: error.message,
    field: error.field,
    value: error.value,
    context,
    timestamp: new Date().toISOString()
  };

  logger.warn('Validation Error:', errorInfo);

  return {
    handled: true,
    message: error.message || 'Invalid input provided.'
  };
}

/**
 * Handle rate limit errors
 */
function handleRateLimitError(error, context = '') {
  const errorInfo = {
    type: 'RateLimitError',
    message: error.message,
    retryAfter: error.retryAfter,
    context,
    timestamp: new Date().toISOString()
  };

  logger.warn('Rate Limit Error:', errorInfo);

  return {
    handled: true,
    message: `Rate limited. Please wait ${Math.ceil(error.retryAfter / 1000)} seconds.`
  };
}

// ============================================================================
// SAFE OPERATION WRAPPERS
// ============================================================================

/**
 * Safe async operation with error handling
 */
async function safeAsync(fn, fallback = null, context = '') {
  try {
    return await fn();
  } catch (error) {
    await handleError(error, context);
    return fallback;
  }
}

/**
 * Safe Discord interaction reply
 */
async function safeReply(interaction, content, options = {}) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content, ...options });
    } else {
      if (options.ephemeral) {
        options.flags = 1 << 6;
        delete options.ephemeral;
      }
      await interaction.reply({ content, ...options });
    }
    return true;
  } catch (error) {
    const result = handleDiscordError(error, interaction, 'safeReply');
    if (!result.handled) {
      logger.error('Failed to send reply:', error);
    }
    return false;
  }
}

/**
 * Safe Discord interaction follow-up
 */
async function safeFollowUp(interaction, content, options = {}) {
  try {
    await interaction.followUp({ content, ...options });
    return true;
  } catch (error) {
    const result = handleDiscordError(error, interaction, 'safeFollowUp');
    if (!result.handled) {
      logger.error('Failed to send follow-up:', error);
    }
    return false;
  }
}

/**
 * Safe database operation
 */
async function safeDatabase(fn, fallback = null, context = '') {
  try {
    return await fn();
  } catch (error) {
    const result = handleDatabaseError(error, context);
    if (!result.handled) {
      logger.error('Database operation failed:', error);
    }
    return fallback;
  }
}

// ============================================================================
// RETRY MECHANISMS
// ============================================================================

/**
 * Retry operation with exponential backoff
 */
async function withRetry(fn, maxRetries = 3, baseDelay = 1000, context = '') {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      logger.warn(`Retry ${attempt}/${maxRetries} failed for ${context}, retrying in ${delay}ms:`, error.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Retry Discord operation
 */
async function retryDiscord(fn, maxRetries = 3, context = '') {
  return withRetry(async () => {
    try {
      return await fn();
    } catch (error) {
      const result = handleDiscordError(error, null, context);
      if (result.handled && error.code !== 40060 && error.code !== 40062) {
        throw error; // Don't retry if it's a handled error that's not retryable
      }
      throw error;
    }
  }, maxRetries, 1000, context);
}

// ============================================================================
// ERROR RECOVERY
// ============================================================================

/**
 * Attempt to recover from common errors
 */
async function attemptRecovery(error, interaction = null, context = '') {
  const errorInfo = {
    type: error.name || 'UnknownError',
    message: error.message,
    context,
    userId: interaction?.user?.id,
    timestamp: new Date().toISOString()
  };

  logger.error('Attempting error recovery:', errorInfo);

  // Try to send a generic error message
  if (interaction) {
    try {
      await safeReply(interaction, 'An error occurred. Please try again later.', { flags: 1 << 6 });
    } catch (replyError) {
      logger.error('Failed to send error recovery message:', replyError);
    }
  }

  return false; // Recovery failed
}

/**
 * Main error handler
 */
async function handleError(error, context = '', interaction = null) {
  const errorInfo = {
    type: error.name || 'UnknownError',
    message: error.message,
    stack: error.stack,
    context,
    userId: interaction?.user?.id,
    guildId: interaction?.guildId,
    timestamp: new Date().toISOString()
  };

  // Log the error
  logger.error('Error occurred:', errorInfo);

  // Handle specific error types
  let result = { handled: false, message: 'An unexpected error occurred.' };

  if (error.name === 'DiscordAPIError' || error.code) {
    result = handleDiscordError(error, interaction, context);
  } else if (error.name === 'ValidationError' || error.name === 'CastError' || error.code === 11000) {
    result = handleDatabaseError(error, context);
  } else if (error.name === 'RateLimitError') {
    result = handleRateLimitError(error, context);
  }

  // Attempt recovery if not handled
  if (!result.handled) {
    await attemptRecovery(error, interaction, context);
  }

  return result;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate user input
 */
function validateInput(input, rules = {}) {
  const errors = [];

  if (rules.required && !input) {
    errors.push('This field is required.');
  }

  if (input && rules.minLength && input.length < rules.minLength) {
    errors.push(`Minimum length is ${rules.minLength} characters.`);
  }

  if (input && rules.maxLength && input.length > rules.maxLength) {
    errors.push(`Maximum length is ${rules.maxLength} characters.`);
  }

  if (input && rules.pattern && !rules.pattern.test(input)) {
    errors.push(rules.patternMessage || 'Invalid format.');
  }

  if (input && rules.type === 'number' && isNaN(Number(input))) {
    errors.push('Must be a valid number.');
  }

  if (input && rules.type === 'number' && rules.min !== undefined && Number(input) < rules.min) {
    errors.push(`Minimum value is ${rules.min}.`);
  }

  if (input && rules.type === 'number' && rules.max !== undefined && Number(input) > rules.max) {
    errors.push(`Maximum value is ${rules.max}.`);
  }

  if (errors.length > 0) {
    throw new ValidationError(errors.join(' '), { field: rules.field, value: input });
  }

  return true;
}

/**
 * Validate Discord ID
 */
function validateDiscordId(id, context = '') {
  if (!id || typeof id !== 'string' || !/^\d{17,19}$/.test(id)) {
    throw new ValidationError(`Invalid Discord ID: ${id}`, { field: context, value: id });
  }
  return true;
}

/**
 * Validate hex color
 */
function validateHexColor(color, context = '') {
  if (!color || typeof color !== 'string' || !/^#([0-9A-Fa-f]{6})$/.test(color)) {
    throw new ValidationError(`Invalid hex color: ${color}`, { field: context, value: color });
  }
  return true;
}

// ============================================================================
// MONITORING & METRICS
// ============================================================================

const errorMetrics = {
  total: 0,
  byType: new Map(),
  byContext: new Map(),
  recent: []
};

/**
 * Track error metrics
 */
function trackError(error, context = '') {
  errorMetrics.total++;
  
  const errorType = error.name || 'UnknownError';
  errorMetrics.byType.set(errorType, (errorMetrics.byType.get(errorType) || 0) + 1);
  errorMetrics.byContext.set(context, (errorMetrics.byContext.get(context) || 0) + 1);
  
  errorMetrics.recent.push({
    type: errorType,
    context,
    timestamp: new Date(),
    message: error.message
  });
  
  // Keep only last 100 errors
  if (errorMetrics.recent.length > 100) {
    errorMetrics.recent.shift();
  }
}

/**
 * Get error statistics
 */
function getErrorStats() {
  return {
    total: errorMetrics.total,
    byType: Object.fromEntries(errorMetrics.byType),
    byContext: Object.fromEntries(errorMetrics.byContext),
    recent: errorMetrics.recent.slice(-10) // Last 10 errors
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Error Classes
  BotError,
  DatabaseError,
  DiscordAPIError,
  ValidationError,
  RateLimitError,
  
  // Error Handlers
  handleError,
  handleDiscordError,
  handleDatabaseError,
  handleValidationError,
  handleRateLimitError,
  
  // Safe Operations
  safeAsync,
  safeReply,
  safeFollowUp,
  safeDatabase,
  
  // Retry Mechanisms
  withRetry,
  retryDiscord,
  
  // Recovery
  attemptRecovery,
  
  // Validation
  validateInput,
  validateDiscordId,
  validateHexColor,
  
  // Monitoring
  trackError,
  getErrorStats
}; 