/**
 * Enhanced Input Validation System
 * Comprehensive validation for all user inputs with detailed error messages
 */

const logger = require('../logger');
const { reply } = require('./formatting');

/**
 * Validation error class
 */
class ValidationError extends Error {
  constructor(message, field = '', value = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Core validation functions
 */
const validators = {
  /**
   * Validate Discord user ID
   */
  userId: (value) => {
    if (!value) return false;
    const str = String(value);
    return /^\d{17,19}$/.test(str);
  },

  /**
   * Validate Discord guild ID
   */
  guildId: (value) => {
    if (!value) return false;
    const str = String(value);
    return /^\d{17,19}$/.test(str);
  },

  /**
   * Validate Discord channel ID
   */
  channelId: (value) => {
    if (!value) return false;
    const str = String(value);
    return /^\d{17,19}$/.test(str);
  },

  /**
   * Validate positive integer
   */
  positiveInteger: (value) => {
    const num = parseInt(value);
    return !isNaN(num) && num > 0 && Number.isInteger(num);
  },

  /**
   * Validate non-negative integer
   */
  nonNegativeInteger: (value) => {
    const num = parseInt(value);
    return !isNaN(num) && num >= 0 && Number.isInteger(num);
  },

  /**
   * Validate positive number
   */
  positiveNumber: (value) => {
    const num = parseFloat(value);
    return !isNaN(num) && num > 0;
  },

  /**
   * Validate non-negative number
   */
  nonNegativeNumber: (value) => {
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0;
  },

  /**
   * Validate string length
   */
  stringLength: (value, min = 0, max = Infinity) => {
    if (typeof value !== 'string') return false;
    return value.length >= min && value.length <= max;
  },

  /**
   * Validate email format
   */
  email: (value) => {
    if (!value) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(String(value));
  },

  /**
   * Validate URL format
   */
  url: (value) => {
    if (!value) return false;
    try {
      new URL(String(value));
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Validate hex color
   */
  hexColor: (value) => {
    if (!value) return false;
    const hexRegex = /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    return hexRegex.test(String(value));
  },

  /**
   * Validate enum value
   */
  enum: (value, allowedValues) => {
    if (!Array.isArray(allowedValues)) return false;
    return allowedValues.includes(value);
  },

  /**
   * Validate date
   */
  date: (value) => {
    if (!value) return false;
    const date = new Date(value);
    return !isNaN(date.getTime());
  },

  /**
   * Validate future date
   */
  futureDate: (value) => {
    if (!value) return false;
    const date = new Date(value);
    return !isNaN(date.getTime()) && date > new Date();
  },

  /**
   * Validate past date
   */
  pastDate: (value) => {
    if (!value) return false;
    const date = new Date(value);
    return !isNaN(date.getTime()) && date < new Date();
  },

  /**
   * Validate array
   */
  array: (value) => {
    return Array.isArray(value);
  },

  /**
   * Validate object
   */
  object: (value) => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  },

  /**
   * Validate boolean
   */
  boolean: (value) => {
    return typeof value === 'boolean';
  },

  /**
   * Validate alphanumeric string
   */
  alphanumeric: (value) => {
    if (!value) return false;
    return /^[a-zA-Z0-9]+$/.test(String(value));
  },

  /**
   * Validate username format
   */
  username: (value) => {
    if (!value) return false;
    const str = String(value);
    return /^[a-zA-Z0-9_]{3,32}$/.test(str);
  },

  /**
   * Validate guild name
   */
  guildName: (value) => {
    if (!value) return false;
    const str = String(value);
    return str.length >= 2 && str.length <= 100;
  },

  /**
   * Validate item name
   */
  itemName: (value) => {
    if (!value) return false;
    const str = String(value);
    return str.length >= 1 && str.length <= 50;
  },

  /**
   * Validate amount for economy operations
   */
  economyAmount: (value) => {
    const num = parseInt(value);
    return !isNaN(num) && num > 0 && num <= 999999999;
  },

  /**
   * Validate percentage (0-100)
   */
  percentage: (value) => {
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0 && num <= 100;
  },

  /**
   * Validate cooldown time in seconds
   */
  cooldownTime: (value) => {
    const num = parseInt(value);
    return !isNaN(num) && num >= 0 && num <= 86400; // Max 24 hours
  }
};

/**
 * Validation schemas for common operations
 */
const schemas = {
  user: {
    userId: { validator: validators.userId, required: true },
    username: { validator: validators.username, required: false },
    coins: { validator: validators.nonNegativeNumber, required: false },
    xp: { validator: validators.nonNegativeNumber, required: false },
    level: { validator: validators.nonNegativeInteger, required: false }
  },

  guild: {
    guildId: { validator: validators.guildId, required: true },
    name: { validator: validators.guildName, required: true },
    description: { validator: (v) => validators.stringLength(v, 0, 500), required: false }
  },

  economy: {
    amount: { validator: validators.economyAmount, required: true },
    userId: { validator: validators.userId, required: true },
    reason: { validator: (v) => validators.stringLength(v, 0, 200), required: false }
  },

  fishing: {
    rodLevel: { validator: validators.positiveInteger, required: true },
    bait: { validator: validators.stringLength, required: false },
    booster: { validator: validators.stringLength, required: false }
  },

  farm: {
    plotIndex: { validator: (v) => validators.nonNegativeInteger(v) && v < 10, required: true },
    seedName: { validator: validators.itemName, required: true },
    amount: { validator: validators.positiveInteger, required: false }
  },

  shop: {
    itemName: { validator: validators.itemName, required: true },
    price: { validator: validators.positiveNumber, required: true },
    category: { validator: validators.stringLength, required: false }
  }
};

/**
 * Validate object against schema
 */
function validateSchema(data, schema) {
  const errors = [];
  const result = {};

  for (const [field, config] of Object.entries(schema)) {
    const value = data[field];
    
    // Check if required field is missing
    if (config.required && (value === undefined || value === null || value === '')) {
      errors.push(new ValidationError(`${field} is required`, field, value));
      continue;
    }

    // Skip validation for optional fields that are not provided
    if (!config.required && (value === undefined || value === null || value === '')) {
      continue;
    }

    // Validate the value
    let isValid;
    if (typeof config.validator === 'function') {
      isValid = config.validator(value);
    } else if (typeof config.validator === 'string' && validators[config.validator]) {
      isValid = validators[config.validator](value);
    } else {
      isValid = true; // No validator specified
    }

    if (!isValid) {
      errors.push(new ValidationError(
        config.message || `Invalid value for ${field}`,
        field,
        value
      ));
    } else {
      result[field] = value;
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(
      `Validation failed: ${errors.map(e => e.message).join(', ')}`,
      'schema',
      errors
    );
  }

  return result;
}

/**
 * Sanitize user input
 */
function sanitizeInput(input, type = 'string') {
  if (input === null || input === undefined) {
    return input;
  }

  const str = String(input);

  switch (type) {
    case 'string':
      return str
        .replace(/<[^>]*>/g, '') // Remove all HTML tags
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+=/gi, '') // Remove event handlers
        .replace(/alert\(/gi, '') // Remove alert calls
        .trim();
    
    case 'number': {
      const num = parseFloat(str);
      return isNaN(num) ? null : num;
    }
    
    case 'integer': {
      const int = parseInt(str);
      return isNaN(int) ? null : int;
    }
    
    case 'boolean':
      if (str.toLowerCase() === 'true' || str === '1') return true;
      if (str.toLowerCase() === 'false' || str === '0') return false;
      return null;
    
    case 'userId':
      return validators.userId(str) ? str : null;
    
    case 'guildId':
      return validators.guildId(str) ? str : null;
    
    case 'channelId':
      return validators.channelId(str) ? str : null;
    
    case 'email':
      return validators.email(str) ? str.toLowerCase() : null;
    
    case 'url':
      return validators.url(str) ? str : null;
    
    case 'hexColor':
      return validators.hexColor(str) ? str : null;
    
    default:
      return str
        .replace(/<[^>]*>/g, '') // Remove all HTML tags
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+=/gi, '') // Remove event handlers
        .replace(/alert\(/gi, '') // Remove alert calls
        .trim();
  }
}

/**
 * Validate and sanitize Discord interaction options
 */
function validateInteractionOptions(interaction, schema) {
  const data = {};
  
  for (const [field, config] of Object.entries(schema)) {
    const option = interaction.options.get(field);
    
    if (config.required && !option) {
      throw new ValidationError(`${field} is required`, field);
    }
    
    if (option) {
      let value = option.value;
      
      // Sanitize based on type
      if (config.sanitize) {
        value = sanitizeInput(value, config.sanitize);
      }
      
      // Validate
      if (config.validator && !config.validator(value)) {
        throw new ValidationError(
          config.message || `Invalid value for ${field}`,
          field,
          value
        );
      }
      
      data[field] = value;
    }
  }
  
  return data;
}

/**
 * Create validation middleware for commands
 */
function createValidationMiddleware(schema) {
  return (interaction) => {
    try {
      const validatedData = validateInteractionOptions(interaction, schema);
      return { success: true, data: validatedData };
    } catch (error) {
      if (error instanceof ValidationError) {
        logger.warn('Validation error:', {
          userId: interaction.user?.id,
          commandName: interaction.commandName,
          field: error.field,
          value: error.value,
          message: error.message
        });
        
        return {
          success: false,
          error: error.message,
          field: error.field
        };
      }
      throw error;
    }
  };
}

/**
 * Log validation errors
 */
function logValidationError(error, context = '') {
  logger.warn('Validation Error:', {
    type: error.name,
    message: error.message,
    field: error.field,
    value: error.value,
    context,
    timestamp: error.timestamp
  });
}

/**
 * Validates user input for common patterns
 * @param {Object} input - The input to validate
 * @param {Object} schema - The validation schema
 * @returns {Object} - Validation result
 */
function validateInput(input, schema) {
  const errors = [];
  
  for (const [field, rules] of Object.entries(schema)) {
    const value = input[field];
    
    // Required field check
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      continue;
    }
    
    // Skip further validation if value is not provided and not required
    if (value === undefined || value === null) continue;
    
    // Type check
    if (rules.type && typeof value !== rules.type) {
      errors.push(`${field} must be of type ${rules.type}`);
    }
    
    // String length check
    if (rules.type === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} characters long`);
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${field} must be no more than ${rules.maxLength} characters long`);
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(`${field} format is invalid`);
      }
    }
    
    // Number range check
    if (rules.type === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        errors.push(`${field} must be at least ${rules.min}`);
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push(`${field} must be no more than ${rules.max}`);
      }
    }
    
