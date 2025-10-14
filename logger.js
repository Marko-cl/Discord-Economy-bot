const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(mod => mod.default(...args));

function timestamp() {
  return new Date().toISOString();
}

// Warn at startup if any known secrets are not set in the environment
const knownSecrets = ['DISCORD_TOKEN', 'MONGODB_URI', 'CLIENT_ID'];
for (const secret of knownSecrets) {
  if (!process.env[secret]) {
    console.warn(`Warning: ${secret} environment variable is not set`);
  }
}

function redactSensitive(input) {
  const secrets = [
    process.env.DISCORD_TOKEN,
    process.env.MONGODB_URI,
    process.env.CLIENT_ID
  ];
  function redact(str) {
    if (!str || typeof str !== 'string') return str;
    let redacted = str;
    for (const secret of secrets) {
      if (secret && typeof secret === 'string' && secret.length > 6) {
        redacted = redacted.split(secret).join('[REDACTED]');
      }
    }
    return redacted;
  }
  if (typeof input === 'string') {
    return redact(input);
  } else if (Array.isArray(input)) {
    return input.map(redactSensitive);
  } else if (input && typeof input === 'object') {
    const result = {};
    for (const key of Object.keys(input)) {
      result[key] = redactSensitive(input[key]);
    }
    return result;
  }
  return input;
}

function formatMessage(level, ...args) {
  const safeArgs = args.map(a => {
    if (typeof a === 'string') {
      return redactSensitive(a);
    } else if (a && typeof a.message === 'string') {
      return redactSensitive(a.message);
    } else if (a && typeof a === 'object') {
      return JSON.stringify(redactSensitive(a));
    } else {
      return String(a);
    }
  });
  return `[${level}] [${timestamp()}] ${safeArgs.join(' ')}`;
}

let retentionChecked = false;
const LOG_RETENTION_DAYS = process.env.LOG_RETENTION_DAYS ? parseInt(process.env.LOG_RETENTION_DAYS, 10) : 14;

function cleanOldLogs() {
  const logDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDir)) return;
  const files = fs.readdirSync(logDir);
  const now = Date.now();
  for (const file of files) {
    if (file.startsWith('bot-') && file.endsWith('.log')) {
      const dateStr = file.slice(4, 14); // 'YYYY-MM-DD'
      const fileDate = new Date(dateStr);
      if (!isNaN(fileDate)) {
        const ageDays = (now - fileDate.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > LOG_RETENTION_DAYS) {
          try { fs.unlinkSync(path.join(logDir, file)); } catch (error) {
            console.warn(`Failed to delete old log file ${file}:`, error.message);
          }
        }
      }
    }
  }
}

function writeToFile(level, ...args) {
  try {
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    if (!retentionChecked) {
      cleanOldLogs();
      retentionChecked = true;
    }
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `bot-${today}.log`);
    const message = formatMessage(level, ...args) + '\n';
    fs.appendFileSync(logFile, message);
  } catch (error) {
    console.warn('Failed to write to log file:', error.message);
  }
}

async function sendCriticalAlert(message) {
  const url = process.env.DISCORD_ALERT_WEBHOOK;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });
  } catch {
    // Don't throw in logger
  }
}

// WARNING: Never log secrets or sensitive data. All logs are passed through redactSensitive.
function safeLog(...args) {
  const msg = args.map(a => (typeof a === 'string' ? redactSensitive(a) : JSON.stringify(a))).join(' ');
  // Only warn if the message contains actual sensitive patterns, not common item names
  if (/token|uri|password|secret|key/i.test(msg) && 
      !/gamble token|guild ticket|nickname change token/i.test(msg) && 
      !/updated price|processed item|removed unwanted/i.test(msg)) {
    // Log warning about potential sensitive data
  }
}

const logger = {
  info(...args) {
    const message = formatMessage('INFO', ...args);
    safeLog(message);
    writeToFile('INFO', ...args);
  },
  
  warn(...args) {
    const message = formatMessage('WARN', ...args);
    safeLog(message);
    writeToFile('WARN', ...args);
  },
  
  error(...args) {
    const message = formatMessage('ERROR', ...args);
    safeLog(message);
    writeToFile('ERROR', ...args);
  },
  
  debug(...args) {
    if (process.env.NODE_ENV === 'development') {
      const message = formatMessage('DEBUG', ...args);
      safeLog(message);
      writeToFile('DEBUG', ...args);
    }
  },
  
  // Specialized logging functions
  command(userId, commandName, guildId = null, success = true) {
    const status = success ? 'SUCCESS' : 'FAILED';
    const guild = guildId ? `[Guild: ${guildId}]` : '';
    this.info(`COMMAND ${status} | User: ${userId} | Command: /${commandName} ${guild}`);
  },
  
  economy(userId, action, details = '') {
    this.info(`ECONOMY | User: ${userId} | Action: ${action} | ${details}`);
  },
  
  audit(userId, action, targetId = null, details = '') {
    const target = targetId ? ` | Target: ${targetId}` : '';
    this.warn(`AUDIT | User: ${userId} | Action: ${action}${target} | ${details}`);
  },
  
  performance(operation, duration, details = '') {
    const durationStr = duration >= 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`;
    this.debug(`PERFORMANCE | Operation: ${operation} | Duration: ${durationStr} | ${details}`);
  },
  
  critical(...args) {
    const message = formatMessage('CRITICAL', ...args);
    safeLog(message);
    writeToFile('CRITICAL', ...args);
    sendCriticalAlert(message);
  },
  
  errorWithContext(error, context = '') {
    const safeMessage = redactSensitive(error && error.message ? error.message : '');
    const safeStack = redactSensitive(error && error.stack ? error.stack : '');
    this.error(`ERROR | Context: ${context} | Message: ${safeMessage} | Stack: ${safeStack}`);
    if (context && (context.toLowerCase().includes('unhandled') || context.toLowerCase().includes('uncaught') || context.toLowerCase().includes('critical'))) {
      this.critical(`ERROR | Context: ${context} | Message: ${safeMessage}`);
    }
  }
};

module.exports = logger; 