/**
 * Enhanced Performance Monitoring & Optimization Utility
 * Tracks performance metrics and provides optimization suggestions
 */

const logger = require('../logger');

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.startTimes = new Map();
    this.slowOperations = [];
    this.errorCounts = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      size: 0,
      evictions: 0
    };
    this.alerts = [];
    this.performanceThresholds = {
      slowOperation: 1000, // 1 second
      verySlowOperation: 5000, // 5 seconds
      highErrorRate: 0.1, // 10%
      lowCacheHitRate: 0.3 // 30%
    };
  }

  /**
   * Start timing an operation
   */
  start(operation) {
    this.startTimes.set(operation, Date.now());
  }

  /**
   * End timing an operation and record metrics
   */
  end(operation) {
    const startTime = this.startTimes.get(operation);
    if (!startTime) return;

    const duration = Date.now() - startTime;
    this.startTimes.delete(operation);

    // Record metric
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    this.metrics.get(operation).push(duration);

    // Keep only last 100 measurements
    if (this.metrics.get(operation).length > 100) {
      this.metrics.get(operation).shift();
    }

    // Track slow operations
    if (duration > this.performanceThresholds.slowOperation) {
      this.slowOperations.push({
        operation,
        duration,
        timestamp: new Date().toISOString()
      });

      // Keep only last 50 slow operations
      if (this.slowOperations.length > 50) {
        this.slowOperations.shift();
      }

      // Log based on severity
      if (duration > this.performanceThresholds.verySlowOperation) {
        logger.error(`Very slow operation detected: ${operation} took ${duration}ms`);
        this.createAlert('very_slow_operation', operation, duration);
      } else {
        logger.warn(`Slow operation detected: ${operation} took ${duration}ms`);
        this.createAlert('slow_operation', operation, duration);
      }
    }
  }

  /**
   * Track cache hits
   */
  cacheHit() {
    this.cacheStats.hits++;
  }

  /**
   * Track cache misses
   */
  cacheMiss() {
    this.cacheStats.misses++;
  }

  /**
   * Track cache size
   */
  updateCacheSize(size) {
    this.cacheStats.size = size;
  }

  /**
   * Track cache evictions
   */
  cacheEviction() {
    this.cacheStats.evictions++;
  }

  /**
   * Track errors
   */
  trackError(errorType) {
    this.errorCounts.set(errorType, (this.errorCounts.get(errorType) || 0) + 1);
  }

  /**
   * Create performance alert
   */
  createAlert(type, operation, value) {
    const alert = {
      type,
      operation,
      value,
      timestamp: new Date().toISOString(),
      severity: type.includes('very_slow') ? 'high' : 'medium'
    };
    
    this.alerts.push(alert);
    
    // Keep only last 20 alerts
    if (this.alerts.length > 20) {
      this.alerts.shift();
    }
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const stats = {
      operations: {},
      cache: {
        hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) || 0,
        hits: this.cacheStats.hits,
        misses: this.cacheStats.misses,
        size: this.cacheStats.size,
        evictions: this.cacheStats.evictions
      },
      errors: Object.fromEntries(this.errorCounts),
      slowOperations: this.slowOperations.slice(-10), // Last 10 slow operations
      alerts: this.alerts.slice(-5), // Last 5 alerts
      summary: {
        totalOperations: 0,
        averageResponseTime: 0,
        slowOperationCount: this.slowOperations.length,
        errorRate: 0,
        alertCount: this.alerts.length
      }
    };

    // Calculate operation statistics
    for (const [operation, durations] of this.metrics.entries()) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const min = Math.min(...durations);
      const max = Math.max(...durations);
      const p95 = this.calculatePercentile(durations, 95);
      const p99 = this.calculatePercentile(durations, 99);
      
      stats.operations[operation] = {
        average: Math.round(avg),
        min,
        max,
        p95: Math.round(p95),
        p99: Math.round(p99),
        count: durations.length
      };

      stats.summary.totalOperations += durations.length;
      stats.summary.averageResponseTime += avg;
    }

    if (Object.keys(stats.operations).length > 0) {
      stats.summary.averageResponseTime = Math.round(
        stats.summary.averageResponseTime / Object.keys(stats.operations).length
      );
    }

    // Calculate error rate
    const totalErrors = Object.values(stats.errors).reduce((a, b) => a + b, 0);
    stats.summary.errorRate = stats.summary.totalOperations > 0 ? 
      totalErrors / stats.summary.totalOperations : 0;

    return stats;
  }

  /**
   * Calculate percentile
   */
  calculatePercentile(values, percentile) {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  /**
   * Get optimization suggestions
   */
  getOptimizationSuggestions() {
    const stats = this.getStats();
    const suggestions = [];

    // Check for slow operations
    for (const [operation, data] of Object.entries(stats.operations)) {
      if (data.average > 500) {
        suggestions.push({
          type: 'slow_operation',
          operation,
          current: data.average,
          suggestion: `Consider optimizing ${operation} - currently averaging ${data.average}ms`
        });
      }
      
      if (data.p95 > 2000) {
        suggestions.push({
          type: 'high_p95',
          operation,
          current: data.p95,
          suggestion: `95th percentile for ${operation} is high (${data.p95}ms) - consider optimization`
        });
      }
    }

    // Check cache performance
    if (stats.cache.hitRate < this.performanceThresholds.lowCacheHitRate) {
      suggestions.push({
        type: 'cache_performance',
        current: Math.round(stats.cache.hitRate * 100),
        suggestion: 'Cache hit rate is low. Consider increasing cache size or improving cache keys.'
      });
    }

    // Check error rates
    if (stats.summary.errorRate > this.performanceThresholds.highErrorRate) {
      suggestions.push({
        type: 'high_error_rate',
        current: Math.round(stats.summary.errorRate * 100),
        suggestion: 'High error rate detected. Consider adding better error handling.'
      });
    }

    // Check for specific error types
    for (const [errorType, count] of Object.entries(stats.errors)) {
      if (count > 10) {
        suggestions.push({
          type: 'frequent_error',
          errorType,
          count,
          suggestion: `Frequent ${errorType} errors. Consider investigating and fixing.`
        });
      }
    }

    return suggestions;
  }

  /**
   * Generate performance report
   */
  generateReport() {
    const stats = this.getStats();
    const suggestions = this.getOptimizationSuggestions();
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalOperations: stats.summary.totalOperations,
        averageResponseTime: stats.summary.averageResponseTime,
        slowOperations: stats.summary.slowOperationCount,
        errorRate: Math.round(stats.summary.errorRate * 100),
        cacheHitRate: Math.round(stats.cache.hitRate * 100),
        alerts: stats.summary.alertCount
      },
      topSlowOperations: Object.entries(stats.operations)
        .sort(([,a], [,b]) => b.average - a.average)
        .slice(0, 5)
        .map(([name, data]) => ({
          name,
          average: data.average,
          p95: data.p95,
          count: data.count
        })),
      suggestions,
      alerts: stats.alerts
    };

    return report;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
    this.startTimes.clear();
    this.slowOperations = [];
    this.errorCounts.clear();
    this.alerts = [];
    this.cacheStats = { hits: 0, misses: 0, size: 0, evictions: 0 };
  }

  /**
   * Export metrics for external monitoring
   */
  exportMetrics() {
    return {
      metrics: Object.fromEntries(this.metrics),
      cacheStats: this.cacheStats,
      errorCounts: Object.fromEntries(this.errorCounts),
      slowOperations: this.slowOperations,
      alerts: this.alerts
    };
  }
}

