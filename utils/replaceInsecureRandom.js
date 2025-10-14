/**
 * Replace Insecure Random Number Generation
 * Automatically replaces Math.random() with secure alternatives
 */

const fs = require('fs');
const path = require('path');
const logger = require('../logger');

// Patterns to replace
const REPLACEMENTS = [
  {
    pattern: /Math\.random\(\)/g,
    replacement: 'secureRandomFloat()',
    import: 'const { secureRandomFloat } = require(\'./utils/secureRandom\');'
  },
  {
    pattern: /Math\.floor\(Math\.random\(\) \* (\d+)\)/g,
    replacement: 'secureRandomInt(0, $1)',
    import: 'const { secureRandomInt } = require(\'./utils/secureRandom\');'
  },
  {
    pattern: /Math\.floor\(Math\.random\(\) \* \(([^)]+)\)\)/g,
    replacement: 'secureRandomInt(0, $1)',
    import: 'const { secureRandomInt } = require(\'./utils/secureRandom\');'
  },
  {
    pattern: /Math\.random\(\) < ([^;]+)/g,
    replacement: 'secureRandomBoolean($1)',
    import: 'const { secureRandomBoolean } = require(\'./utils/secureRandom\');'
  }
];

/**
 * Check if file should be processed
 * @param {string} filePath - File path
 * @returns {boolean} Whether to process the file
 */
function shouldProcessFile(filePath) {
  const ext = path.extname(filePath);
  const excludedDirs = ['node_modules', '.git', 'logs', 'docs'];
  const excludedFiles = ['package-lock.json', 'yarn.lock'];
  
  // Skip non-JavaScript files
  if (!['.js', '.mjs'].includes(ext)) {
    return false;
  }
  
  // Skip excluded directories
  for (const dir of excludedDirs) {
    if (filePath.includes(dir)) {
      return false;
    }
  }
  
  // Skip excluded files
  const fileName = path.basename(filePath);
  if (excludedFiles.includes(fileName)) {
    return false;
  }
  
  return true;
}

/**
 * Process a single file
 * @param {string} filePath - File path
 * @returns {Object} Processing results
 */
function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let newContent = content;
    const imports = new Set();
    
    // Apply replacements
    for (const replacement of REPLACEMENTS) {
      if (replacement.pattern.test(newContent)) {
        newContent = newContent.replace(replacement.pattern, replacement.replacement);
        if (replacement.import) {
          imports.add(replacement.import);
        }
        modified = true;
      }
    }
    
    // Add imports if needed
    if (modified && imports.size > 0) {
      const importLines = Array.from(imports);
      
      // Find the best place to add imports
      const lines = newContent.split('\n');
      let insertIndex = 0;
      
      // Look for existing imports
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('const ') && line.includes('require(')) {
          insertIndex = i + 1;
        } else if (line.startsWith('import ') && line.includes('from')) {
          insertIndex = i + 1;
        }
      }
      
      // Insert new imports
      lines.splice(insertIndex, 0, ...importLines);
      newContent = lines.join('\n');
    }
    
    // Write file if modified
    if (modified) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      return { filePath, modified: true, imports: Array.from(imports) };
    }
    
    return { filePath, modified: false };
  } catch (error) {
    logger.error(`Error processing file ${filePath}:`, error);
    return { filePath, modified: false, error: error.message };
  }
}

/**
 * Recursively process directory
 * @param {string} dirPath - Directory path
 * @returns {Array} Processing results
 */
function processDirectory(dirPath) {
  const results = [];
  
  try {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        results.push(...processDirectory(fullPath));
      } else if (stat.isFile() && shouldProcessFile(fullPath)) {
        results.push(processFile(fullPath));
      }
    }
  } catch (error) {
    logger.error(`Error processing directory ${dirPath}:`, error);
  }
  
  return results;
}

/**
 * Main function to replace insecure random
 * @param {string} rootPath - Root directory path
 * @returns {Object} Summary of changes
 */
function replaceInsecureRandom(rootPath = '.') {
  logger.info('Starting insecure random replacement...');
  
  const results = processDirectory(rootPath);
  const modified = results.filter(r => r.modified);
  const errors = results.filter(r => r.error);
  
  const summary = {
    totalFiles: results.length,
    modifiedFiles: modified.length,
    errors: errors.length,
    modified: modified
  };
  
  logger.info('Insecure random replacement completed:', {
    totalFiles: summary.totalFiles,
    modifiedFiles: summary.modifiedFiles,
    errors: summary.errors
  });
  
  if (modified.length > 0) {
    logger.info('Modified files:');
    modified.forEach(result => {
      logger.info(`  - ${result.filePath} (added imports: ${result.imports.join(', ')})`);
    });
  }
  
  if (errors.length > 0) {
    logger.error('Errors encountered:');
    errors.forEach(result => {
      logger.error(`  - ${result.filePath}: ${result.error}`);
    });
  }
  
  return summary;
}

/**
 * Verify replacements were successful
 * @param {string} rootPath - Root directory path
 * @returns {Object} Verification results
 */
function verifyReplacements(rootPath = '.') {
  logger.info('Verifying replacements...');
  
  const results = processDirectory(rootPath);
  const filesWithMathRandom = [];
  
  for (const result of results) {
    if (result.modified) {
      try {
        const content = fs.readFileSync(result.filePath, 'utf8');
        if (content.includes('Math.random()')) {
          filesWithMathRandom.push(result.filePath);
        }
      } catch (error) {
        logger.error(`Error verifying ${result.filePath}:`, error);
      }
    }
  }
  
  if (filesWithMathRandom.length > 0) {
    logger.warn('Files still contain Math.random():', filesWithMathRandom);
  } else {
    logger.info('All Math.random() calls have been successfully replaced!');
  }
  
  return {
    filesWithMathRandom,
    allReplaced: filesWithMathRandom.length === 0
  };
}

module.exports = {
  replaceInsecureRandom,
  verifyReplacements,
  processFile,
  processDirectory
};

// Run if called directly
if (require.main === module) {
  const summary = replaceInsecureRandom();
  const verification = verifyReplacements();
  
  console.log('\n=== SUMMARY ===');
  console.log(`Total files processed: ${summary.totalFiles}`);
  console.log(`Files modified: ${summary.modifiedFiles}`);
  console.log(`Errors: ${summary.errors}`);
  console.log(`All Math.random() replaced: ${verification.allReplaced}`);
  
  if (!verification.allReplaced) {
    process.exit(1);
  }
} 