// Formatting utilities for Discord bot
const logger = require('../logger');
const { MessageFlags } = require('discord.js');
const { secureRandomInt, secureRandomFloat, secureRandomChoice } = require('./secureRandom');

/**
 * Reply to interaction with standardized formatting
 */
async function reply(interaction, contentOrOptions, maybeOptions = {}) {
  let options;
  if (typeof contentOrOptions === 'object' && (contentOrOptions.content !== undefined || contentOrOptions.embeds !== undefined)) {
    options = { ...contentOrOptions };
  } else {
    options = { ...maybeOptions, content: contentOrOptions };
  }

  let safeContent = options.content || '';
  if (typeof safeContent !== 'string') safeContent = String(safeContent);
  if (safeContent.length > 2000) {
    logger.debug(`[Replying] Content length: ${safeContent.length}`);
    safeContent = safeContent.slice(0, 1997) + '...';
  }

  // Clean up replyOptions
  const replyOptions = {
    ...(safeContent && { content: safeContent }),
    ...(options.embeds && { embeds: options.embeds }),
    ...(options.files && { files: options.files }),
    ...(options.components && { components: options.components })
  };

  // Ephemeral handling
  if (options.ephemeral) {
    if (MessageFlags && MessageFlags.Ephemeral !== undefined) {
      replyOptions.flags = MessageFlags.Ephemeral;
    } else {
      replyOptions.ephemeral = true;
  }
  }

  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(replyOptions);
    } else {
      await interaction.editReply(replyOptions);
    }
    return true;
  } catch (error) {
    await logger.error('Error in reply():', error);
    // Fallback
    try {
      if (!interaction.replied && !interaction.deferred) {
        if (MessageFlags && MessageFlags.Ephemeral !== undefined) {
          await interaction.reply({ content: '✅ Command executed.', flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: '✅ Command executed.', ephemeral: true });
        }
      } else {
        await interaction.editReply({ content: '✅ Command executed.' });
      }
      return false;
    } catch (fallbackError) {
      await logger.error('Fallback reply also failed:', fallbackError);
      throw new Error('Reply and fallback both failed');
    }
  }
}

/**
 * Format number with options
 */
function formatNumber(num, options = {}) {
  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
    useGrouping = true
  } = options;

  if (typeof num !== 'number' || isNaN(num)) {
    return '0';
  }

  return num.toLocaleString('en-US', {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping
  });
}

/**
 * Format Kelocoins with symbol
 */
function formatKelocoins(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return '0 🪙';
  }
  
  return `${formatNumber(amount)} 🪙`;
}

/**
 * Parse duration string to milliseconds
 */
function parseDuration(str) {
  if (typeof str !== 'string') return 0;
  
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };
  
  return value * (multipliers[unit] || 0);
}

/**
 * Format milliseconds to human readable duration
 */
function formatDuration(ms) {
  if (typeof ms !== 'number' || ms < 0) return '0s';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format progress bar
 */
function formatProgressBar(progress, barLength = 10) {
  if (typeof progress === 'object' && progress.current !== undefined && progress.max !== undefined) {
    const percent = progress.max > 0 ? progress.current / progress.max : 0;
    const filled = Math.floor(percent * barLength);
    const bar = '─'.repeat(filled) + '┄'.repeat(barLength - filled);
    return `${bar} ${Math.round(percent * 100)}%`;
  } else if (typeof progress === 'number') {
    const percent = Math.max(0, Math.min(1, progress));
    const filled = Math.floor(percent * barLength);
    const bar = '─'.repeat(filled) + '┄'.repeat(barLength - filled);
    return `${bar} ${Math.round(percent * 100)}%`;
  }
  return '┄'.repeat(barLength) + ' 0%';
}

/**
 * Safe getters for object properties
 */
function safeGetNumber(obj, key, fallback = 0) {
  const value = obj?.[key];
  return typeof value === 'number' && !isNaN(value) ? value : fallback;
}

function safeGetArray(obj, key, fallback = []) {
  const value = obj?.[key];
  return Array.isArray(value) ? value : fallback;
}

function safeGetBoolean(obj, key, fallback = false) {
  const value = obj?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function safeGetString(obj, key, fallback = '') {
  const value = obj?.[key];
  return typeof value === 'string' ? value : fallback;
}

/**
 * Paginate array
 */
function paginate(arr, pageSize, page) {
  return arr.slice(page * pageSize, (page + 1) * pageSize);
}

/**
 * Random number generator
 */
const random = {
  int: (min, max) => {
    return secureRandomInt(min, max + 1);
  },
  float: (min, max) => {
    return min + secureRandomFloat() * (max - min);
  },
  choice: (arr) => {
    return secureRandomChoice(arr);
  }
};

module.exports = {
  reply,
  formatNumber,
  formatKelocoins,
  parseDuration,
  formatDuration,
  formatProgressBar,
  safeGetNumber,
  safeGetArray,
  safeGetBoolean,
  safeGetString,
  paginate,
  random
}; 