// Import all handler modules
const basicHandlers = require('./basicHandlers');
const managementHandlers = require('./managementHandlers');
const automationHandlers = require('./automationHandlers');
const upgradeHandlers = require('./upgradeHandlers');
const utilityHandlers = require('./utilityHandlers');

// Export all handlers
module.exports = {
  // Basic farming operations
  ...basicHandlers,
  
  // Farm management
  ...managementHandlers,
  
  // Automation features
  ...automationHandlers,
  
  // Upgrade handlers
  ...upgradeHandlers,
  
  // Utility handlers
  ...utilityHandlers
}; 