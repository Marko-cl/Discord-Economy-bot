const logger = require('../logger');
const { reply } = require('./formatting');

// Rate limiting storage
const rateLimiters = new Map();

// Rate limit configuration
const RATE_LIMITS = {
  // Mining commands
  'mine': { maxRequests: 5, windowMs: 30000 }, // 5 requests per 30 seconds
  'mine_start': { maxRequests: 1, windowMs: 300000 }, // 1 request per 5 minutes
  'mine_collect': { maxRequests: 1, windowMs: 60000 }, // 1 request per minute
  'mine_upgrade': { maxRequests: 3, windowMs: 60000 }, // 3 requests per minute
  'mine_team': { maxRequests: 2, windowMs: 60000 }, // 2 requests per minute
  
  // General commands
  'daily': { maxRequests: 1, windowMs: 86400000 }, // 1 request per day
  'work': { maxRequests: 1, windowMs: 3600000 }, // 1 request per hour
  'beg': { maxRequests: 3, windowMs: 300000 }, // 3 requests per 5 minutes
  
  // Database operations
  'database_read': { maxRequests: 10, windowMs: 10000 }, // 10 requests per 10 seconds
  'database_write': { maxRequests: 5, windowMs: 10000 }, // 5 requests per 10 seconds
  
  // Default rate limit
  'default': { maxRequests: 10, windowMs: 60000 } // 10 requests per minute
};

/**
 * Check if a user is rate limited for a specific action
 * @param {string} userId - The user ID
 * @param {string} action - The action being performed
 * @returns {Object} - Rate limit status
 */
function checkRateLimit(userId, action) {
  try {
    const config = RATE_LIMITS[action] || RATE_LIMITS.default;
    const key = `${userId}:${action}`;
    const now = Date.now();
    
    if (!rateLimiters.has(key)) {
      rateLimiters.set(key, {
        requests: [],
        blocked: false,
        blockUntil: 0
      });
    }
    
    const limiter = rateLimiters.get(key);
    
    // Check if user is blocked
    if (limiter.blocked && now < limiter.blockUntil) {
      const remainingBlockTime = Math.ceil((limiter.blockUntil - now) / 1000);
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        remainingTime: remainingBlockTime,
        retryAfter: remainingBlockTime
      };
    }
    
    // Clear expired requests
    limiter.requests = limiter.requests.filter(time => now - time < config.windowMs);
    
    // Check if user has exceeded the limit
    if (limiter.requests.length >= config.maxRequests) {
      // Block user for the window duration
      limiter.blocked = true;
      limiter.blockUntil = now + config.windowMs;
      
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        remainingTime: Math.ceil(config.windowMs / 1000),
        retryAfter: Math.ceil(config.windowMs / 1000)
      };
    }
    
    // Add current request
    limiter.requests.push(now);
    
    return {
      allowed: true,
      remainingRequests: config.maxRequests - limiter.requests.length,
      resetTime: Math.ceil(config.windowMs / 1000)
    };
    
  } catch (error) {
    logger.error('Error checking rate limit:', error);
    return { allowed: true }; // Allow on error
  }
}

/**
 * Apply rate limiting to a function
 * @param {Function} fn - The function to rate limit
 * @param {string} action - The action name for rate limiting
 * @returns {Function} - Rate limited function
 */
function rateLimit(fn, action) {
  return async function(...args) {
    const interaction = args[0];
    const userId = interaction.user?.id || 'unknown';
    
    const rateLimitResult = checkRateLimit(userId, action);
    
    if (!rateLimitResult.allowed) {
      return await reply(interaction, {
        content: `⏰ Rate limit exceeded! Please wait ${rateLimitResult.remainingTime} seconds before trying again.`,
        flags: 1 << 6
      });
    }
    
    return await fn.apply(this, args);
  };
}

/**
 * Clean up expired rate limiters
 */
function cleanupRateLimiters() {
  try {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [key, limiter] of rateLimiters) {
      // Remove expired requests
      limiter.requests = limiter.requests.filter(time => now - time < 60000); // 1 minute window
      
      // Remove completely empty limiters
      if (limiter.requests.length === 0 && !limiter.blocked) {
        expiredKeys.push(key);
      }
      
      // Remove expired blocks
      if (limiter.blocked && now >= limiter.blockUntil) {
        limiter.blocked = false;
        limiter.blockUntil = 0;
      }
    }
    
    // Remove expired keys
    for (const key of expiredKeys) {
      rateLimiters.delete(key);
    }
    
    logger.debug(`Cleaned up ${expiredKeys.length} expired rate limiters`);
    
  } catch (error) {
    logger.error('Error cleaning up rate limiters:', error);
  }
}

/**
 * Get rate limit statistics for a user
 * @param {string} userId - The user ID
 * @returns {Object} - Rate limit statistics
 */
function getRateLimitStats(userId) {
  try {
    const stats = {};
    
    for (const [key, limiter] of rateLimiters) {
      if (key.startsWith(`${userId}:`)) {
        const action = key.split(':')[1];
        stats[action] = {
          requests: limiter.requests.length,
          blocked: limiter.blocked,
          blockUntil: limiter.blockUntil
        };
      }
    }
    
    return stats;
    
  } catch (error) {
    logger.error('Error getting rate limit stats:', error);
    return {};
  }
}

/**
 * Reset rate limits for a user (admin function)
 * @param {string} userId - The user ID
 * @param {string} action - The action to reset (optional)
 * @returns {boolean} - Success status
 */
function resetRateLimits(userId, action = null) {
  try {
    const keysToDelete = [];
    
    for (const key of rateLimiters.keys()) {
      if (key.startsWith(`${userId}:`)) {
        if (!action || key.endsWith(`:${action}`)) {
          keysToDelete.push(key);
        }
      }
    }
    
    for (const key of keysToDelete) {
      rateLimiters.delete(key);
    }
    
    logger.info(`Reset rate limits for user ${userId}${action ? ` action ${action}` : ''}`);
    return true;
    
  } catch (error) {
    logger.error('Error resetting rate limits:', error);
    return false;
  }
}

// Clean up rate limiters every 5 minutes
setInterval(cleanupRateLimiters, 5 * 60 * 1000);

module.exports = {
  checkRateLimit,
  rateLimit,
  getRateLimitStats,
  resetRateLimits,
  RATE_LIMITS
}; 