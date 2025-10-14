/**
 * Guild Payout System
 * Handles automatic distribution of guild business earnings to members
 * Uses atomic operations for data consistency and proper error handling
 */

const { Guild } = require('../database/db');
const defaultGuildBusinesses = require('../config/constants').GUILD_BUSINESSES;
const logger = require('../logger');
const { executeAtomic } = require('../utils/atomicOperations');

// Configuration constants
const PAYOUT_INTERVAL = 60000; // 1 minute
const BATCH_SIZE = 10; // Process guilds in batches
const MAX_PAYOUT_AMOUNT = 1000000; // Maximum payout per member
const MIN_PAYOUT_AMOUNT = 1; // Minimum payout amount

class GuildPayoutSystem {
  constructor(GUILD_BUSINESSES = defaultGuildBusinesses) {
    this.isRunning = false;
    this.interval = null;
    this.processingGuilds = new Set(); // Prevent concurrent processing of same guild
    this.GUILD_BUSINESSES = GUILD_BUSINESSES;
  }

  /**
   * Start the payout system
   */
  start() {
    if (this.isRunning) {
      logger.info('Guild payout system is already running');
      return;
    }

    this.isRunning = true;
    this.interval = setInterval(() => {
      this.processPayouts().catch(error => {
        logger.error('Error in guild payout system:', error);
      });
    }, PAYOUT_INTERVAL);

    logger.info('Guild payout system started');
  }

