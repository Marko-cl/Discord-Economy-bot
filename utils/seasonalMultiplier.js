// Seasonal multiplier utility for applying real-time seasonal bonuses to all commands

// Real-time seasonal system
const SEASONS = {
  SPRING: {
    name: 'Spring',
    emoji: '🌸',
    startMonth: 3, // March
    startDay: 20,
    endMonth: 6, // June
    endDay: 20,
    multiplier: 1.2, // 20% bonus
    description: 'Spring brings new life and 20% bonus rewards!',
    color: '#90EE90'
  },
  SUMMER: {
    name: 'Summer',
    emoji: '☀️',
    startMonth: 6, // June
    startDay: 21,
    endMonth: 9, // September
    endDay: 22,
    multiplier: 1.3, // 30% bonus
    description: 'Summer heat brings 30% bonus rewards!',
    color: '#FFD700'
  },
  AUTUMN: {
    name: 'Autumn',
    emoji: '🍂',
    startMonth: 9, // September
    startDay: 23,
    endMonth: 12, // December
    endDay: 20,
    multiplier: 1.25, // 25% bonus
    description: 'Autumn harvest brings 25% bonus rewards!',
    color: '#FFA500'
  },
  WINTER: {
    name: 'Winter',
    emoji: '❄️',
    startMonth: 12, // December
    startDay: 21,
    endMonth: 3, // March
    endDay: 19,
    multiplier: 1.4, // 40% bonus (highest for winter holidays)
    description: 'Winter magic brings 40% bonus rewards!',
    color: '#87CEEB'
  }
};

// Special events that override seasonal multipliers
const SPECIAL_EVENTS = {
  CHRISTMAS: {
    name: 'Christmas',
    emoji: '🎄',
    startMonth: 12,
    startDay: 24,
    endMonth: 12,
    endDay: 26,
    multiplier: 2.0, // 100% bonus
    description: 'Christmas spirit brings 100% bonus rewards!',
    color: '#FF0000',
    priority: 1
  },
  NEW_YEAR: {
    name: 'New Year',
    emoji: '🎆',
    startMonth: 12,
    startDay: 31,
    endMonth: 1,
    endDay: 2,
    multiplier: 1.8, // 80% bonus
    description: 'New Year celebration brings 80% bonus rewards!',
    color: '#FF69B4',
    priority: 1
  },
  HALLOWEEN: {
    name: 'Halloween',
    emoji: '🎃',
    startMonth: 10,
    startDay: 31,
    endMonth: 10,
    endDay: 31,
    multiplier: 1.6, // 60% bonus
    description: 'Halloween spookiness brings 60% bonus rewards!',
    color: '#FF8C00',
    priority: 1
  },
  VALENTINES: {
    name: 'Valentine\'s Day',
    emoji: '💝',
    startMonth: 2,
    startDay: 14,
    endMonth: 2,
    endDay: 14,
    multiplier: 1.5, // 50% bonus
    description: 'Valentine\'s love brings 50% bonus rewards!',
    color: '#FF69B4',
    priority: 1
  }
};

// Helper function to get current date info
function getCurrentDateInfo() {
  const now = new Date();
  const month = now.getMonth() + 1; // getMonth() returns 0-11
  const day = now.getDate();
  const year = now.getFullYear();
  
  return { month, day, year, now };
}

// Helper function to check if a date is within a range
function isDateInRange(month, day, startMonth, startDay, endMonth, endDay) {
  const currentDate = month * 100 + day;
  const startDate = startMonth * 100 + startDay;
  const endDate = endMonth * 100 + endDay;
  
  if (startDate <= endDate) {
    // Same year range (e.g., March 20 to June 20)
    return currentDate >= startDate && currentDate <= endDate;
  } else {
    // Cross-year range (e.g., December 21 to March 19)
    return currentDate >= startDate || currentDate <= endDate;
  }
}

