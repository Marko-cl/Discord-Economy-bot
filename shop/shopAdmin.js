const mongoose = require('mongoose');
const { ShopItem } = require('../database/db');
const logger = require('../logger');
require('dotenv').config();

// Prices for existing items (name: price)
const prices = {
  "Fishing Rod": 8000,
  "Shovel": 5000,
  "University degree": 25000,
  "XP Booster": 3000,
  "Loot Crate": 7500,
  
  "Meme Pack": 7500,
  "Pet Bot": 75000,
  "Color Pack": 10000,
  "Gamble Token": 2500,
  "Auto Collector": 1500000,
  "AFK Shield": 8000,
  "Double Drop Card": 100000,
  "Event Pass": 20000,
  "Joke Generator": 6000,
  "Mystery Box": 10000,
  "Gift Coins": 1000,
  "Coin Booster": 5000,
  "Luck Booster": 4000,
  "Speed Booster": 6000,
  "Mega Booster": 15000,
  "Guild Ticket": 50000,
  "Box of Seeds": 15000,
  "👨‍🌾 Worker": 35000,
  "Fertilizer": 3500
};

// Full item definitions for new or updated items
const items = [
  {
    name: 'Pickaxe',
    price: 50000,
    description: 'Required to operate the Gold Mine. Upgradable for more yield.',
    category: 'mining',
    oneTime: true,
    consumable: false,
    effect: 'pickaxe',
    icon: '⛏️'
  },
  {
    name: 'Gift Coins',
    price: 1000,
    description: 'Required to gift coins to other users.',
    category: 'social',
    oneTime: false,
    consumable: true,
    effect: 'gift_coins',
    icon: '🎁'
  },
  {
    name: 'Coin Booster',
    price: 5000,
    description: '1.5x coin multiplier for 3 hours.',
    category: 'booster',
    oneTime: false,
    consumable: true,
    effect: 'coin_booster',
    duration: 10800000, // 3 hours
    icon: '💰'
  },
  {
    name: 'Luck Booster',
    price: 4000,
    description: 'Better gambling odds for 1 hour.',
    category: 'booster',
    oneTime: false,
    consumable: true,
    effect: 'luck_booster',
    duration: 3600000, // 1 hour
    icon: '🍀'
  },
  {
    name: 'Speed Booster',
    price: 6000,
    description: 'Reduced cooldowns for 2 hours.',
    category: 'booster',
    oneTime: false,
    consumable: true,
    effect: 'speed_booster',
    duration: 7200000, // 2 hours
    icon: '🏃'
  },
  {
    name: 'Mega Booster',
    price: 15000,
    description: 'All boosters active for 1 hour.',
    category: 'booster',
    oneTime: false,
    consumable: true,
    effect: 'mega_booster',
    duration: 3600000, // 1 hour
    icon: '🌟'
  },
  {
    name: 'Mystery Box',
    price: 10000,
    description: 'Open to receive a random valuable item!',
    category: 'special',
    oneTime: false,
    consumable: true,
    effect: 'mystery_box',
    icon: '📦'
  },

  {
    name: 'AFK Shield',
    price: 8000,
    description: 'Protection from robbery for 36 hours.',
    category: 'protection',
    oneTime: false,
    consumable: true,
    effect: 'afk_shield',
    icon: '🛡️'
  },
  {
    name: 'Joke Generator',
    price: 6000,
    description: 'Generate random jokes on demand.',
    category: 'fun',
    oneTime: true,
    consumable: false,
    effect: 'joke_generator',
    icon: '😄'
  },
  {
    name: 'Loot Crate',
    price: 5000,
    description: 'Open to receive random coins and items!',
    category: 'special',
    oneTime: false,
    consumable: true,
    effect: 'loot_crate',
    icon: '📦'
  },
  {
    name: 'University degree',
    price: 10000,
    description: 'Required to use the /work command.',
    category: 'requirement',
    oneTime: true,
    consumable: false,
    effect: 'university_degree',
    icon: '🎓'
  },
  {
    name: 'Fishing Rod',
    price: 3500,
    description: 'Required to use the /fishing command.',
    category: 'requirement',
    oneTime: true,
    consumable: false,
    effect: 'fishing_rod',
    icon: '🎣'
  },
  {
    name: 'Shovel',
    price: 2500,
    description: 'Required to use the /dig command.',
    category: 'requirement',
    oneTime: true,
    consumable: false,
    effect: 'shovel',
    icon: '⛏️'
  },
  {
    name: 'Pet Bot',
    price: 25000,
    description: 'AI companion that collects coins passively.',
    category: 'companion',
    oneTime: true,
    consumable: false,
    effect: 'pet_bot',
    icon: '🤖'
  },
  {
    name: 'Meme Pack',
    price: 7500,
    description: 'Unlock unlimited meme generation.',
    category: 'fun',
    oneTime: true,
    consumable: false,
    effect: 'meme_pack',
    icon: '😂'
  },
  {
    name: 'Color Pack',
    price: 10000,
    description: 'Unlock custom embed colors.',
    category: 'cosmetic',
    oneTime: true,
    consumable: false,
    effect: 'color_pack',
    icon: '🎨'
  },
  {
    name: 'Double Drop Card',
    price: 50000,
    description: 'Receive coin drops every 5 minutes for 24 hours.',
    category: 'premium',
    oneTime: false,
    consumable: true,
    effect: 'double_drop_card',
    icon: '🎯'
  },
  {
    name: 'Event Pass',
    price: 20000,
    description: 'Double rewards during party events.',
    category: 'premium',
    oneTime: false,
    consumable: true,
    effect: 'event_pass',
    icon: '🎫'
  },
  {
    name: 'Auto Collector',
    price: 1500000,
    description: 'Permanently claims your daily rewards automatically every 24 hours!',
    category: 'premium',
    oneTime: true,
    consumable: false,
    effect: 'auto_collector',
    icon: '🤖'
  },
  {
    name: 'Guild Ticket',
    price: 50000,
    description: 'Required to create or join a guild.',
    category: 'guild',
    oneTime: false,
    consumable: true,
    effect: 'guild_ticket',
    icon: '🎫'
  },
  {
    name: 'Box of Seeds',
    price: 15000,
    description: 'Open to receive 1-4 random seeds for farming!',
    category: 'farming',
    oneTime: false,
    consumable: true,
    effect: 'box_of_seeds',
    icon: '🌱'
  },
  {
    name: '👨‍🌾 Worker',
    price: 35000,
    description: 'Automatically plants and collects crops on your farm.',
    category: 'farming',
    oneTime: true,
    consumable: false,
    effect: 'worker',
    icon: '👨‍🌾'
  },
  {
    name: 'Fertilizer',
    price: 2000,
    description: 'Makes your next crop grow twice as fast.',
    category: 'farming',
    oneTime: false,
    consumable: true,
    effect: 'fertilizer',
    icon: '🌿'
  }
].filter(item => !/weed|seeds?/i.test(item.name) || item.name === 'Box of Seeds');

