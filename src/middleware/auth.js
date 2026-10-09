const jwt = require('jsonwebtoken');
const User = require('../models/User');

const { getSecret } = require('../config/secrets');

const JWT_SECRET = getSecret('JWT_SECRET');

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
 * Resolve the logged-in user from a Bearer token, cookie, or server session.
 * Returns null when no credentials were sent, throws when they are invalid.
 */
const resolveUser = async (req) => {
    let token = null;

    // 1. Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    // 2. Cookie (if cookie-parser is used)
    if (!token && req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }

    // 3. Server-side session (stored in MongoDB, survives restarts)
    if (!token && req.session && req.session.userId) {
        const sessionUser = await User.findById(req.session.userId).select('-password');
        if (sessionUser && sessionUser.isActive) {
            return sessionUser;
        }
    }

    if (!token) {
        return null;
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive) {
        const err = new Error('inactive');
        err.inactive = true;
        throw err;
    }
    return user;
};

/**
 * Authentication middleware - rejects with 401 when there is no valid login.
 */
const authenticate = async (req, res, next) => {
    try {
        const user = await resolveUser(req);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'אינך מחובר. נדרשת התחברות למערכת'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.inactive) {
            return res.status(401).json({
                success: false,
                message: 'המשתמש אינו קיים או אינו פעיל'
            });
        }
        return res.status(401).json({
            success: false,
            message: 'פג תוקף החיבור או שהטוקן אינו תקין'
        });
    }
};

/**
 * Optional authentication - never rejects. Anyone without a valid login is a guest.
 */
const optionalAuth = async (req, res, next) => {
    try {
        req.user = await resolveUser(req);
    } catch (error) {
        req.user = null;
    }
    req.role = req.user ? req.user.role : 'guest';
    next();
};

/**
 * Generic role guard, e.g. requireRole('editor') or requireRole('reporter', 'editor')
 */
const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: 'אין לך הרשאה לבצע פעולה זו'
        });
    }
    next();
};

/**
 * Middleware: Verify user has Reporter permissions
 */
const requireReporter = (req, res, next) => {
    if (!req.user || req.user.role !== 'reporter') {
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
    optionalAuth,
    requireRole,
    requireReporter,
    requireEditor
};
