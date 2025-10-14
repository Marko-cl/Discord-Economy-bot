const { GlobalState } = require('../../database/globalState');
const logger = require('../../logger');
const { secureRandomFloat, secureRandomChoice } = require('../../utils/secureRandom');
const { executeAtomic } = require('../../utils/atomicOperations');

// Weather types and their effects
const WEATHER_TYPES = {
  CLEAR: {
    name: 'Clear',
    emoji: '☀️',
    growthMultiplier: 1.0,
    valueMultiplier: 1.0,
    duration: 2 * 60 * 60 * 1000, // 2 hours
    description: 'Perfect farming weather'
  },
  RAINY: {
    name: 'Rainy',
    emoji: '🌧️',
    growthMultiplier: 1.3,
    valueMultiplier: 1.1,
    duration: 1.5 * 60 * 60 * 1000, // 1.5 hours
    description: 'Rain speeds up crop growth'
  },
  DROUGHT: {
    name: 'Drought',
    emoji: '🌵',
    growthMultiplier: 0.7,
    valueMultiplier: 1.2,
    duration: 1 * 60 * 60 * 1000, // 1 hour
    description: 'Drought slows growth but increases crop value'
  },
  STORM: {
    name: 'Storm',
    emoji: '⛈️',
    growthMultiplier: 0.5,
    valueMultiplier: 1.5,
    duration: 0.5 * 60 * 60 * 1000, // 30 minutes
    description: 'Stormy weather is harsh but valuable'
  },
  FOGGY: {
    name: 'Foggy',
    emoji: '🌫️',
    growthMultiplier: 0.9,
    valueMultiplier: 1.05,
    duration: 1 * 60 * 60 * 1000, // 1 hour
    description: 'Fog slightly reduces growth'
  }
};

// Get current weather state with atomic operations
async function getCurrentWeather() {
  try {
    const result = await executeAtomic([
      async (session) => {
        let weatherState = await GlobalState.findOne({ key: 'farmWeather' }).session(session);
        if (!weatherState) {
          // Initialize with clear weather using atomic operation
          weatherState = new GlobalState({
            key: 'farmWeather',
            value: {
              currentWeather: 'CLEAR',
              startTime: Date.now(),
              nextChangeTime: Date.now() + WEATHER_TYPES.CLEAR.duration
            }
          });
          await weatherState.save({ session });
        }
        return weatherState.value;
      }
    ], null, { context: 'get_current_weather' });
    
    if (result[0]) {
      return result[0];
    } else {
      logger.error('Failed to get current weather state');
      return {
        currentWeather: 'CLEAR',
        startTime: Date.now(),
        nextChangeTime: Date.now() + WEATHER_TYPES.CLEAR.duration
      };
    }
  } catch (error) {
    logger.error('Error getting weather state:', error);
    return {
      currentWeather: 'CLEAR',
      startTime: Date.now(),
      nextChangeTime: Date.now() + WEATHER_TYPES.CLEAR.duration
    };
  }
}

// Update weather (called periodically) with atomic operations
async function updateWeather() {
  try {
    const weatherState = await getCurrentWeather();
    const now = Date.now();
    
    // Check if it's time for weather change
    if (now >= weatherState.nextChangeTime) {
      const weatherTypes = Object.keys(WEATHER_TYPES);
      let nextWeather;
      if (secureRandomFloat() < 0.3) {
        nextWeather = weatherState.currentWeather;
      } else {
        const availableWeathers = weatherTypes.filter(w => w !== weatherState.currentWeather);
        nextWeather = availableWeathers[secureRandomChoice(availableWeathers)];
      }
      // Defensive: fallback to CLEAR if nextWeather is invalid
      if (!WEATHER_TYPES[nextWeather]) nextWeather = 'CLEAR';
      const newWeather = WEATHER_TYPES[nextWeather] || WEATHER_TYPES.CLEAR;
      const newState = {
        currentWeather: nextWeather,
        startTime: now,
        nextChangeTime: now + newWeather.duration
      };
      
      // Generate deterministic forecast
      let forecast = [];
      let forecastTime = newState.nextChangeTime;
      let lastWeather = nextWeather;
      for (let i = 0; i < 3; i++) {
        let forecastWeather;
        if (secureRandomFloat() < 0.3) {
          forecastWeather = lastWeather;
        } else {
          const availableWeathers = weatherTypes.filter(w => w !== lastWeather);
          forecastWeather = availableWeathers[secureRandomChoice(availableWeathers)];
        }
        // Defensive: fallback to CLEAR if forecastWeather is invalid
        if (!WEATHER_TYPES[forecastWeather]) forecastWeather = 'CLEAR';
        const weatherObj = WEATHER_TYPES[forecastWeather] || WEATHER_TYPES.CLEAR;
        forecast.push({
          weather: forecastWeather,
          name: weatherObj.name,
          emoji: weatherObj.emoji,
          startTime: forecastTime,
          duration: weatherObj.duration
        });
        forecastTime += weatherObj.duration;
        lastWeather = forecastWeather;
      }
      
      // Use atomic operation to update weather state
      const result = await executeAtomic([
        async (session) => {
          return await GlobalState.findOneAndUpdate(
            { key: 'farmWeather' },
            { value: { ...newState, forecast } },
            { upsert: true, session, new: true }
          );
        }
      ], null, { context: 'update_weather_state' });
      
      if (result[0]) {
        logger.info(`Weather changed to ${newWeather.name} ${newWeather.emoji}`);
        return { ...newState, forecast };
      } else {
        logger.error('Failed to update weather state');
        return weatherState;
      }
    }
    return weatherState;
  } catch (error) {
    logger.error('Error updating weather:', error);
    return null;
  }
}

// Get weather effects for crop calculations
function getWeatherEffects(weatherType) {
  const weather = WEATHER_TYPES[weatherType] || WEATHER_TYPES.CLEAR;
  return {
    growthMultiplier: weather.growthMultiplier,
    valueMultiplier: weather.valueMultiplier,
    name: weather.name,
    emoji: weather.emoji,
    description: weather.description
  };
}

// Get weather forecast (next few weather changes)
async function getWeatherForecast() {
  try {
    const currentWeather = await getCurrentWeather();
    if (Array.isArray(currentWeather.forecast)) {
      // Defensive: filter out malformed entries
      return currentWeather.forecast.filter(f => f && typeof f.duration === 'number' && f.weather && WEATHER_TYPES[f.weather]);
    }
    return [];
  } catch (error) {
    logger.error('Error getting weather forecast:', error);
    return [];
  }
}

module.exports = {
  WEATHER_TYPES,
  getCurrentWeather,
  updateWeather,
  getWeatherEffects,
  getWeatherForecast
}; 