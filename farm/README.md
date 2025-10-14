# 🌾 Farm System

A comprehensive farming system for Discord bots with advanced features including auto-farming, quality systems, weather effects, and more.

## 🚀 Features

### 🌱 Basic Farming
- **Plant Seeds**: Plant various seed types with different growth times and values
- **Collect Crops**: Harvest ready crops automatically or manually
- **Farm View**: Visual representation of your farm with plot status
- **Sell Crops**: Sell harvested crops for coins
- **Farm Inventory**: Manage seeds, workers, and farm items

### 🤖 Auto-Farming
- **Auto-Plant**: Automatically plant seeds in empty plots (requires 👨‍🌾 Worker)
- **Auto-Collect**: Automatically harvest ready crops (requires 👨‍🌾 Worker)
- **Background Processing**: Works even when users are offline
- **Rate Limiting**: Prevents abuse with intelligent rate limiting
- **DM Notifications**: Optional notifications for auto-farming activities

### ⚡ Plot Upgrades
- **Speed Upgrades**: Make crops grow faster on specific plots
- **Value Upgrades**: Increase crop sell value on specific plots
- **Quality Upgrades**: Improve crop quality chances on specific plots
- **Fertilizer**: Apply for special crop variants (Golden, Crystal, Giant)

### 🌤️ Weather System
- **Dynamic Weather**: Changes every 5 minutes
- **Weather Effects**: Affects crop growth speed and value
- **Weather Forecast**: Check upcoming weather conditions
- **Weather Commands**: `/farm weather` for current conditions

### 🎨 Customization
- **Farm Themes**: Multiple visual themes (Classic, Modern, Organic, Magical)
- **Farm Map**: Visual representation with custom themes
- **Farm Stats**: Track your farming progress and earnings

### 🔧 Management
- **Farm Expansion**: Add more plots to your farm
- **Plot Removal**: Remove empty plots for refunds
- **Multi-Planting**: Plant multiple seed types at once
- **Farm Status**: Debug and monitor farm operations

## 📊 Crop System

### 🌱 Seed Types
- **10 Rarity Tiers**: Common to Galactic with increasing value
- **Growth Times**: 1-12 hours depending on rarity
- **Drop Rates**: Rarer seeds have lower drop rates
- **Special Items**: Box of Seeds for random seed generation

### 🌟 Quality System
- **6 Quality Levels**: Trash to Legendary
- **Quality Effects**: Affects crop value and growth speed
- **Quality Upgrades**: Improve quality chances with upgrades
- **Special Variants**: Golden, Crystal, Giant variants with fertilizer

### 💰 Economy
- **Dynamic Pricing**: Based on rarity, quality, and weather
- **Market System**: View all crop prices and rarity info
- **Profit Optimization**: Multiple strategies for maximizing earnings

## 🛠️ Technical Features

### 🔒 Security & Performance
- **Atomic Operations**: All critical database updates use atomic operations
- **Input Validation**: Comprehensive validation for all user inputs
- **Rate Limiting**: Prevents abuse and spam
- **Error Handling**: Robust error handling throughout
- **Caching**: Intelligent caching for performance

### 📊 Database
- **MongoDB Integration**: Uses Mongoose for data persistence
- **Data Integrity**: Validation and repair tools
- **Atomic Updates**: Prevents data corruption
- **Indexing**: Optimized database queries

### 🔧 Debugging & Monitoring
- **Comprehensive Logging**: Detailed logs for debugging
- **Status Commands**: Real-time farm status monitoring
- **Validation Tools**: Data integrity checking and repair
- **Test Commands**: Owner-only testing tools

## 🎮 Commands

### Basic Commands
- `/farm help` - Comprehensive command guide
- `/farm plant <seed> <amount>` - Plant seeds
- `/farm collect` - Collect ready crops
- `/farm view` - View farm status
- `/farm harvest <plot>` - Harvest specific plot
- `/farm sell` - Sell harvested crops
- `/farm inventory` - Check farm inventory

### Management Commands
- `/farm expand` - Expand farm with more plots
- `/farm removeplot` - Remove empty plot for refund
- `/farm stats` - View farm statistics
- `/farm status` - Debug farm status

### Auto-Farming Commands
- `/farm autoplant` - Toggle auto-planting
- `/farm autocollect` - Toggle auto-collecting
- `/farm notification` - Toggle DM notifications
- `/farm testauto` - Test auto-farming (Owner only)

### Upgrade Commands
- `/farm speed <plot>` - Upgrade plot growth speed
- `/farm value <plot>` - Upgrade plot crop value
- `/farm qualityupgrade <plot>` - Upgrade crop quality
- `/farm fertilize <plot>` - Apply fertilizer

### Utility Commands
- `/farm plantmulti` - Plant multiple seed types
- `/farm weather` - Check weather conditions
- `/farm theme` - Change farm theme
- `/farm map` - View farm with theme
- `/farm market` - View crop prices

### Owner Commands
- `/farm validate` - Validate farm data (Owner only)
- `/farm testauto` - Test auto-farming (Owner only)

## 🔧 Setup & Configuration

### Requirements
- MongoDB database
- Discord.js v14+
- Node.js 16+

### Installation
1. Ensure all dependencies are installed
2. Configure database connection
3. Set up environment variables
4. Initialize auto-farming system

### Configuration
- **Auto-Farming Interval**: Configurable processing intervals
- **Rate Limiting**: Adjustable rate limits per command
- **Weather System**: Configurable weather change intervals
- **Database Timeouts**: Configurable database operation timeouts

## 🐛 Recent Fixes & Improvements

### ✅ Fixed Issues
- **Auto Farm Database Updates**: Improved atomic operations and cache management
- **Inventory Routing**: Fixed farm vs regular inventory routing
- **Quality Display**: Fixed null reference issues in visualization
- **Error Handling**: Enhanced error handling throughout the system
- **Data Validation**: Added comprehensive data validation and repair tools

### 🚀 New Features
- **Farm Status Command**: Real-time debugging and monitoring
- **Farm Validation Command**: Data integrity checking and repair
- **Enhanced Help System**: Comprehensive command guide with tips
- **Better Logging**: Improved debugging and monitoring capabilities
- **Cache Management**: Better cache synchronization

### 🔧 Performance Improvements
- **Atomic Operations**: All critical updates use atomic operations
- **Optimized Queries**: Better database query optimization
- **Rate Limiting**: Improved rate limiting for auto-farming
- **Error Recovery**: Better error recovery and fallback mechanisms

## 📈 Future Enhancements

### Planned Features
- **Guild Farms**: Collaborative farming systems
- **Seasonal Events**: Special farming events and bonuses
- **Advanced Weather**: More complex weather effects
- **Crop Trading**: Player-to-player crop trading
- **Achievement System**: Farming achievements and rewards

### Technical Improvements
- **Redis Caching**: Advanced caching with Redis
- **WebSocket Updates**: Real-time farm updates
- **Analytics Dashboard**: Advanced farming analytics
- **API Integration**: External farming data integration

## 🤝 Contributing

When contributing to the farm system:
1. Follow the existing code style
2. Add comprehensive error handling
3. Include input validation
4. Add appropriate logging
5. Test thoroughly before submitting

## 📝 License

This farm system is part of the Discord bot project and follows the same licensing terms. 