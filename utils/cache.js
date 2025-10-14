/**
 * Enhanced Caching System with TTL and LRU Eviction
 * Provides efficient caching with automatic cleanup and performance monitoring
 */

const logger = require('../logger');

/**
 * Cache entry with metadata
 */
class CacheEntry {
  constructor(key, value, ttl = 300000) { // Default 5 minutes
    this.key = key;
    this.value = value;
    this.createdAt = Date.now();
    this.lastAccessed = Date.now();
    this.ttl = ttl;
    this.accessCount = 0;
  }

  /**
   * Check if entry is expired
   */
  isExpired() {
    return Date.now() - this.createdAt > this.ttl;
  }

  /**
   * Update access time and count
   */
  access() {
    this.lastAccessed = Date.now();
    this.accessCount++;
  }

  /**
   * Get remaining TTL in milliseconds
   */
  getRemainingTTL() {
    const elapsed = Date.now() - this.createdAt;
    return Math.max(0, this.ttl - elapsed);
  }
}

/**
 * Enhanced Cache with TTL and LRU eviction
 */
class Cache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || 300000; // 5 minutes
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute
    this.entries = new Map();
    this.accessOrder = []; // Track access order for LRU
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      size: 0
    };

    // Start cleanup interval
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);

    logger.info(`Cache initialized with maxSize: ${this.maxSize}, defaultTTL: ${this.defaultTTL}ms`);
  }

  /**
   * Set a value in cache
   */
  set(key, value, ttl = this.defaultTTL) {
    try {
      // Remove existing entry if it exists
      if (this.entries.has(key)) {
        this.delete(key);
      }

      // Check if we need to evict entries
      if (this.entries.size >= this.maxSize) {
        this.evictLRU();
      }

      // Create new entry
      const entry = new CacheEntry(key, value, ttl);
      this.entries.set(key, entry);
      this.accessOrder.push(key);
      this.stats.sets++;
      this.stats.size = this.entries.size;

      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Get a value from cache
   */
  get(key) {
    try {
      const entry = this.entries.get(key);
      
      if (!entry) {
        this.stats.misses++;
        return null;
      }

      // Check if expired
      if (entry.isExpired()) {
        this.delete(key);
        this.stats.misses++;
        return null;
      }

      // Update access metadata
      entry.access();
      this.updateAccessOrder(key);
      this.stats.hits++;

      return entry.value;
    } catch (error) {
      logger.error('Cache get error:', error);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Check if key exists and is not expired
   */
  has(key) {
    const entry = this.entries.get(key);
    if (!entry) return false;
    
    if (entry.isExpired()) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Delete a key from cache
   */
  delete(key) {
    try {
      const entry = this.entries.get(key);
      if (entry) {
        this.entries.delete(key);
        this.removeFromAccessOrder(key);
        this.stats.deletes++;
        this.stats.size = this.entries.size;
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Clear all entries
   */
  clear() {
    try {
      this.entries.clear();
      this.accessOrder = [];
      this.stats.size = 0;
      logger.info('Cache cleared');
    } catch (error) {
      logger.error('Cache clear error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 ? 
      this.stats.hits / (this.stats.hits + this.stats.misses) : 0;

    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100),
      size: this.entries.size,
      maxSize: this.maxSize,
      utilization: Math.round((this.entries.size / this.maxSize) * 100)
    };
  }

  /**
   * Get cache entries info
   */
  getEntriesInfo() {
    const info = [];
    for (const [key, entry] of this.entries.entries()) {
      info.push({
        key,
        createdAt: entry.createdAt,
        lastAccessed: entry.lastAccessed,
        accessCount: entry.accessCount,
        remainingTTL: entry.getRemainingTTL(),
        isExpired: entry.isExpired()
      });
    }
    return info;
  }

  /**
   * Update access order for LRU
   */
  updateAccessOrder(key) {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Remove key from access order
   */
  removeFromAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Evict least recently used entry
   */
  evictLRU() {
    if (this.accessOrder.length === 0) return;

    const keyToEvict = this.accessOrder[0];
    this.delete(keyToEvict);
    this.stats.evictions++;
    
    logger.debug(`LRU eviction: ${keyToEvict}`);
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    try {
      let cleanedCount = 0;

      for (const [key, entry] of this.entries.entries()) {
        if (entry.isExpired()) {
          this.entries.delete(key);
          this.removeFromAccessOrder(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        this.stats.size = this.entries.size;
        logger.debug(`Cache cleanup: removed ${cleanedCount} expired entries`);
      }
    } catch (error) {
      logger.error('Cache cleanup error:', error);
    }
  }

  /**
   * Destroy cache and cleanup timer
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
    logger.info('Cache destroyed');
  }
}

/**
 * User-specific cache with enhanced features
 */
class UserCache extends Cache {
  constructor(options = {}) {
    super({
      maxSize: options.maxSize || 500,
      defaultTTL: options.defaultTTL || 300000, // 5 minutes
      ...options
    });
  }

  /**
   * Get user data with automatic refresh
   */
  async getUser(userId, fetchFunction, ttl = this.defaultTTL) {
    const cacheKey = `user:${userId}`;
    
    // Try to get from cache first
    let userData = this.get(cacheKey);
    
    if (userData) {
      return userData;
    }

    // Fetch from database if not in cache
    try {
      userData = await fetchFunction(userId);
      
      if (userData) {
        this.set(cacheKey, userData, ttl);
      }
      
      return userData;
    } catch (error) {
      logger.error('Error fetching user data:', error);
      return null;
    }
  }

  /**
   * Invalidate user cache
   */
  invalidateUser(userId) {
    const cacheKey = `user:${userId}`;
    return this.delete(cacheKey);
  }

  /**
   * Batch invalidate multiple users
   */
  invalidateUsers(userIds) {
    let invalidatedCount = 0;
    for (const userId of userIds) {
      if (this.invalidateUser(userId)) {
        invalidatedCount++;
      }
    }
    return invalidatedCount;
  }
}

/**
 * Command-specific cache
 */
class CommandCache extends Cache {
  constructor(options = {}) {
    super({
      maxSize: options.maxSize || 200,
      defaultTTL: options.defaultTTL || 60000, // 1 minute
      ...options
    });
  }

  /**
   * Cache command result
   */
  cacheCommand(commandName, userId, result, ttl = this.defaultTTL) {
    const cacheKey = `command:${commandName}:${userId}`;
    return this.set(cacheKey, result, ttl);
  }

  /**
   * Get cached command result
   */
  getCommandResult(commandName, userId) {
    const cacheKey = `command:${commandName}:${userId}`;
    return this.get(cacheKey);
  }

  /**
   * Invalidate command cache for user
   */
  invalidateCommand(commandName, userId) {
    const cacheKey = `command:${commandName}:${userId}`;
    return this.delete(cacheKey);
  }
}

// Create global cache instances
const userCache = new UserCache();
const commandCache = new CommandCache();
const generalCache = new Cache({ maxSize: 1000, defaultTTL: 300000 });

// Rate limiting storage
const rateLimiters = new Map();

// Legacy compatibility functions
const userCacheTimestamps = new Map();

function clearUserCache(userId) {
  userCache.invalidateUser(userId);
  userCacheTimestamps.delete(userId);
}

// Export cache instances and utilities
module.exports = {
  Cache,
  UserCache,
  CommandCache,
  userCache,
  commandCache,
  generalCache,
  rateLimiters,
  userCacheTimestamps,
  clearUserCache
}; 