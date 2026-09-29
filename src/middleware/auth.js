const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'daily_web_jwt_secret_default_2026';

/**
 * Generate a signed JWT token
 */
const generateToken = (user) => {
    return jwt.sign(
        {
            id: user._id,
            role: user.role,
            username: user.username,
            fullName: user.fullName
        },
        JWT_SECRET,
        { expiresIn: '7d' } // 7-day persistent login, survives server restarts
    );
};

/**
 * Authentication middleware
 * Checks Bearer token in Authorization header, cookie or session
 * Survives server restarts.
 */
const authenticate = async (req, res, next) => {
    try {
        let token = null;

        // 1. Check Authorization header
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }

        // 2. Check cookies if cookie-parser / session is used
        if (!token && req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }

        // 3. Optional header for internal test environment (e.g. x-test-user-id)
        if (!token && process.env.NODE_ENV === 'test' && req.headers['x-test-user-id']) {
            const testUser = await User.findById(req.headers['x-test-user-id']);
            if (testUser) {
                req.user = testUser;
                return next();
            }
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'אינך מחובר. נדרשת התחברות למערכת'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'המשתמש אינו קיים או אינו פעיל'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'פג תוקף החיבור או שהטוקן אינו תקין',
            error: error.message
        });
    }
};

/**
 * Middleware: Verify user has Reporter or Editor permissions
 */
const requireReporter = (req, res, next) => {
    if (!req.user || (req.user.role !== 'reporter' && req.user.role !== 'editor')) {
        return res.status(403).json({
            success: false,
            message: 'אין לך הרשאת כתב לביצוע פעולה זו'
        });
    }
    next();
};

/**
 * Middleware: Verify user has Editor permissions
 */
const requireEditor = (req, res, next) => {
    if (!req.user || req.user.role !== 'editor') {
        return res.status(403).json({
            success: false,
            message: 'אין לך הרשאת עורך לביצוע פעולה זו'
        });
    }
    next();
};

module.exports = {
    generateToken,
    authenticate,
    requireReporter,
    requireEditor
};
