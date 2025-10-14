/**
 * Comprehensive System Health Monitor
 * Tracks bot performance, database health, and system resources
 */

const logger = require('../logger');
const { performanceMonitor, databaseMonitor } = require('./performance');
const { userCache, commandCache, generalCache } = require('./cache');
const os = require('os');
const process = require('process');

class HealthMonitor {
  constructor() {
    this.startTime = Date.now();
    this.healthChecks = new Map();
    this.alerts = [];
    this.metrics = {
      uptime: 0,
      memoryUsage: {},
      cpuUsage: {},
      databaseHealth: {},
      cacheHealth: {},
      commandHealth: {},
      errorRates: {}
    };
    
    this.thresholds = {
      memoryUsage: 0.9, // 90%
      cpuUsage: 0.8, // 80%
      errorRate: 0.05, // 5%
      responseTime: 2000, // 2 seconds
      databaseErrors: 10, // 10 errors per minute
      cacheHitRate: 0.3 // 30%
    };

    // Register health checks
    this.registerHealthChecks();
    
    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Register system health checks
   */
  registerHealthChecks() {
    // Memory usage check
    this.healthChecks.set('memory', () => this.checkMemoryUsage());
    
    // CPU usage check
    this.healthChecks.set('cpu', () => this.checkCpuUsage());
    
    // Database health check
    this.healthChecks.set('database', () => this.checkDatabaseHealth());
    
    // Cache health check
    this.healthChecks.set('cache', () => this.checkCacheHealth());
    
    // Command performance check
    this.healthChecks.set('commands', () => this.checkCommandHealth());
    
    // Error rate check
    this.healthChecks.set('errors', () => this.checkErrorRates());
    
    // Uptime check
    this.healthChecks.set('uptime', () => this.checkUptime());
  }

  /**
   * Start health monitoring
   */
  startMonitoring() {
    // Run health checks every 30 seconds
    this.monitoringInterval = setInterval(() => {
      this.runHealthChecks();
    }, 30000);

    // Generate health report every 5 minutes
    this.reportInterval = setInterval(() => {
      this.generateHealthReport();
    }, 300000);

    logger.info('Health monitoring started');
  }

  /**
   * Run all health checks
   */
  async runHealthChecks() {
    const results = {};
    
    for (const [name, check] of this.healthChecks) {
      try {
        results[name] = await check();
      } catch (error) {
        logger.error(`Health check failed for ${name}:`, error);
        results[name] = { status: 'error', message: error.message };
      }
    }

    this.updateMetrics();
    this.checkAlerts(results);
  }

  /**
   * Check memory usage
   */
  checkMemoryUsage() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usagePercent = usedMem / totalMem;

    const processMem = process.memoryUsage();
    
    this.metrics.memoryUsage = {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      usagePercent: Math.round(usagePercent * 100),
      processRss: processMem.rss,
      processHeapUsed: processMem.heapUsed,
      processHeapTotal: processMem.heapTotal
    };

    return {
      status: usagePercent < this.thresholds.memoryUsage ? 'healthy' : 'warning',
      usage: Math.round(usagePercent * 100),
      threshold: Math.round(this.thresholds.memoryUsage * 100)
    };
  }

  /**
   * Check CPU usage
   */
  checkCpuUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - (100 * idle / total);

    this.metrics.cpuUsage = {
      usage: Math.round(usage),
      cores: cpus.length,
      loadAverage: os.loadavg()
    };

