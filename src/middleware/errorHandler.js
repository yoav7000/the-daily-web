const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const errorLogPath = path.join(logsDir, 'error.log');

/**
 * Log error details to both console and error.log file
 */
const logError = (err, req) => {
    const timestamp = new Date().toISOString();
    const route = req ? `${req.method} ${req.originalUrl}` : 'Internal';
    const user = req && req.user ? `[User: ${req.user.username} (${req.user.role})]` : '[Anonymous]';
    const message = `[${timestamp}] ${route} ${user} - ${err.stack || err.message}\n`;

    console.error(message);
    try {
        fs.appendFileSync(errorLogPath, message);
    } catch (fsErr) {
        console.error('Failed writing to error log file:', fsErr);
    }
};

/**
 * Centralized Express Error Handling Middleware
 */
const errorHandler = (err, req, res, next) => {
    logError(err, req);

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map(el => el.message);
        return res.status(400).json({
            success: false,
            message: 'שגיאת תקינות נתונים',
            errors
        });
    }

    // Mongoose duplicate key error (code 11000)
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        return res.status(400).json({
            success: false,
            message: `ערך זה כבר קיים במערכת (${field})`
        });
    }

    // Mongoose CastError (invalid ObjectId)
    if (err.name === 'CastError') {
        return res.status(400).json({
            success: false,
            message: `מזהה פריט אינו תקין: ${err.value}`
        });
    }

    // Custom status code if provided
    const statusCode = err.statusCode || 500;
    const message = err.message || 'שגיאת שרת פנימית';

    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
    });
};

module.exports = {
    errorHandler,
    logError
};
