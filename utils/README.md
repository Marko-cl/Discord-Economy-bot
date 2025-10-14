# Utils Module Structure

This directory contains the modularized utility functions for the Discord bot, split into logical groups for better maintainability and readability.

## Module Overview

### Core Modules

#### `constants.js`
- **Purpose**: Configuration constants and settings
- **Contents**: 
  - `constants` object with cooldowns, currency settings, owner ID, etc.
  - `COSMETICS` object for cosmetic items and their multipliers

#### `cache.js`
- **Purpose**: Caching system for user data
- **Contents**:
  - `userCache` Map for storing user data
  - `userCacheTimestamps` Map for cache expiration
  - `clearUserCache()` function
  - Auto-pruning mechanism

#### `validation.js`
- **Purpose**: Input validation and sanitization
- **Contents**:
  - `validators` object with validation functions
  - `sanitizers` object with sanitization functions
  - Discord ID validation, string validation, etc.

#### `errorHandling.js`
- **Purpose**: Standardized error handling
- **Contents**:
  - `handleCommandError()` for command error responses
  - `safeDatabaseOperation()` for database operations
  - `safeDiscordOperation()` for Discord API operations
  - `withRetry()` for retry mechanisms
  - `logError()` for error logging

#### `database.js`
- **Purpose**: Database operations
- **Contents**:
  - `getUser()` with caching
  - `safeUpdateUser()` for safe user updates
  - `batchUpdateUsers()` for bulk operations

#### `rateLimiting.js`
- **Purpose**: Rate limiting functionality
- **Contents**:
  - `createRateLimiter()` function
  - Rate limiter management

#### `commandHandler.js`
- **Purpose**: Command execution wrapper
- **Contents**:
  - `commandHandler()` function with error handling
  - Rate limiting integration
  - Blacklist checking

### Utility Modules

#### `formatting.js`
- **Purpose**: Text and data formatting
- **Contents**:
  - `reply()` for Discord interactions
  - `formatNumber()`, `formatKelocoins()` for currency
  - `parseDuration()`, `formatDuration()` for time
  - `formatProgressBar()` for progress visualization
  - Safe getter functions
  - `random` object for random operations

#### `embeds.js`
- **Purpose**: Discord embed creation
- **Contents**:
  - `buildEmbed()` for general embeds
  - `getUserEmbedColor()` for user-specific colors
  - `leaderboardEmbed()` for leaderboards
  - `profileEmbed()` for user profiles

#### `quests.js`
- **Purpose**: Quest system management
- **Contents**:
  - `QUESTS` object with quest definitions
  - `progressQuests()` for tracking quest progress
  - Quest completion and reward logic

#### `gameLogic.js`
- **Purpose**: Game mechanics and calculations
- **Contents**:
  - `isOwner()`, `isUserBlacklisted()` for permissions
  - Multiplier calculations (`getTotalCoinMultiplier()`, `getXpMultiplier()`)
  - Seasonal functions (`getSeasonalInfo()`, `getSeasonalSpecialItems()`)
  - Pet system functions
  - Progress tracking (`getUnlockProgress()`)

#### `inventory.js`
- **Purpose**: Inventory management
- **Contents**:
  - `hasItem()` for checking item ownership
  - `addItem()`, `removeItem()` for inventory manipulation
  - `countItem()` for item counting
  - Async versions of inventory functions

### Main Export

#### `utils.js`
- **Purpose**: Main export file for backward compatibility
- **Contents**:
  - Imports all functions from individual modules
  - Exports everything needed by other parts of the bot
  - Maintains legacy function names and signatures
  - Provides a single import point for other modules

## Usage

### Importing from individual modules (recommended for new code):
```javascript
const { getUser, safeUpdateUser } = require('./utils/database');
const { formatKelocoins } = require('./utils/formatting');
const { buildEmbed } = require('./utils/embeds');
```

### Importing from main utils (for existing code):
```javascript
const { getUser, formatKelocoins, buildEmbed } = require('./utils/utils');
```

## Benefits of This Structure

1. **Maintainability**: Each module has a single responsibility
2. **Readability**: Functions are logically grouped
3. **Testability**: Individual modules can be tested in isolation
4. **Scalability**: Easy to add new functions to appropriate modules
5. **Backward Compatibility**: Existing code continues to work unchanged

## Migration Notes

- All existing imports from `utils/utils.js` continue to work
- No changes needed to existing code
- New code can import directly from specific modules for better organization
- Legacy function names are preserved for compatibility 