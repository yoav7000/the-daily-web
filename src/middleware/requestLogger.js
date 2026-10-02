const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const accessLogPath = path.join(logsDir, 'operations.log');
const httpLogPath = path.join(logsDir, 'access.log');

/**
 * HTTP access logger - one line per request with status and duration
 */
const httpLogger = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const line = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms
`;
        process.stdout.write(line);
        fs.appendFile(httpLogPath, line, () => {});
    });
    next();
};

/**
 * Log significant operational events (Article creation, publishing, reviews, auto-saves)
 */
const logOperation = (action, details) => {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [OPERATIONAL] ${action} - ${JSON.stringify(details)}\n`;
    console.log(`[OPERATIONAL] ${action}:`, details);
    try {
        fs.appendFileSync(accessLogPath, line);
    } catch (e) {
        console.error('Failed writing to operational log:', e);
    }
};

module.exports = {
    httpLogger,
    logOperation
};
