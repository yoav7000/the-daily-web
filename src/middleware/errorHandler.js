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
 * Pages (anything outside /api) get a styled error page, API calls get JSON.
 */
const isApiRequest = (req) => req.originalUrl.startsWith('/api/') || req.originalUrl === '/api';

const PAGE_TEXT = {
    404: { heading: 'העמוד לא נמצא', message: 'הקישור שגוי, או שהכתבה הוסרה או שטרם פורסמה.' },
    400: { heading: 'הבקשה אינה תקינה', message: 'לא הצלחנו להבין את הכתובת שביקשת.' },
    500: { heading: 'משהו השתבש', message: 'אירעה תקלה בשרת. נסו שוב בעוד רגע.' }
};

const sendError = (req, res, status, message, extra = {}) => {
    if (isApiRequest(req) || req.method !== 'GET') {
        return res.status(status).json({ success: false, message, ...extra });
    }
    const text = PAGE_TEXT[status] || PAGE_TEXT[500];
    return res.status(status).render('error', { status, heading: text.heading, message: text.message });
};

/**
 * Centralized Express Error Handling Middleware
 */
const errorHandler = (err, req, res, next) => {
    logError(err, req);

    // Mongoose validation error: the model's own (Hebrew) messages explain what is wrong
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map(el => el.message);
        return sendError(req, res, 400, errors.join(', '), { errors });
    }

    // Mongoose duplicate key error (code 11000)
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue || {})[0] || '';
        return sendError(req, res, 400, `ערך זה כבר קיים במערכת (${field})`);
    }

    // Mongoose CastError (invalid ObjectId): in the browser a mistyped link is simply "not found"
    if (err.name === 'CastError') {
        if (isApiRequest(req) || req.method !== 'GET') {
            return sendError(req, res, 400, `מזהה פריט אינו תקין: ${err.value}`);
        }
        return sendError(req, res, 404, 'העמוד לא נמצא');
    }

    // Invalid JSON body or other client errors raised by Express itself
    if (err.type === 'entity.parse.failed') {
        return sendError(req, res, 400, 'גוף הבקשה אינו JSON תקין');
    }

    const statusCode = err.statusCode || err.status || 500;
    const message = statusCode >= 500 ? (err.message || 'שגיאת שרת פנימית') : err.message;

    return sendError(req, res, statusCode, message, {
        ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
    });
};

module.exports = {
    errorHandler,
    logError
};
