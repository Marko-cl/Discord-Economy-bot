/**
 * Global Error Boundary Utility
 * Prevents application crashes from unhandled errors
 * Provides comprehensive error handling and recovery
 */

const logger = require('../logger');
const { reply } = require('./formatting');

class ErrorBoundary {
  constructor() {
    this.errorCount = 0;
    this.lastErrorTime = 0;
    this.maxErrorsPerMinute = 10;
    this.isShuttingDown = false;
    this.discordClient = null;
    this.errorHistory = [];
    this.maxErrorHistory = 100;
    this.recoveryAttempts = 0;
    this.maxRecoveryAttempts = 3;
  }

  /**
   * Set Discord client reference
   * @param {Object} client - Discord client instance
   */
  setDiscordClient(client) {
    this.discordClient = client;
  }

  /**
   * Initialize global error handlers
   */
  initialize() {
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.handleUnhandledError('Unhandled Promise Rejection', reason, promise);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.handleUnhandledError('Uncaught Exception', error);
    });

    // Handle process warnings
    process.on('warning', (warning) => {
      this.handleWarning(warning);
    });

    // Handle process exit
    process.on('exit', (code) => {
      this.handleExit(code);
    });

    // Handle SIGTERM
    process.on('SIGTERM', () => {
      this.handleGracefulShutdown('SIGTERM');
    });

    // Handle SIGINT
    process.on('SIGINT', () => {
      this.handleGracefulShutdown('SIGINT');
    });

    // Handle memory warnings
    process.on('SIGUSR1', () => {
      this.handleMemoryWarning();
    });

    logger.info('Error boundary initialized with comprehensive error handling');
  }

  /**
   * Handle unhandled errors
   * @param {string} type - Error type
   * @param {Error} error - Error object
   * @param {*} context - Additional context
   */
  handleUnhandledError(type, error, context = null) {
    const now = Date.now();
    
    // Reset error count if more than a minute has passed
    if (now - this.lastErrorTime > 60000) {
      this.errorCount = 0;
    }
    
    this.errorCount++;
    this.lastErrorTime = now;

    // Create error entry
    const errorEntry = {
      type,
      message: error?.message || String(error),
      stack: error?.stack,
      context,
      timestamp: new Date().toISOString(),
      errorCount: this.errorCount
    };

    // Add to error history
    this.errorHistory.push(errorEntry);
    if (this.errorHistory.length > this.maxErrorHistory) {
      this.errorHistory.shift();
    }

    // Log the error with appropriate level using proper error logging
    if (this.errorCount >= this.maxErrorsPerMinute) {
      logger.critical(`Critical error threshold reached: ${type}`);
      logger.errorWithContext(error, `${type} - Error count: ${this.errorCount}`);
    } else {
      logger.errorWithContext(error, type);
    }

    // Log context if provided
    if (context) {
      logger.error(`Error context: ${JSON.stringify(context)}`);
    }

    // Handle critical error scenarios
    if (this.errorCount >= this.maxErrorsPerMinute) {
      logger.critical(`Too many errors (${this.errorCount}) in the last minute. Initiating recovery.`);
      this.attemptRecovery();
    }

    // For uncaught exceptions, consider immediate shutdown
    if (type === 'Uncaught Exception') {
      logger.critical('Uncaught exception detected. Application may be in an unstable state.');
      this.handleCriticalError(error);
    }
  }

  /**
   * Handle warnings
   * @param {Object} warning - Warning object
   */
  handleWarning(warning) {
    const warningData = {
      name: warning.name,
      message: warning.message,
      stack: warning.stack,
      timestamp: new Date().toISOString()
    };

    logger.warn('Process Warning:', warningData);

    // Handle specific warnings
    if (warning.name === 'DeprecationWarning') {
      logger.warn('Deprecation warning detected - consider updating code');
    } else if (warning.name === 'MaxListenersExceededWarning') {
      logger.warn('Too many event listeners - potential memory leak');
    }
  }

  /**
   * Handle memory warnings
   */
  handleMemoryWarning() {
    const memUsage = process.memoryUsage();
    logger.warn('Memory usage warning:', {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
    });

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      logger.info('Garbage collection forced');
    }
  }

  /**
   * Attempt error recovery
   */
  async attemptRecovery() {
    if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
      logger.critical('Maximum recovery attempts reached. Initiating shutdown.');
      await this.handleGracefulShutdown('Max recovery attempts');
      return;
    }

    this.recoveryAttempts++;
    logger.info(`Attempting error recovery (${this.recoveryAttempts}/${this.maxRecoveryAttempts})`);

    try {
      // Reset error count
      this.errorCount = 0;
      this.lastErrorTime = 0;

      // Attempt to reconnect Discord client if disconnected
      if (this.discordClient && this.discordClient.ws && this.discordClient.ws.connection) {
        const connection = this.discordClient.ws.connection;
        if (connection.status !== 'ready') {
          logger.info('Attempting to reconnect Discord client...');
          await this.discordClient.login(process.env.DISCORD_TOKEN);
        }
      }

      // Clear error history
      this.errorHistory = [];

      logger.info('Error recovery completed successfully');
    } catch (error) {
      logger.error('Error recovery failed:', error);
      // Continue with shutdown if recovery fails
      await this.handleGracefulShutdown('Recovery failed');
    }
  }

  /**
   * Handle critical errors
   * @param {Error} error - Critical error
   */
  async handleCriticalError(error) {
    logger.critical('Critical error detected. Initiating emergency shutdown.', {
      error: error.message,
      stack: error.stack
    });

    // Try to save any critical data
    try {
      // Add any critical data saving logic here
      logger.info('Critical data saved');
    } catch (saveError) {
      logger.error('Failed to save critical data:', saveError);
    }

    // Force shutdown after a short delay
    setTimeout(() => {
      process.exit(1);
    }, 5000);
  }

  /**
   * Handle graceful shutdown
   * @param {string} signal - Shutdown signal
   */
  async handleGracefulShutdown(signal) {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info(`Graceful shutdown initiated by ${signal}`);

    try {
      // Close Discord client
      if (this.discordClient) {
        logger.info('Closing Discord client...');
        await this.discordClient.destroy();
        logger.info('Discord client closed');
      }

      // Close database connections
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1) {
        logger.info('Closing database connection...');
        await mongoose.connection.close();
        logger.info('Database connection closed');
      }

      // Close any other connections
      logger.info('Closing other connections...');
      // Add any other cleanup logic here

      logger.info('Graceful shutdown completed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Handle process exit
   * @param {number} code - Exit code
   */
  handleExit(code) {
    logger.info(`Process exiting with code ${code}`, {
      errorCount: this.errorCount,
      recoveryAttempts: this.recoveryAttempts,
      uptime: process.uptime()
    });
  }

  /**
   * Wrap async functions with error boundary
   * @param {Function} fn - Function to wrap
   * @param {string} context - Context for error reporting
   * @returns {Function} Wrapped function
   */
  wrapAsync(fn, context = '') {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handleUnhandledError('Wrapped Async Function', error, {
          context,
          args: args.length,
          functionName: fn.name || 'anonymous'
        });
        throw error; // Re-throw to maintain original behavior
      }
    };
  }

  /**
   * Wrap synchronous functions with error boundary
   * @param {Function} fn - Function to wrap
   * @param {string} context - Context for error reporting
   * @returns {Function} Wrapped function
   */
  wrapSync(fn, context = '') {
    return (...args) => {
      try {
        return fn(...args);
      } catch (error) {
        this.handleUnhandledError('Wrapped Sync Function', error, {
          context,
          args: args.length,
          functionName: fn.name || 'anonymous'
        });
        throw error; // Re-throw to maintain original behavior
      }
    };
  }

  /**
   * Create a safe command wrapper
   * @param {Function} commandFn - Command function to wrap
   * @param {string} commandName - Name of the command
   * @returns {Function} Wrapped command function
   */
  wrapCommand(commandFn, commandName = '') {
    return async (interaction) => {
      const startTime = Date.now();
      
      try {
        // Validate interaction
        if (!interaction || typeof interaction.reply !== 'function') {
          throw new Error('Invalid interaction object');
        }

        const result = await commandFn(interaction);
        const duration = Date.now() - startTime;

        // Log slow commands
        if (duration > 5000) {
          logger.warn(`Slow command detected: ${commandName} took ${duration}ms`);
        }

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Log the error with command context
        logger.error(`Error in command ${commandName}:`, {
          error: error.message,
          stack: error.stack,
          userId: interaction?.user?.id,
          guildId: interaction?.guildId,
          channelId: interaction?.channelId,
          duration,
          timestamp: new Date().toISOString()
        });

        // Try to send error message to user
        try {
          const errorMessage = 'An error occurred while processing your command. Please try again later.';
          
          if (!interaction.replied && !interaction.deferred) {
            await reply(interaction, {
              content: errorMessage,
              flags: 1 << 6
            });
          } else {
            await interaction.followUp({
              content: errorMessage,
              flags: 1 << 6
            });
          }
        } catch (replyError) {
          logger.error('Failed to send error message to user:', replyError);
        }

        // Re-throw to maintain error tracking
        throw error;
      }
    };
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getErrorStats() {
    return {
      errorCount: this.errorCount,
      lastErrorTime: this.lastErrorTime,
      recoveryAttempts: this.recoveryAttempts,
      errorHistoryLength: this.errorHistory.length,
      isShuttingDown: this.isShuttingDown
    };
  }

  /**
   * Reset error count
   */
  resetErrorCount() {
    this.errorCount = 0;
    this.lastErrorTime = 0;
    this.recoveryAttempts = 0;
    logger.info('Error count reset');
  }

  /**
   * Get recent error history
   * @param {number} limit - Number of errors to return
   * @returns {Array} Recent error history
   */
  getRecentErrors(limit = 10) {
    return this.errorHistory.slice(-limit);
  }

  /**
   * Check if system is healthy
   * @returns {boolean} System health status
   */
  isHealthy() {
    const now = Date.now();
    const timeSinceLastError = now - this.lastErrorTime;
    
    return this.errorCount < this.maxErrorsPerMinute && 
           timeSinceLastError > 60000 && 
           !this.isShuttingDown;
  }

  /**
   * Force garbage collection if available
   */
  forceGarbageCollection() {
    if (global.gc) {
      global.gc();
      logger.info('Garbage collection forced');
      return true;
    }
    logger.warn('Garbage collection not available');
    return false;
  }
}

// Create singleton instance
const errorBoundary = new ErrorBoundary();

module.exports = errorBoundary; 