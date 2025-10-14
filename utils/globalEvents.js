// Unified Global Event System
const { GlobalState } = require('../database/globalState');
const logger = require('../logger');

class GlobalEventManager {
  constructor() {
    this.events = new Map();
    this.seasonalEvents = new Map();
  }

  // Initialize global events from database
  async initialize() {
    try {
      const event = await GlobalState.findOne({ key: 'partyEvent' });
      if (event && event.value) {
        this.events.set('partyEvent', {
          type: 'party',
          multiplier: event.value.partyEventMultiplier,
          endTime: event.value.partyEventEnd,
          startedBy: event.value.startedBy || 'system'
        });
      }
    } catch (error) {
      logger.error('Error initializing global events:', error);
    }
  }

  // Get current active multiplier (combines party + seasonal)
  getActiveMultiplier() {
    let multiplier = 1;
    
    // Check party events
    for (const event of this.events.values()) {
      if (event.endTime && Date.now() < event.endTime) {
        multiplier *= event.multiplier;
      }
    }
    
    // Check seasonal events
    for (const event of this.seasonalEvents.values()) {
      if (this.isSeasonalEventActive(event)) {
        multiplier *= event.multiplier;
      }
    }
    
    return multiplier;
  }

  // Check if any global events are active
  hasActiveEvents() {
    return this.getActiveMultiplier() > 1;
  }

  // Get all active events for display
  getActiveEvents() {
    const active = [];
    
    for (const event of this.events.values()) {
      if (event.endTime && Date.now() < event.endTime) {
        active.push({
          name: 'Party Event',
          multiplier: event.multiplier,
          endTime: event.endTime,
          type: event.type
        });
      }
    }
    
    for (const event of this.seasonalEvents.values()) {
      if (this.isSeasonalEventActive(event)) {
        active.push({
          name: event.name,
          multiplier: event.multiplier,
          endTime: this.getSeasonalEventEndTime(event),
          type: 'seasonal'
        });
      }
    }
    
    return active;
  }

  // Start a party event
  async startPartyEvent(multiplier, durationMs, startedBy) {
    const endTime = Date.now() + durationMs;
    const eventData = {
      type: 'party',
      multiplier,
      endTime,
      startedBy
    };
    
    this.events.set('partyEvent', eventData);
    
    // Save to database
    await GlobalState.findOneAndUpdate(
      { key: 'partyEvent' },
      { 
        value: {
          partyEventMultiplier: multiplier,
          partyEventEnd: endTime,
          startedBy
        }
      },
      { upsert: true }
    );
    
    // Auto-cleanup
    setTimeout(() => {
      this.events.delete('partyEvent');
    }, durationMs);
    
    return eventData;
  }

  // Stop party event
  async stopPartyEvent() {
    this.events.delete('partyEvent');
    await GlobalState.findOneAndDelete({ key: 'partyEvent' });
  }

  // Check if seasonal event is active
  isSeasonalEventActive(event) {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    
    const [startMonth, startDay] = event.startDate.split('-').map(Number);
    const [endMonth, endDay] = event.endDate.split('-').map(Number);
    
    const currentDate = currentMonth * 100 + currentDay;
    const startDate = startMonth * 100 + startDay;
    const endDate = endMonth * 100 + endDay;
    
    if (startMonth <= endMonth) {
      return currentDate >= startDate && currentDate <= endDate;
    } else {
      // Handles events that span across year boundary (e.g., Christmas)
      return currentDate >= startDate || currentDate <= endDate;
    }
  }

  // Get seasonal event end time
  getSeasonalEventEndTime(event) {
    const now = new Date();
    const [endMonth, endDay] = event.endDate.split('-').map(Number);
    const endDate = new Date(now.getFullYear(), endMonth - 1, endDay);
    
    // If end date has passed this year, it's next year
    if (endDate < now) {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
    
    return endDate.getTime();
  }

  // Load seasonal events from config
  loadSeasonalEvents(seasonalConfig) {
    for (const [key, event] of Object.entries(seasonalConfig)) {
      this.seasonalEvents.set(key, event);
    }
  }
}

// Singleton instance
const globalEventManager = new GlobalEventManager();

module.exports = {
  globalEventManager,
  GlobalEventManager
}; 