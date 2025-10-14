/**
 * Secure Random Number Generation Utility
 * Replaces Math.random() with crypto.randomInt() for security
 * Provides cryptographically secure random number generation
 */

const crypto = require('crypto');
const logger = require('../logger');

/**
 * Generate a secure random integer between min (inclusive) and max (exclusive)
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (exclusive)
 * @returns {number} Secure random integer
 */
function secureRandomInt(min, max) {
  if (typeof min !== 'number' || typeof max !== 'number') {
    throw new Error('secureRandomInt: min and max must be numbers');
  }
  if (min >= max) {
    throw new Error('secureRandomInt: min must be less than max');
  }
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new Error('secureRandomInt: min and max must be integers');
  }
  
  try {
    return crypto.randomInt(min, max);
  } catch (error) {
    logger.error('Error in secureRandomInt:', error);
    throw new Error('Failed to generate secure random integer');
  }
}

/**
 * Generate a secure random float between 0 (inclusive) and 1 (exclusive)
 * @returns {number} Secure random float
 */
function secureRandomFloat() {
  // Use a safe max value for crypto.randomInt (2^48)
  const MAX = 281474976710655;
  try {
    return crypto.randomInt(0, MAX) / MAX;
  } catch (error) {
    logger.error('Error in secureRandomFloat:', error);
    throw new Error('Failed to generate secure random float');
  }
}

/**
 * Generate a secure random boolean with given probability
 * @param {number} probability - Probability of true (0.0 to 1.0)
 * @returns {boolean} Secure random boolean
 */
function secureRandomBoolean(probability = 0.5) {
  if (typeof probability !== 'number' || probability < 0 || probability > 1) {
    throw new Error('secureRandomBoolean: probability must be a number between 0 and 1');
  }
  
  return secureRandomFloat() < probability;
}

/**
 * Generate a secure random element from an array
 * @param {Array} array - Array to choose from
 * @returns {*} Random element from array
 */
function secureRandomChoice(array) {
  if (!Array.isArray(array) || array.length === 0) {
    throw new Error('secureRandomChoice: array must be a non-empty array');
  }
  
  const index = secureRandomInt(0, array.length);
  return array[index];
}

/**
 * Generate a secure random number with normal distribution approximation
 * @param {number} mean - Mean of the distribution
 * @param {number} standardDeviation - Standard deviation
 * @returns {number} Random number with normal distribution
 */
function secureRandomNormal(mean = 0, standardDeviation = 1) {
  if (typeof mean !== 'number' || typeof standardDeviation !== 'number') {
    throw new Error('secureRandomNormal: mean and standardDeviation must be numbers');
  }
  if (standardDeviation <= 0) {
    throw new Error('secureRandomNormal: standardDeviation must be positive');
  }
  
  // Box-Muller transform for normal distribution
  const u1 = secureRandomFloat();
  const u2 = secureRandomFloat();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * standardDeviation;
}

/**
 * Generate a secure random number with weighted probability
 * @param {Array<number>} weights - Array of weights
 * @returns {number} Index of selected weight
 */
function secureRandomWeighted(weights) {
  if (!Array.isArray(weights) || weights.length === 0) {
    throw new Error('secureRandomWeighted: weights must be a non-empty array');
  }
  
  // Validate all weights are positive numbers
  for (let i = 0; i < weights.length; i++) {
    if (typeof weights[i] !== 'number' || weights[i] < 0) {
      throw new Error('secureRandomWeighted: all weights must be non-negative numbers');
    }
  }
  
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight === 0) {
    throw new Error('secureRandomWeighted: total weight must be greater than 0');
  }
  
  const randomValue = secureRandomFloat() * totalWeight;
  
  let cumulativeWeight = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulativeWeight += weights[i];
    if (randomValue <= cumulativeWeight) {
      return i;
    }
  }
  
  return weights.length - 1; // Fallback
}

/**
 * Generate a secure random string of given length
 * @param {number} length - Length of string to generate
 * @param {string} charset - Character set to use
 * @returns {string} Secure random string
 */
function secureRandomString(length = 16, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
  if (typeof length !== 'number' || length <= 0 || !Number.isInteger(length)) {
    throw new Error('secureRandomString: length must be a positive integer');
  }
  if (typeof charset !== 'string' || charset.length === 0) {
    throw new Error('secureRandomString: charset must be a non-empty string');
  }
  
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = secureRandomInt(0, charset.length);
    result += charset[randomIndex];
  }
  return result;
}

