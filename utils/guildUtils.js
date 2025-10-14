const { Guild } = require('../database/db');
const { progressQuests } = require('./utils');
const logger = require('../logger');

function hasGuildTicket(user) {
  if (!user) return false;
  // Support both inventory array and object
  if (Array.isArray(user.inventory)) {
    return user.inventory.some(item => item.name === 'Guild Ticket' && item.amount > 0);
  }
  if (user.inventory && typeof user.inventory === 'object') {
    return user.inventory['Guild Ticket'] > 0;
  }
  return false;
}

async function awardGuildExperience(guildId, experience) {
  let guild;
  try {
    guild = await Guild.findById(guildId);
  } catch (err) {
    logger.error('DB error in awardGuildExperience Guild.findById:', err);
    return;
  }
  if (!guild) return;

  const currentLevel = guild.level || 1;
  const currentExp = guild.experience || 0;
  const expNeededForNextLevel = currentLevel * 1000; // 1000 XP per level
  
  const newExp = currentExp + experience;
  let levelUp = false;
  let newLevel = currentLevel;
  
  // Check if guild leveled up
  if (newExp >= expNeededForNextLevel) {
    newLevel = currentLevel + 1;
    levelUp = true;
  }
  try {
    await Guild.findByIdAndUpdate(guildId, {
      experience: newExp,
      level: newLevel
    });
  } catch (err) {
    logger.error('DB error in awardGuildExperience Guild.findByIdAndUpdate:', err);
    return;
  }
  progressQuests(undefined, ['guild_core'], undefined).catch(e => logger.error('progressQuests error:', e));
  return { levelUp, newLevel, newExp };
}

module.exports = { hasGuildTicket, awardGuildExperience }; 