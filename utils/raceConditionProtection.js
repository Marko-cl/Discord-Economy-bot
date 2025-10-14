/**
 * Race Condition Protection Utility
 * Prevents race conditions in competitive features
 */

const logger = require('../logger');

class RaceConditionProtection {
  constructor() {
    this.locks = new Map();
    this.timeouts = new Map();
    this.defaultTimeout = 30000; // 30 seconds
  }

  /**
   * Acquire a lock for a specific resource
   */
  async acquireLock(resourceId, timeout = this.defaultTimeout) {
    const lockKey = `lock:${resourceId}`;
    
    // Check if lock already exists
    if (this.locks.has(lockKey)) {
      const lock = this.locks.get(lockKey);
      const now = Date.now();
      
      // If lock is expired, remove it
      if (now > lock.expiresAt) {
        this.releaseLock(resourceId);
      } else {
        throw new Error(`Resource ${resourceId} is currently locked`);
      }
    }

    // Create new lock
    const lock = {
      resourceId,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + timeout,
      timeoutId: setTimeout(() => {
        this.releaseLock(resourceId);
      }, timeout)
    };

    this.locks.set(lockKey, lock);
    logger.debug(`Lock acquired for resource: ${resourceId}`);
    
    return lock;
  }

  /**
   * Release a lock
   */
  releaseLock(resourceId) {
    const lockKey = `lock:${resourceId}`;
    const lock = this.locks.get(lockKey);
    
    if (lock) {
      clearTimeout(lock.timeoutId);
      this.locks.delete(lockKey);
      logger.debug(`Lock released for resource: ${resourceId}`);
    }
  }

  /**
   * Execute function with resource locking
   */
  async withLock(resourceId, operation, timeout = this.defaultTimeout) {
    let lock = null;
    
    try {
      lock = await this.acquireLock(resourceId, timeout);
      const result = await operation();
      return result;
    } finally {
      if (lock) {
        this.releaseLock(resourceId);
      }
    }
  }

  /**
   * Safe economy transaction with locking
   */
  async safeEconomyTransaction(userId, operation, timeout = 10000) {
    return this.withLock(`economy:${userId}`, operation, timeout);
  }

  /**
   * Safe inventory transaction with locking
   */
  async safeInventoryTransaction(userId, operation, timeout = 10000) {
    return this.withLock(`inventory:${userId}`, operation, timeout);
  }

  /**
   * Safe trading transaction with locking
   */
  async safeTradingTransaction(userId1, userId2, operation, timeout = 15000) {
    // Sort user IDs to prevent deadlock
    const [firstUser, secondUser] = [userId1, userId2].sort();
    
    return this.withLock(`trading:${firstUser}:${secondUser}`, operation, timeout);
  }

  /**
   * Safe gambling transaction with locking
   */
  async safeGamblingTransaction(userId, operation, timeout = 10000) {
    return this.withLock(`gambling:${userId}`, operation, timeout);
  }

  /**
   * Safe guild transaction with locking
   */
  async safeGuildTransaction(guildId, operation, timeout = 15000) {
    return this.withLock(`guild:${guildId}`, operation, timeout);
  }

  /**
   * Check if resource is locked
   */
  isLocked(resourceId) {
    const lockKey = `lock:${resourceId}`;
    const lock = this.locks.get(lockKey);
    
    if (!lock) return false;
    
    const now = Date.now();
    if (now > lock.expiresAt) {
      this.releaseLock(resourceId);
      return false;
    }
    
    return true;
  }

  /**
   * Get lock information
   */
  getLockInfo(resourceId) {
    const lockKey = `lock:${resourceId}`;
    const lock = this.locks.get(lockKey);
    
    if (!lock) return null;
    
    const now = Date.now();
    if (now > lock.expiresAt) {
      this.releaseLock(resourceId);
      return null;
    }
    
    return {
      resourceId: lock.resourceId,
      acquiredAt: lock.acquiredAt,
      expiresAt: lock.expiresAt,
      remainingTime: lock.expiresAt - now
    };
  }

  /**
   * Get all active locks
   */
  getAllLocks() {
    const activeLocks = [];
    const now = Date.now();
    
    for (const lock of this.locks.values()) {
      if (now <= lock.expiresAt) {
        activeLocks.push({
          resourceId: lock.resourceId,
          acquiredAt: lock.acquiredAt,
          expiresAt: lock.expiresAt,
          remainingTime: lock.expiresAt - now
        });
      } else {
        // Clean up expired lock
        this.releaseLock(lock.resourceId);
      }
    }
    
    return activeLocks;
  }

  /**
   * Force release all locks (emergency cleanup)
   */
  forceReleaseAllLocks() {
    const lockCount = this.locks.size;
    
    for (const lock of this.locks.values()) {
      clearTimeout(lock.timeoutId);
    }
    
    this.locks.clear();
    logger.warn(`Force released ${lockCount} locks`);
  }

  /**
   * Clean up expired locks
   */
  cleanupExpiredLocks() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const lock of this.locks.values()) {
      if (now > lock.expiresAt) {
        this.releaseLock(lock.resourceId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug(`Cleaned up ${cleanedCount} expired locks`);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    this.cleanupExpiredLocks();
    
    return {
      activeLocks: this.locks.size,
      totalLocks: this.locks.size,
      defaultTimeout: this.defaultTimeout
    };
  }
}

// Create singleton instance
const raceConditionProtection = new RaceConditionProtection();

// Clean up expired locks every minute
setInterval(() => {
  raceConditionProtection.cleanupExpiredLocks();
}, 60000);

module.exports = raceConditionProtection; 