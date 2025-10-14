// Main fishing module - imports and exports all fishing commands
const fishCommands = require('./fishing/fish');
const lbfishCommand = require('./fishing/lbfish');

// Export all fishing commands
module.exports = [
  ...fishCommands,
  ...lbfishCommand
]; 