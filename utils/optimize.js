/**
 * Codebase Optimization Script
 * Removes redundant code, improves performance, and adds helpful utilities
 */

const fs = require('fs');
const path = require('path');
const logger = require('../logger');

// ============================================================================
// OPTIMIZATION TASKS
// ============================================================================

class CodebaseOptimizer {
  constructor() {
    this.changes = [];
    this.removedFiles = [];
    this.optimizedFiles = [];
  }

  /**
   * Remove console.log statements and replace with proper logging
   */
  removeConsoleLogs(filePath) {
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      const originalContent = content;
      
      // Replace console.log with logger.info
      content = content.replace(/console\.log\(/g, 'logger.info(');
      
      // Replace console.error with logger.error
      content = content.replace(/console\.error\(/g, 'logger.error(');
      
      // Replace console.warn with logger.warn
      content = content.replace(/console\.warn\(/g, 'logger.warn(');
      
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content);
        this.changes.push(`Removed console statements from ${filePath}`);
        return true;
      }
    } catch (error) {
      logger.error(`Error processing ${filePath}:`, error);
    }
    return false;
  }

  /**
   * Remove TODO comments
   */
  removeTodos(filePath) {
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      const originalContent = content;
      
      // Remove TODO comments
      content = content.replace(/\/\/ TODO:.*$/gm, '');
      content = content.replace(/\/\* TODO:.*?\*\//gs, '');
      
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content);
        this.changes.push(`Removed TODO comments from ${filePath}`);
        return true;
      }
    } catch (error) {
      logger.error(`Error processing ${filePath}:`, error);
    }
    return false;
  }

  /**
   * Remove duplicate imports
   */
  removeDuplicateImports(filePath) {
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      const originalContent = content;
      
      // Find all require statements
      const requireRegex = /const\s+{([^}]+)}\s*=\s*require\(['"]([^'"]+)['"]\)/g;
      const requires = new Map();
      
      content = content.replace(requireRegex, (match, imports, module) => {
        if (requires.has(module)) {
          // Merge imports
          const existing = requires.get(module);
          const newImports = imports.split(',').map(i => i.trim());
          const allImports = [...new Set([...existing, ...newImports])];
          requires.set(module, allImports);
          return `const {${allImports.join(', ')}} = require('${module}')`;
        } else {
          requires.set(module, imports.split(',').map(i => i.trim()));
          return match;
        }
      });
      
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content);
        this.changes.push(`Removed duplicate imports from ${filePath}`);
        return true;
      }
    } catch (error) {
      logger.error(`Error processing ${filePath}:`, error);
    }
    return false;
  }

  /**
   * Optimize database queries
   */
  optimizeDatabaseQueries(filePath) {
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      const originalContent = content;
      
      // Add projections to findById calls
      content = content.replace(
        /User\.findById\(([^,)]+)\)/g,
        'User.findById($1, null)'
      );
      
      // Add lean() to queries that don't need full documents
      content = content.replace(
        /User\.find\(([^)]+)\)/g,
        'User.find($1).lean()'
      );
      
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content);
        this.changes.push(`Optimized database queries in ${filePath}`);
        return true;
      }
    } catch (error) {
      logger.error(`Error processing ${filePath}:`, error);
    }
    return false;
  }

  /**
   * Add error handling to async functions
   */
  addErrorHandling(filePath) {
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      const originalContent = content;
      
      // Add try-catch to async functions without error handling
      const asyncFunctionRegex = /async\s+function\s+(\w+)\s*\([^)]*\)\s*\{/g;
      let match;
      
      while ((match = asyncFunctionRegex.exec(content)) !== null) {
        const functionName = match[1];
        const startIndex = match.index + match[0].length;
        
        // Check if function already has try-catch
        const functionBody = content.substring(startIndex);
        let braceCount = 0;
        let endIndex = startIndex;
        
        for (let i = 0; i < functionBody.length; i++) {
          if (functionBody[i] === '{') braceCount++;
          else if (functionBody[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
              endIndex = startIndex + i + 1;
              break;
            }
          }
        }
        
        const functionContent = content.substring(startIndex, endIndex - 1);
        
        if (!functionContent.includes('try {') && !functionContent.includes('catch')) {
          const wrappedContent = `\n    try {\n      ${functionContent.trim()}\n    } catch (error) {\n      logger.error('Error in ${functionName}:', error);\n      throw error;\n    }\n  `;
          content = content.substring(0, startIndex) + wrappedContent + content.substring(endIndex);
        }
      }
      
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content);
        this.changes.push(`Added error handling to ${filePath}`);
        return true;
      }
    } catch (error) {
      logger.error(`Error processing ${filePath}:`, error);
    }
    return false;
  }

  /**
   * Process all JavaScript files in a directory
   */
  processDirectory(dirPath) {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        this.processDirectory(filePath);
      } else if (file.endsWith('.js')) {
        this.optimizeFile(filePath);
      }
    }
  }

  /**
   * Optimize a single file
   */
  optimizeFile(filePath) {
    logger.info(`Optimizing ${filePath}`);
    
    let changed = false;
    changed |= this.removeConsoleLogs(filePath);
    changed |= this.removeTodos(filePath);
    changed |= this.removeDuplicateImports(filePath);
    changed |= this.optimizeDatabaseQueries(filePath);
    changed |= this.addErrorHandling(filePath);
    
    if (changed) {
      this.optimizedFiles.push(filePath);
    }
  }

  /**
   * Remove unused files
   */
  removeUnusedFiles() {
    const unusedFiles = [
      'fix_petbot.js',
      'generate_quiz_json.py',
      'discord_trivia_1500_questions.csv'
    ];
    
    for (const file of unusedFiles) {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          this.removedFiles.push(file);
          logger.info(`Removed unused file: ${file}`);
        } catch (error) {
          logger.error(`Error removing ${file}:`, error);
        }
      }
    }
  }

  /**
   * Create performance monitoring utility
   */
  createPerformanceMonitor() {
    const performanceCode = `
/**
 * Performance Monitoring Utility
 */

const logger = require('../logger');

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.startTimes = new Map();
  }

  start(operation) {
    this.startTimes.set(operation, Date.now());
  }

  end(operation) {
    const startTime = this.startTimes.get(operation);
    if (!startTime) return;

    const duration = Date.now() - startTime;
    this.metrics.set(operation, duration);
    this.startTimes.delete(operation);

    if (duration > 1000) {
      logger.warn(\`Slow operation detected: \${operation} took \${duration}ms\`);
    }
  }

  getMetrics() {
    return Object.fromEntries(this.metrics);
  }

  reset() {
    this.metrics.clear();
    this.startTimes.clear();
  }
}

module.exports = new PerformanceMonitor();
`;

    fs.writeFileSync('performanceMonitor.js', performanceCode);
    this.changes.push('Created performance monitoring utility');
  }

  /**
   * Create input validation utility
   */
  createValidationUtility() {
    const validationCode = `
/**
 * Input Validation Utility
 */

const validators = {
  userId: (id) => typeof id === 'string' && /^\\d{17,19}$/.test(id),
  guildId: (id) => typeof id === 'string' && /^\\d{17,19}$/.test(id),
  channelId: (id) => typeof id === 'string' && /^\\d{17,19}$/.test(id),
  roleId: (id) => typeof id === 'string' && /^\\d{17,19}$/.test(id),
  url: (url) => typeof url === 'string' && /^https?:\\/\\/.+/.test(url),
  string: (str, { min = 1, max = 100, pattern = null } = {}) => {
    if (typeof str !== 'string') return false;
    if (str.length < min || str.length > max) return false;
    if (pattern && !pattern.test(str)) return false;
    return true;
  },
  number: (num, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
    if (typeof num !== 'number' || isNaN(num)) return false;
    return num >= min && num <= max;
  },
  positiveInt: (val) => Number.isInteger(val) && val > 0,
  hexColor: (str) => /^#([0-9A-Fa-f]{6})$/.test(str),
  duration: (str) => /^(\\d+)([smhd])$/.test(str),
};

const sanitizers = {
  string: (str) => {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/[<>]/g, '').substring(0, 100);
  },
  object: (obj) => {
    if (typeof obj !== 'object' || obj === null) return {};
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizers.string(value);
      } else if (typeof value === 'number' && !isNaN(value)) {
        sanitized[key] = value;
      } else if (typeof value === 'boolean') {
        sanitized[key] = value;
      }
    }
    return sanitized;
  },
  discordId: (id) => validators.userId(id) ? id : null,
};

module.exports = { validators, sanitizers };
`;

    fs.writeFileSync('validation.js', validationCode);
    this.changes.push('Created input validation utility');
  }

  /**
   * Create caching utility
   */
  createCachingUtility() {
    const cachingCode = `
/**
 * Caching Utility
 */

class Cache {
  constructor(ttl = 60 * 60 * 1000) {
    this.cache = new Map();
    this.timestamps = new Map();
    this.ttl = ttl;
  }

  set(key, value) {
    this.cache.set(key, value);
    this.timestamps.set(key, Date.now());
  }

  get(key) {
    const timestamp = this.timestamps.get(key);
    if (!timestamp) return null;

    if (Date.now() - timestamp > this.ttl) {
      this.delete(key);
      return null;
    }

    return this.cache.get(key);
  }

  delete(key) {
    this.cache.delete(key);
    this.timestamps.delete(key);
  }

  clear() {
    this.cache.clear();
    this.timestamps.clear();
  }

  prune() {
    const now = Date.now();
    for (const [key, timestamp] of this.timestamps.entries()) {
      if (now - timestamp > this.ttl) {
        this.delete(key);
      }
    }
  }
}

module.exports = Cache;
`;

    fs.writeFileSync('cache.js', cachingCode);
    this.changes.push('Created caching utility');
  }

  /**
   * Run all optimizations
   */
  run() {
    logger.info('Starting codebase optimization...');
    
    // Process all JavaScript files
    this.processDirectory('./cogs');
    this.processDirectory('.');
    
    // Remove unused files
    this.removeUnusedFiles();
    
    // Create utilities
    this.createPerformanceMonitor();
    this.createValidationUtility();
    this.createCachingUtility();
    
    // Generate report
    this.generateReport();
  }

  /**
   * Generate optimization report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      changes: this.changes,
      optimizedFiles: this.optimizedFiles,
      removedFiles: this.removedFiles,
      summary: {
        totalChanges: this.changes.length,
        filesOptimized: this.optimizedFiles.length,
        filesRemoved: this.removedFiles.length
      }
    };

    fs.writeFileSync('optimization-report.json', JSON.stringify(report, null, 2));
    
    logger.info('Optimization completed!');
    logger.info(`Total changes: ${report.summary.totalChanges}`);
    logger.info(`Files optimized: ${report.summary.filesOptimized}`);
    logger.info(`Files removed: ${report.summary.filesRemoved}`);
    logger.info('See optimization-report.json for details');
  }
}

// ============================================================================
// RUN OPTIMIZATION
// ============================================================================

if (require.main === module) {
  const optimizer = new CodebaseOptimizer();
  optimizer.run();
}

module.exports = CodebaseOptimizer; 