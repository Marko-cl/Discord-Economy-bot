// Main games module - imports and exports all game commands
const gamblingCommands = require('./games/gambling');
const combatCommands = require('./games/combat');
const activityCommands = require('./games/activities');
const adminCommands = require('./games/admin');

// Export all game commands
module.exports = [
  ...gamblingCommands,
  ...combatCommands,
  ...activityCommands,
  ...adminCommands
];