// Get current season
function getCurrentSeason() {
  const { month, day } = getCurrentDateInfo();
  
  for (const season of Object.values(SEASONS)) {
    if (isDateInRange(month, day, season.startMonth, season.startDay, season.endMonth, season.endDay)) {
      return season;
    }
  }
  
  // Fallback to winter if no season matches
  return SEASONS.WINTER;
}

// Get current special event
function getCurrentSpecialEvent() {
  const { month, day } = getCurrentDateInfo();
  
  for (const event of Object.values(SPECIAL_EVENTS)) {
    if (isDateInRange(month, day, event.startMonth, event.startDay, event.endMonth, event.endDay)) {
      return event;
    }
  }
  
  return null;
}

// Get current multiplier (special events override seasons)
function getCurrentMultiplier() {
  const specialEvent = getCurrentSpecialEvent();
  if (specialEvent) {
    return {
      multiplier: specialEvent.multiplier,
      source: specialEvent,
      type: 'event'
    };
  }
  
  const season = getCurrentSeason();
  return {
    multiplier: season.multiplier,
    source: season,
    type: 'season'
  };
}

// Apply seasonal multiplier to rewards
function applySeasonalMultiplier(baseReward) {
  const { multiplier } = getCurrentMultiplier();
  return Math.floor(baseReward * multiplier);
}

/**
 * Format a reward with seasonal bonus info
 * @param {number} baseReward - Base reward amount
 * @param {string} commandName - Name of the command (optional)
 * @returns {string} - Formatted string showing base and boosted reward
 */
function formatSeasonalReward(baseReward) {
  const boostedReward = applySeasonalMultiplier(baseReward);
  const { multiplier, source } = getCurrentMultiplier();
  
  if (multiplier > 1) {
    const bonusPercent = Math.round((multiplier - 1) * 100);
    return `${baseReward} → **${boostedReward}** coins (${source.emoji} +${bonusPercent}%)`;
  }
  
  return `${boostedReward} coins`;
}

/**
 * Add seasonal bonus info to an embed
 * @param {EmbedBuilder} embed - The embed to modify
 * @param {number} baseReward - Base reward amount
 * @param {string} fieldName - Name of the field to add
 */
function addSeasonalBonusToEmbed(embed, baseReward, fieldName = '💰 Reward') {
  const boostedReward = applySeasonalMultiplier(baseReward);
  const { multiplier, source } = getCurrentMultiplier();
  
  if (multiplier > 1) {
    const bonusPercent = Math.round((multiplier - 1) * 100);
    embed.addFields({
      name: fieldName,
      value: `${baseReward} → **${boostedReward}** coins\n${source.emoji} Seasonal bonus: +${bonusPercent}%`,
      inline: true
    });
  } else {
    embed.addFields({
      name: fieldName,
      value: `${boostedReward} coins`,
      inline: true
    });
  }
}

// Helper function to get next season
function getNextSeason(currentSeason) {
  const seasonOrder = [SEASONS.SPRING, SEASONS.SUMMER, SEASONS.AUTUMN, SEASONS.WINTER];
  const currentIndex = seasonOrder.findIndex(season => season.name === currentSeason.name);
  const nextIndex = (currentIndex + 1) % seasonOrder.length;
  return seasonOrder[nextIndex];
}

// Helper function to calculate days until next season
function getDaysUntilNext(currentSeason, nextSeason) {
  const { now } = getCurrentDateInfo();
  const currentYear = now.getFullYear();
  
  // Calculate next season start date
  let nextSeasonDate = new Date(currentYear, nextSeason.startMonth - 1, nextSeason.startDay);
  
  // If next season is in the past, it's next year
  if (nextSeasonDate < now) {
    nextSeasonDate = new Date(currentYear + 1, nextSeason.startMonth - 1, nextSeason.startDay);
  }
  
  const diffTime = nextSeasonDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

module.exports = {
  applySeasonalMultiplier,
  getCurrentMultiplier,
  getCurrentSeason,
  getCurrentSpecialEvent,
  formatSeasonalReward,
  addSeasonalBonusToEmbed,
  getNextSeason,
  getDaysUntilNext,
  SEASONS,
  SPECIAL_EVENTS
}; 