  /**
   * Stop the payout system
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    this.processingGuilds.clear();
    logger.info('Guild payout system stopped');
  }

  /**
   * Process payouts for all eligible guilds
   */
  async processPayouts() {
    try {
      let processedCount = 0;
      let offset = 0;

      while (true) {
        // Get batch of guilds
        const guilds = await Guild.find({
          'businessPayouts.enabled': true,
          'businesses.0': { $exists: true } // Has at least one business
        })
        .limit(BATCH_SIZE)
        .skip(offset)
        .lean(); // Use lean for better performance

        if (guilds.length === 0) {
          break; // No more guilds to process
        }

        // Process guilds in parallel with concurrency control
        const promises = guilds.map(guild => this.processGuildPayout(guild));
        await Promise.allSettled(promises);

        processedCount += guilds.length;
        offset += BATCH_SIZE;

        // Add small delay between batches to prevent database overload
        if (guilds.length === BATCH_SIZE) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      if (processedCount > 0) {
        logger.info(`Processed payouts for ${processedCount} guilds`);
      }
    } catch (error) {
      logger.error('Error processing guild payouts:', error);
    }
  }

  /**
   * Process payout for a single guild
   */
  async processGuildPayout(guild) {
    // Prevent concurrent processing of the same guild
    if (this.processingGuilds.has(guild._id)) {
      logger.warn(`Guild ${guild.name} is already being processed. Skipping.`);
      return;
    }

    this.processingGuilds.add(guild._id);

    try {
      // Validate guild data
      if (!this.validateGuildData(guild)) {
        return;
      }

      // Check if it's time for a payout
      if (!this.isPayoutDue(guild)) {
        return;
      }

      // Calculate business income
      const { totalIncome, updatedBusinesses } = this.calculateBusinessIncome(guild);
      
      if (totalIncome <= 0) {
        // Update last payout time even if no income
        await this.updateLastPayoutTime(guild._id);
        return;
      }

      // Calculate distribution
      const { guildShare, memberShare } = this.calculateDistribution(guild, totalIncome);

      // Get guild members
      const allMembers = this.getGuildMembers(guild);
      if (allMembers.length === 0) {
        logger.warn(`Guild ${guild.name} has no members to distribute payouts to.`);
        await this.updateLastPayoutTime(guild._id);
        return;
      }

      // Calculate individual payouts
      const payouts = this.calculateIndividualPayouts(guild, allMembers, memberShare);

      // Validate payouts
      if (!this.validatePayouts(payouts)) {
        logger.error(`Invalid payouts calculated for guild ${guild.name}`);
        return;
      }

      // Execute payout transaction
      await this.executePayoutTransaction(guild, payouts, guildShare, totalIncome, updatedBusinesses);

      logger.info(`Guild ${guild.name}: Automatic payout of ${totalIncome.toLocaleString()} coins distributed to ${payouts.length} members`);

    } catch (error) {
      logger.error(`Error processing payout for guild ${guild.name}:`, error);
    } finally {
      this.processingGuilds.delete(guild._id);
    }
  }

  /**
   * Validate guild data structure
   */
  validateGuildData(guild) {
    if (!guild || typeof guild !== 'object' || !guild._id) {
      logger.error('[GUILD PAYOUT] Invalid guild object:', guild);
      return false;
    }

    if (!guild.businessPayouts || typeof guild.businessPayouts !== 'object') {
      logger.warn(`Guild ${guild.name} missing businessPayouts configuration`);
      return false;
    }

    if (!Array.isArray(guild.businesses)) {
      logger.warn(`Guild ${guild.name} has invalid businesses array`);
      return false;
    }

    if (!guild.businessPayouts.enabled) {
      return false; // Not enabled, skip silently
    }

    return true;
  }

  /**
   * Check if payout is due
   */
  isPayoutDue(guild) {
    if (!guild.businessPayouts.lastPayout || isNaN(new Date(guild.businessPayouts.lastPayout).getTime())) {
      logger.warn(`Guild ${guild.name} has invalid lastPayout date. Skipping payout.`);
      return false;
    }

    const timeSinceLastPayout = Date.now() - new Date(guild.businessPayouts.lastPayout).getTime();
    const payoutInterval = guild.businessPayouts.payoutInterval || 3600000; // Default 1 hour

    return timeSinceLastPayout >= payoutInterval;
  }

  /**
   * Calculate business income
   */
  calculateBusinessIncome(guild) {
    let totalIncome = 0;
    const updatedBusinesses = guild.businesses.map(business => {
      const businessInfo = this.GUILD_BUSINESSES[business.type];
      // Debug log
      console.log('DEBUG: business.type:', business.type, 'businessInfo:', businessInfo);
      if (!businessInfo) {
        logger.warn(`Unknown business type: ${business.type} for guild ${guild.name}`);
        return business;
      }

      let lastCollectedTime = business.lastCollected;
      if (!lastCollectedTime || isNaN(new Date(lastCollectedTime).getTime())) {
        logger.warn(`Business ${business.type} in guild ${guild.name} has invalid lastCollected date. Using current time.`);
        lastCollectedTime = new Date();
      }

      const timeSinceCollection = Date.now() - new Date(lastCollectedTime).getTime();
      const hoursSinceCollection = Math.floor(timeSinceCollection / (1000 * 60 * 60));
      const efficiency = business.efficiency || 1;
      const income = businessInfo.baseIncome * business.level * efficiency * hoursSinceCollection;
      
      totalIncome += Math.max(0, income); // Ensure non-negative income

      return {
        ...business,
        lastCollected: new Date()
      };
    });

    return { totalIncome, updatedBusinesses };
  }

  /**
   * Calculate distribution amounts
   */
  calculateDistribution(guild, totalIncome) {
    const guildCut = guild.businessPayouts.guildCut || 0.2; // Default 20% to guild
    const guildShare = Math.floor(totalIncome * guildCut);
    const memberShare = totalIncome - guildShare;

    return { guildShare, memberShare };
  }

  /**
   * Get all guild members
   */
  getGuildMembers(guild) {
    const allMembers = [guild.owner, ...(guild.officers || []), ...(guild.members || [])];
    return allMembers.filter(memberId => memberId && typeof memberId === 'string');
  }

  /**
   * Calculate individual payouts
   */
  calculateIndividualPayouts(guild, allMembers, memberShare) {
    const payouts = [];
    const memberStats = Array.isArray(guild.memberStats) ? guild.memberStats : [];

    switch (guild.businessPayouts.distributionMethod) {
      case 'EQUAL': {
        const perMember = Math.floor(memberShare / allMembers.length);
        for (const memberId of allMembers) {
          payouts.push({ userId: memberId, amount: perMember });
        }
        break;
      }

      case 'CONTRIBUTION': {
        // Calculate total contribution
        let totalContribution = 0;
        for (const member of memberStats) {
          totalContribution += member.businessContribution || 0;
        }

        if (totalContribution === 0) {
          // Fallback to equal distribution if no contributions
          const perMember = Math.floor(memberShare / allMembers.length);
          for (const memberId of allMembers) {
            payouts.push({ userId: memberId, amount: perMember });
          }
        } else {
          // Distribute based on contribution percentage
          for (const member of memberStats) {
            const contribution = member.businessContribution || 0;
            const share = Math.floor((contribution / totalContribution) * memberShare);
            payouts.push({ userId: member.userId, amount: share });
          }
        }
        break;
      }

      case 'RANK_BASED': {
        // Rank-based distribution: Owner 40%, Officers 35%, Members 25%
        const ownerShare = Math.floor(memberShare * 0.4);
        const officerShare = Math.floor(memberShare * 0.35);
        const memberShareAmount = Math.floor(memberShare * 0.25);

        // Owner gets their share
        payouts.push({ userId: guild.owner, amount: ownerShare });

        // Officers split their share
        if (guild.officers && guild.officers.length > 0) {
          const perOfficer = Math.floor(officerShare / guild.officers.length);
          for (const officerId of guild.officers) {
            payouts.push({ userId: officerId, amount: perOfficer });
          }
        }

        // Members split their share
        if (guild.members && guild.members.length > 0) {
          const perMember = Math.floor(memberShareAmount / guild.members.length);
          for (const memberId of guild.members) {
            payouts.push({ userId: memberId, amount: perMember });
          }
        }
        break;
      }

      default: {
        logger.warn(`Unknown distribution method: ${guild.businessPayouts.distributionMethod}. Using EQUAL.`);
        const perMember = Math.floor(memberShare / allMembers.length);
        for (const memberId of allMembers) {
          payouts.push({ userId: memberId, amount: perMember });
        }
        break;
      }
    }

    return payouts;
  }

  /**
   * Validate payout amounts
   */
  validatePayouts(payouts) {
    for (const payout of payouts) {
      if (!payout.userId || typeof payout.userId !== 'string') {
        logger.error('Invalid userId in payout:', payout);
        return false;
      }
      if (typeof payout.amount !== 'number' || payout.amount < 0) {
        logger.error('Invalid amount in payout:', payout);
        return false;
      }
      if (payout.amount > MAX_PAYOUT_AMOUNT) {
        logger.error(`Payout amount ${payout.amount} exceeds maximum for user ${payout.userId}`);
        return false;
      }
    }
    return true;
  }

  /**
   * Execute payout transaction using atomic operations
   */
  async executePayoutTransaction(guild, payouts, guildShare, totalIncome, updatedBusinesses) {
    await executeAtomic([
      // Update guild vault and businesses
      async (session) => {
        const Guild = require('mongoose').model('Guild');
        const result = await Guild.findByIdAndUpdate(
          guild._id,
          {
            businesses: updatedBusinesses,
            $inc: { vault: guildShare, 'statistics.totalEarnings': totalIncome },
            'businessPayouts.lastPayout': new Date()
          },
          { session, new: true }
        );
        
        if (!result) {
          throw new Error(`Failed to update guild ${guild._id}`);
        }
        
        return result;
      },
      // Distribute payouts to members
      async (session) => {
        const results = [];
        for (const payout of payouts) {
          if (payout.amount >= MIN_PAYOUT_AMOUNT) {
            try {
              // Use atomic operation for user coin update
              const User = require('mongoose').model('User');
              const result = await User.findByIdAndUpdate(
                payout.userId,
                { $inc: { coins: payout.amount } },
                { session, new: true }
              );
              
              if (!result) {
                logger.error(`Failed to pay user ${payout.userId} in guild ${guild.name}`);
                continue;
              }
              
              results.push({ userId: payout.userId, amount: payout.amount, success: true });
            } catch (error) {
              logger.error(`Failed to pay user ${payout.userId} in guild ${guild.name}:`, error);
              results.push({ userId: payout.userId, amount: payout.amount, success: false, error: error.message });
            }
          }
        }
        return results;
      },
      // Update member stats
      async (session) => {
        const Guild = require('mongoose').model('Guild');
        const statsUpdates = [];
        
        for (const payout of payouts) {
          if (payout.amount >= MIN_PAYOUT_AMOUNT) {
            try {
              await Guild.updateOne(
                { _id: guild._id, 'memberStats.userId': payout.userId },
                {
                  $inc: { 'memberStats.$.businessEarnings': payout.amount },
                  $set: { 'memberStats.$.lastBusinessPayout': new Date() }
                },
                { session }
              );
              statsUpdates.push({ userId: payout.userId, success: true });
            } catch (error) {
              logger.error(`Failed to update member stats for user ${payout.userId} in guild ${guild.name}:`, error);
              statsUpdates.push({ userId: payout.userId, success: false, error: error.message });
            }
          }
        }
        
        return statsUpdates;
      }
    ], null, { context: 'guild_payout_transaction' });
  }

  /**
   * Update last payout time
   */
  async updateLastPayoutTime(guildId) {
    try {
      const Guild = require('mongoose').model('Guild');
      await Guild.findByIdAndUpdate(guildId, {
        'businessPayouts.lastPayout': new Date()
      });
    } catch (error) {
      logger.error(`Failed to update last payout time for guild ${guildId}:`, error);
    }
  }

  /**
   * Manual payout trigger for testing
   */
  async triggerManualPayout(guildId) {
    try {
      if (!guildId || typeof guildId !== 'string') {
        logger.error('Invalid guildId provided to triggerManualPayout.');
        return;
      }

      const guild = await Guild.findById(guildId);
      if (!guild) {
        logger.error(`Guild not found for id: ${guildId}`);
        return;
      }

      await this.processGuildPayout(guild);
    } catch (err) {
      logger.error(`Error in triggerManualPayout for guildId ${guildId}:`, err);
    }
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      processingGuilds: Array.from(this.processingGuilds),
      processingCount: this.processingGuilds.size
    };
  }
}

module.exports = new GuildPayoutSystem();