    return {
      status: usage < this.thresholds.cpuUsage * 100 ? 'healthy' : 'warning',
      usage: Math.round(usage),
      threshold: Math.round(this.thresholds.cpuUsage * 100)
    };
  }

  /**
   * Check database health
   */
  checkDatabaseHealth() {
    const dbStats = databaseMonitor.getStats();
    
    this.metrics.databaseHealth = {
      totalQueries: dbStats.summary.totalQueries,
      averageQueryTime: Math.round(dbStats.summary.averageQueryTime),
      errorRate: Math.round(dbStats.summary.errorRate * 100),
      slowQueryRate: Math.round(dbStats.summary.slowQueryRate * 100),
      connectionStats: dbStats.connectionStats
    };

    const isHealthy = dbStats.summary.errorRate < this.thresholds.errorRate &&
                     dbStats.summary.averageQueryTime < this.thresholds.responseTime;

    return {
      status: isHealthy ? 'healthy' : 'warning',
      errorRate: Math.round(dbStats.summary.errorRate * 100),
      avgQueryTime: Math.round(dbStats.summary.averageQueryTime),
      slowQueries: dbStats.summary.slowQueryRate
    };
  }

  /**
   * Check cache health
   */
  checkCacheHealth() {
    const userStats = userCache.getStats();
    const commandStats = commandCache.getStats();
    const generalStats = generalCache.getStats();

    this.metrics.cacheHealth = {
      userCache: userStats,
      commandCache: commandStats,
      generalCache: generalStats,
      totalHitRate: Math.round(
        (userStats.hits + commandStats.hits + generalStats.hits) /
        (userStats.hits + userStats.misses + commandStats.hits + commandStats.misses + 
         generalStats.hits + generalStats.misses) * 100
      )
    };

    const avgHitRate = this.metrics.cacheHealth.totalHitRate / 100;
    const isHealthy = avgHitRate > this.thresholds.cacheHitRate;

    return {
      status: isHealthy ? 'healthy' : 'warning',
      hitRate: this.metrics.cacheHealth.totalHitRate,
      threshold: Math.round(this.thresholds.cacheHitRate * 100)
    };
  }

  /**
   * Check command health
   */
  checkCommandHealth() {
    const perfStats = performanceMonitor.getStats();
    
    this.metrics.commandHealth = {
      totalOperations: perfStats.summary.totalOperations,
      averageResponseTime: perfStats.summary.averageResponseTime,
      slowOperationCount: perfStats.summary.slowOperationCount,
      errorRate: Math.round(perfStats.summary.errorRate * 100)
    };

    const isHealthy = perfStats.summary.averageResponseTime < this.thresholds.responseTime &&
                     perfStats.summary.errorRate < this.thresholds.errorRate;

    return {
      status: isHealthy ? 'healthy' : 'warning',
      avgResponseTime: perfStats.summary.averageResponseTime,
      errorRate: Math.round(perfStats.summary.errorRate * 100),
      slowOperations: perfStats.summary.slowOperationCount
    };
  }

  /**
   * Check error rates
   */
  checkErrorRates() {
    const perfStats = performanceMonitor.getStats();
    const dbStats = databaseMonitor.getStats();
    
    const totalErrors = Object.values(perfStats.errors).reduce((a, b) => a + b, 0);
    const totalOperations = perfStats.summary.totalOperations;
    const errorRate = totalOperations > 0 ? totalErrors / totalOperations : 0;

    this.metrics.errorRates = {
      totalErrors,
      totalOperations,
      errorRate: Math.round(errorRate * 100),
      databaseErrors: dbStats.summary.errorRate,
      errorTypes: perfStats.errors
    };

    return {
      status: errorRate < this.thresholds.errorRate ? 'healthy' : 'warning',
      errorRate: Math.round(errorRate * 100),
      threshold: Math.round(this.thresholds.errorRate * 100)
    };
  }

  /**
   * Check uptime
   */
  checkUptime() {
    const uptime = Date.now() - this.startTime;
    this.metrics.uptime = uptime;

    return {
      status: 'healthy',
      uptime: Math.floor(uptime / 1000), // seconds
      formatted: this.formatUptime(uptime)
    };
  }

  /**
   * Update metrics with health check results
   */
  updateMetrics() {
    // Metrics are updated in individual health checks
    // This method can be used for additional metric processing
  }

  /**
   * Check for alerts based on health check results
   */
  checkAlerts(results) {
    const newAlerts = [];

    for (const [checkName, result] of Object.entries(results)) {
      if (result.status === 'warning' || result.status === 'error') {
        const alert = {
          type: 'health_check',
          check: checkName,
          status: result.status,
          message: `${checkName} health check failed: ${result.message || 'Threshold exceeded'}`,
          timestamp: new Date().toISOString(),
          severity: result.status === 'error' ? 'high' : 'medium'
        };

        newAlerts.push(alert);
      }
    }

    if (newAlerts.length > 0) {
      this.alerts.push(...newAlerts);
      logger.warn('Health alerts generated:', newAlerts);
    }

    // Keep only last 50 alerts
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(-50);
    }
  }

  /**
   * Generate comprehensive health report
   */
  generateHealthReport() {
    const report = {
      timestamp: new Date().toISOString(),
      uptime: this.formatUptime(this.metrics.uptime),
      system: {
        memory: this.metrics.memoryUsage,
        cpu: this.metrics.cpuUsage
      },
      database: this.metrics.databaseHealth,
      cache: this.metrics.cacheHealth,
      commands: this.metrics.commandHealth,
      errors: this.metrics.errorRates,
      alerts: this.alerts.slice(-10), // Last 10 alerts
      summary: this.generateSummary()
    };

    logger.info('Health Report Generated:', report.summary);
    return report;
  }

  /**
   * Generate health summary
   */
  generateSummary() {
    const checks = ['memory', 'cpu', 'database', 'cache', 'commands', 'errors'];
    const healthyChecks = checks.filter(check => {
      const result = this.healthChecks.get(check)();
      return result && result.status === 'healthy';
    });

    const healthPercentage = Math.round((healthyChecks.length / checks.length) * 100);
    
    return {
      overallHealth: healthPercentage,
      healthyChecks: healthyChecks.length,
      totalChecks: checks.length,
      alertCount: this.alerts.length,
      status: healthPercentage >= 80 ? 'excellent' : 
              healthPercentage >= 60 ? 'good' : 
              healthPercentage >= 40 ? 'fair' : 'poor'
    };
  }

  /**
   * Format uptime
   */
  formatUptime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus() {
    return {
      metrics: this.metrics,
      alerts: this.alerts.slice(-5),
      summary: this.generateSummary()
    };
  }

  /**
   * Stop health monitoring
   */
  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }

    logger.info('Health monitoring stopped');
  }
}

// Create global health monitor instance
const healthMonitor = new HealthMonitor();

module.exports = {
  HealthMonitor,
  healthMonitor
}; 