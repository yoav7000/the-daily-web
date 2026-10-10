const User = require('../models/User');

/**
 * Resolve the logged-in user from the server session (stored in MongoDB, so it survives a server restart).
 * The browser only holds a signed, httpOnly cookie with the session id: nothing it can edit decides who the user is.
 * The user is read from the database on every request, so a role change or a deleted account applies immediately.
 * Returns null for a guest.
 */
const resolveUser = async (req) => {
    if (!req.session || !req.session.userId) {
        return null;
    }
    return User.findById(req.session.userId).select('-password');
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
        next(error);
    }
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

const requireReporter = requireRole('reporter');
const requireEditor = requireRole('editor');

module.exports = {
    resolveUser,
    authenticate,
    requireRole,
    requireReporter,
    requireEditor
};
