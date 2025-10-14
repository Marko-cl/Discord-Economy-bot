# Fishing Handlers - Modular Structure

This directory contains the modularized fishing command handlers, split by functionality for better organization and maintainability.

## Structure

```
handlers/
├── index.js          # Main export file - exports all handlers
├── core.js           # Core fishing logic (handleFish)
├── inventory.js      # Inventory management (handleInventory, handleSell)
├── equipment.js      # Equipment management (handleRod, handleBait, handleBooster)
├── market.js         # Market and trading (handleMarket)
├── info.js           # Information and help (handleHelp, handleLeaderboard)
└── README.md         # This documentation file
```

## Module Descriptions

### `core.js`
Contains the main fishing logic and the `handleFish` function. This is the most complex module as it handles:
- Cooldown management
- Booster and bait expiration checks
- Fishing result processing
- Collection and tier reward calculations
- Response embed creation

### `inventory.js`
Handles fish inventory management:
- `handleInventory` - Displays user's fish collection with progress bars
- `handleSell` - Sells all fish and calculates total value

### `equipment.js`
Manages fishing equipment:
- `handleRod` - Rod information and upgrades
- `handleBait` - Bait activation and management
- `handleBooster` - Booster activation and management

### `market.js`
Handles market-related functionality:
- `handleMarket` - Displays current fish prices

### `info.js`
Provides information and help:
- `handleHelp` - Shows available fishing commands
- `handleLeaderboard` - Displays fishing leaderboard

## Usage

The main `handlers.js` file now serves as a compatibility layer, importing and re-exporting all handlers from the modular structure. This ensures that existing code continues to work without changes.

```javascript
// Old way (still works)
const { handleFish, handleInventory } = require('./handlers');

// New way (direct module access)
const { handleFish } = require('./handlers/core');
const { handleInventory } = require('./handlers/inventory');
```

## Benefits

1. **Better Organization**: Related functionality is grouped together
2. **Easier Maintenance**: Smaller files are easier to understand and modify
3. **Improved Readability**: Each module has a clear, single responsibility
4. **Better Testing**: Individual modules can be tested in isolation
5. **Reduced Complexity**: Large functions are broken down into smaller, focused functions

## Dependencies

Each module imports only what it needs:
- `core.js` - Imports database, constants, logic, rewards, and equipment modules
- `inventory.js` - Imports database, constants, and rewards
- `equipment.js` - Imports database, constants, and utils
- `market.js` - Imports constants and rewards
- `info.js` - Imports database and constants

## Future Improvements

- Consider extracting common utility functions to a shared utilities module
- Add unit tests for each module
- Consider using TypeScript for better type safety
- Add JSDoc comments for better documentation 