const unwantedItems = [
  'Status Booster',
  'Name Flair',
  'Premium Chat Badge',
  'Username Glow',
  'Soundboard Booster',
  'Custom Role',
  'Priority Speaker',
  'VIP Lounge Ticket',
  'Hidden Channel Access',
  'Voice Priority Pass',
  'Nickname Change Token'
];

if (!process.env.MONGODB_URI) {
  logger.error('MONGODB_URI is not set in environment variables. Exiting.');
  process.exit(1);
}

async function shopAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB for shop admin operations');

    // Update prices for existing items
    const priceEntries = Object.entries(prices);
    let priceUpdateCount = 0;
    
    for (const [name, price] of priceEntries) {
      try {
        await ShopItem.findOneAndUpdate(
          { name },
          { $set: { price } },
          { new: true, upsert: false }
        );
        priceUpdateCount++;
      } catch (error) {
        logger.error(`Failed to update price for ${name}:`, error);
      }
    }

    // Add or update full item definitions
    let itemProcessCount = 0;
    
    for (const item of items) {
      try {
        await ShopItem.findOneAndUpdate(
          { name: item.name },
          { $set: item },
          { new: true, upsert: true }
        );
        itemProcessCount++;
      } catch (error) {
        logger.error(`Failed to process item ${item.name}:`, error);
      }
    }

    // Remove unwanted items
    let removedCount = 0;
    
    for (const itemName of unwantedItems) {
      try {
        await ShopItem.deleteOne({ name: itemName });
        removedCount++;
      } catch (error) {
        logger.error(`Failed to remove item ${itemName}:`, error);
      }
    }

    if (priceUpdateCount === 0) {
      logger.warn('No shop item prices were updated.');
    }
    if (itemProcessCount === 0) {
      logger.warn('No shop items were processed (added/updated).');
    }
    if (removedCount === 0) {
      logger.warn('No unwanted shop items were removed.');
    }

    logger.info(`Shop admin operations completed successfully - Updated ${priceUpdateCount}/${priceEntries.length} prices, processed ${itemProcessCount}/${items.length} items, removed ${removedCount} unwanted items`);
    process.exit(0);
  } catch (error) {
    logger.error('Error in shop admin operations:', error);
    process.exit(1);
  } finally {
    try {
      await mongoose.disconnect();
      logger.info('Disconnected from MongoDB');
    } catch (error) {
      logger.error('Error disconnecting from MongoDB:', error);
    }
  }
}

shopAdmin().catch(() => {
  mongoose.disconnect();
  process.exit(1);
});