// ============================================================================
// DATABASE PERFORMANCE MONITORING
// ============================================================================

class DatabaseMonitor {
  constructor() {
    this.queries = new Map();
    this.slowQueries = [];
    this.connectionStats = {
      active: 0,
      idle: 0,
      total: 0
    };
  }

  /**
   * Track database query performance
   */
  trackQuery(operation, duration, success = true) {
    if (!this.queries.has(operation)) {
      this.queries.set(operation, {
        count: 0,
        totalTime: 0,
        averageTime: 0,
        errors: 0,
        slowQueries: 0,
        minTime: Infinity,
        maxTime: 0
      });
    }

    const stats = this.queries.get(operation);
    stats.count++;
    stats.totalTime += duration;
    stats.averageTime = stats.totalTime / stats.count;
    stats.minTime = Math.min(stats.minTime, duration);
    stats.maxTime = Math.max(stats.maxTime, duration);

    if (!success) {
      stats.errors++;
    }

    if (duration > 1000) {
      stats.slowQueries++;
      this.slowQueries.push({
        operation,
        duration,
        timestamp: new Date().toISOString()
      });

      // Keep only last 20 slow queries
      if (this.slowQueries.length > 20) {
        this.slowQueries.shift();
      }
    }
  }

  /**
   * Update connection stats
   */
  updateConnectionStats(stats) {
    this.connectionStats = { ...stats };
  }