    // Array check
    if (rules.type === 'array') {
      if (!Array.isArray(value)) {
        errors.push(`${field} must be an array`);
      } else {
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${field} must have at least ${rules.minLength} items`);
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`${field} must have no more than ${rules.maxLength} items`);
        }
      }
    }
    
    // Custom validation
    if (rules.validate && typeof rules.validate === 'function') {
      try {
        const validationResult = rules.validate(value);
        if (validationResult !== true) {
          errors.push(validationResult || `${field} validation failed`);
        }
      } catch (validationError) {
        logger.error(`Custom validation error for ${field}:`, validationError);
        errors.push(`${field} validation failed`);
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

/**
 * Common validation schemas
 */
const VALIDATION_SCHEMAS = {
  userId: {
    userId: {
      type: 'string',
      required: true,
      pattern: /^\d{17,19}$/,
      validate: (value) => {
        if (!/^\d{17,19}$/.test(value)) {
          return 'User ID must be a valid Discord user ID';
        }
        return true;
      }
    }
  },
  
  miningAction: {
    action: {
      type: 'string',
      required: true,
      validate: (value) => {
        const validActions = ['mine', 'start', 'collect', 'upgrade', 'team', 'stats', 'xp'];
        if (!validActions.includes(value)) {
          return `Action must be one of: ${validActions.join(', ')}`;
        }
        return true;
      }
    }
  },
  
  upgradePurchase: {
    upgradeType: {
      type: 'string',
      required: true,
      validate: (value) => {
        const validUpgrades = [
          'mining_speed', 'ore_yield', 'rare_chance', 'depth_access',
          'tool_efficiency', 'experience_boost', 'luck_enhancement',
          'crystal_affinity', 'legendary_sense', 'auto_collection'
        ];
        if (!validUpgrades.includes(value)) {
          return `Upgrade type must be one of: ${validUpgrades.join(', ')}`;
        }
        return true;
      }
    }
  },
  
  teamAction: {
    action: {
      type: 'string',
      required: true,
      validate: (value) => {
        const validActions = ['view', 'start', 'join', 'leave', 'status', 'end'];
        if (!validActions.includes(value)) {
          return `Team action must be one of: ${validActions.join(', ')}`;
        }
        return true;
      }
    },
    teamId: {
      type: 'string',
      required: false,
      pattern: /^team_\d+_\d+$/
    }
  }
};

/**
 * Validate and sanitize Discord interaction options
 * @param {Object} interaction - Discord interaction object
 * @param {Object} schema - Validation schema
 * @returns {Object} - Validation result with sanitized data
 */
function validateInteraction(interaction, schema) {
  const input = {};
  
  // Extract options from interaction
  for (const [field] of Object.entries(schema)) {
    const option = interaction.options.getString(field) || 
                  interaction.options.getInteger(field) ||
                  interaction.options.getBoolean(field);
    
    if (option !== null) {
      input[field] = typeof option === 'string' ? sanitizeInput(option) : option;
    }
  }
  
  const validation = validateInput(input, schema);
  
  return {
    ...validation,
    data: input
  };
}

/**
 * Wraps a function with input validation
 * @param {Function} fn - The function to wrap
 * @param {Object} schema - The validation schema
 * @returns {Function} - Wrapped function with validation
 */
function withValidation(fn, schema) {
  return async function(...args) {
    const interaction = args[0];
    
    if (interaction && interaction.options) {
      const validation = validateInteraction(interaction, schema);
      
      if (!validation.isValid) {
        return await reply(interaction, {
          content: `❌ Validation error: ${validation.errors.join(', ')}`,
          flags: 1 << 6
        });
      }
      
      // Replace the first argument with validated data
      args[0] = { ...interaction, validatedData: validation.data };
    }
    
    return await fn.apply(this, args);
  };
}

module.exports = {
  ValidationError,
  validators,
  schemas,
  validateSchema,
  sanitizeInput,
  validateInteractionOptions,
  createValidationMiddleware,
  logValidationError,
  validateInput,
  validateInteraction,
  withValidation,
  VALIDATION_SCHEMAS
}; 