/**
 * Generate a secure random UUID v4
 * @returns {string} Secure random UUID
 */
function secureRandomUUID() {
  try {
    const bytes = crypto.randomBytes(16);
    
    // Set version (4) and variant bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    
    const hex = bytes.toString('hex');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32)
    ].join('-');
  } catch (error) {
    logger.error('Error generating UUID:', error);
    throw new Error('Failed to generate secure UUID');
  }
}

/**
 * Generate a secure random number within a range with decimal precision
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} precision - Number of decimal places
 * @returns {number} Secure random number with precision
 */
function secureRandomDecimal(min, max, precision = 2) {
  if (typeof min !== 'number' || typeof max !== 'number') {
    throw new Error('secureRandomDecimal: min and max must be numbers');
  }
  if (min >= max) {
    throw new Error('secureRandomDecimal: min must be less than max');
  }
  if (typeof precision !== 'number' || precision < 0 || !Number.isInteger(precision)) {
    throw new Error('secureRandomDecimal: precision must be a non-negative integer');
  }
  
  const multiplier = Math.pow(10, precision);
  const minInt = Math.floor(min * multiplier);
  const maxInt = Math.floor(max * multiplier);
  
  const randomInt = secureRandomInt(minInt, maxInt + 1);
  return randomInt / multiplier;
}

/**
 * Generate a secure random array of numbers
 * @param {number} length - Length of array
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {Array<number>} Array of secure random numbers
 */
function secureRandomArray(length, min, max) {
  if (typeof length !== 'number' || length <= 0 || !Number.isInteger(length)) {
    throw new Error('secureRandomArray: length must be a positive integer');
  }
  
  const result = [];
  for (let i = 0; i < length; i++) {
    result.push(secureRandomInt(min, max));
  }
  return result;
}

/**
 * Shuffle an array securely
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array (new array, original unchanged)
 */
function secureShuffle(array) {
  if (!Array.isArray(array)) {
    throw new Error('secureShuffle: input must be an array');
  }
  
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = secureRandomInt(0, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generate a secure random dice roll
 * @param {number} sides - Number of sides on the dice
 * @param {number} count - Number of dice to roll
 * @returns {Array<number>} Array of dice results
 */
function secureDiceRoll(sides = 6, count = 1) {
  if (typeof sides !== 'number' || sides <= 0 || !Number.isInteger(sides)) {
    throw new Error('secureDiceRoll: sides must be a positive integer');
  }
  if (typeof count !== 'number' || count <= 0 || !Number.isInteger(count)) {
    throw new Error('secureDiceRoll: count must be a positive integer');
  }
  
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push(secureRandomInt(1, sides + 1));
  }
  return results;
}

/**
 * Test the quality of random number generation
 * @param {number} samples - Number of samples to test
 * @returns {Object} Test results
 */
function testRandomQuality(samples = 10000) {
  const results = {
    float: { min: Infinity, max: -Infinity, average: 0 },
    int: { min: Infinity, max: -Infinity, average: 0 },
    distribution: new Array(10).fill(0)
  };
  
  let floatSum = 0;
  let intSum = 0;
  
  for (let i = 0; i < samples; i++) {
    const float = secureRandomFloat();
    const int = secureRandomInt(1, 101);
    
    results.float.min = Math.min(results.float.min, float);
    results.float.max = Math.max(results.float.max, float);
    floatSum += float;
    
    results.int.min = Math.min(results.int.min, int);
    results.int.max = Math.max(results.int.max, int);
    intSum += int;
    
    // Test distribution (0-9 buckets)
    const bucket = Math.floor(float * 10);
    results.distribution[bucket]++;
  }
  
  results.float.average = floatSum / samples;
  results.int.average = intSum / samples;
  
  return results;
}

module.exports = {
  secureRandomInt,
  secureRandomFloat,
  secureRandomBoolean,
  secureRandomChoice,
  secureRandomNormal,
  secureRandomWeighted,
  secureRandomString,
  secureRandomUUID,
  secureRandomDecimal,
  secureRandomArray,
  secureShuffle,
  secureDiceRoll,
  testRandomQuality
}; 