  /**
   * Get database performance statistics
   */
  getStats() {
    const stats = {
      queries: Object.fromEntries(this.queries),
      slowQueries: this.slowQueries,
      connectionStats: this.connectionStats,
      summary: {
        totalQueries: 0,
        averageQueryTime: 0,
        errorRate: 0,
        slowQueryRate: 0
      }
    };

    let totalQueries = 0;
    let totalTime = 0;
    let totalErrors = 0;
    let totalSlowQueries = 0;

    for (const queryStats of this.queries.values()) {
      totalQueries += queryStats.count;
      totalTime += queryStats.totalTime;
      totalErrors += queryStats.errors;
      totalSlowQueries += queryStats.slowQueries;
    }

    stats.summary.totalQueries = totalQueries;
    stats.summary.averageQueryTime = totalQueries > 0 ? totalTime / totalQueries : 0;
    stats.summary.errorRate = totalQueries > 0 ? totalErrors / totalQueries : 0;
    stats.summary.slowQueryRate = totalQueries > 0 ? totalSlowQueries / totalQueries : 0;

    return stats;
  }

  /**
   * Get database optimization suggestions
   */
  getOptimizationSuggestions() {
    const stats = this.getStats();
    const suggestions = [];

    // Check for slow queries
    for (const [operation, queryStats] of Object.entries(stats.queries)) {
      if (queryStats.averageTime > 500) {
        suggestions.push({
          type: 'slow_query',
          operation,
          averageTime: queryStats.averageTime,
          suggestion: `Query ${operation} is slow (${queryStats.averageTime}ms avg). Consider adding indexes or optimizing the query.`
        });
      }
    }

    // Check error rates
    if (stats.summary.errorRate > 0.05) {
      suggestions.push({
        type: 'high_error_rate',
        errorRate: Math.round(stats.summary.errorRate * 100),
        suggestion: 'High database error rate. Check connection pool and query syntax.'
      });
    }

    // Check slow query rate
    if (stats.summary.slowQueryRate > 0.1) {
      suggestions.push({
        type: 'many_slow_queries',
        slowQueryRate: Math.round(stats.summary.slowQueryRate * 100),
        suggestion: 'Many slow queries detected. Consider database optimization.'
      });
    }

    return suggestions;
  }
}

// ============================================================================
// MEMORY MONITORING
// ============================================================================

class MemoryMonitor {
  constructor() {
    this.snapshots = [];
    this.maxSnapshots = 100;
  }

  /**
   * Take memory snapshot
   */
  snapshot() {
    const memoryUsage = process.memoryUsage();
    const snapshot = {
      timestamp: new Date().toISOString(),
      rss: memoryUsage.rss,
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers
    };

    this.snapshots.push(snapshot);

    // Keep only last N snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    // Check for memory leaks
    if (this.snapshots.length > 10) {
      const recent = this.snapshots.slice(-10);
      const first = recent[0];
      const last = recent[recent.length - 1];
      
      const growth = last.heapUsed - first.heapUsed;
      const growthRate = growth / (last.timestamp - first.timestamp);

      if (growthRate > 1000) { // More than 1KB per second
        logger.warn(`Potential memory leak detected. Growth rate: ${Math.round(growthRate)} bytes/second`);
      }
    }

    return snapshot;
  }

  /**
   * Get memory statistics
   */
  getStats() {
    if (this.snapshots.length === 0) {
      return null;
    }

    const current = this.snapshots[this.snapshots.length - 1];
    const first = this.snapshots[0];

    return {
      current,
      growth: {
        rss: current.rss - first.rss,
        heapUsed: current.heapUsed - first.heapUsed,
        heapTotal: current.heapTotal - first.heapTotal
      },
      snapshots: this.snapshots.length,
      average: {
        rss: this.snapshots.reduce((sum, s) => sum + s.rss, 0) / this.snapshots.length,
        heapUsed: this.snapshots.reduce((sum, s) => sum + s.heapUsed, 0) / this.snapshots.length,
        heapTotal: this.snapshots.reduce((sum, s) => sum + s.heapTotal, 0) / this.snapshots.length
      }
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

const performanceMonitor = new PerformanceMonitor();
const databaseMonitor = new DatabaseMonitor();
const memoryMonitor = new MemoryMonitor();

// Auto-snapshot memory every 30 seconds
setInterval(() => {
  memoryMonitor.snapshot();
}, 30000);

module.exports = {
  PerformanceMonitor,
  DatabaseMonitor,
  MemoryMonitor,
  performanceMonitor,
  databaseMonitor,
  memoryMonitor
}; 