// Main fishing handlers index - exports all handlers

const { handleFish } = require('./core');
const { handleInventory, handleSell } = require('./inventory');
const { handleRod, handleBait, handleBooster } = require('./equipment');
const { handleMarket } = require('./market');
const { handleHelp, handleLeaderboard } = require('./info');

module.exports = {
  handleFish,
  handleInventory,
  handleSell,
  handleRod,
  handleBait,
  handleBooster,
  handleMarket,
  handleHelp,
  handleLeaderboard
}; 