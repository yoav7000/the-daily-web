const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const { logOperation } = require('../middleware/requestLogger');
const { cleanText } = require('../utils/text');

/**
 * Opens a fresh server session for the user (a new session id on every login prevents session fixation)
 */
const startSession = (req, user) => new Promise((resolve, reject) => {
    if (!req.session) {
        return resolve();
    }
    req.session.regenerate((err) => {
        if (err) {
            return reject(err);
        }
        req.session.userId = user._id.toString();
        resolve();
    });
});

const toUserResponse = (user) => ({
    id: user._id,
    username: user.username,
    fullName: user.fullName,
    role: user.role
});

/**
 * Login user (Reporter or Editor)
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
    try {
        const username = cleanText(req.body.username).toLowerCase();
        const password = typeof req.body.password === 'string' ? req.body.password : '';

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'נא להזין שם משתמש וסיסמה'
            });
        }

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'שם משתמש או סיסמה שגויים'
            });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'שם משתמש או סיסמה שגויים'
            });
        }

        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'המשתמש אינו פעיל'
            });
        }

        const token = generateToken(user);
        await startSession(req, user);

        logOperation('USER_LOGGED_IN', {
            userId: user._id,
            username: user.username,
            role: user.role
        });

        return res.status(200).json({
            success: true,
            message: 'התחברת בהצלחה',
            token,
            user: toUserResponse(user)
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Logout - destroys the server session
 * POST /api/auth/logout
 */
const logout = (req, res, next) => {
    const finish = () => {
        res.clearCookie('daily.sid');
        return res.status(200).json({ success: true, message: 'התנתקת בהצלחה' });
    };

    if (!req.session) {
        return finish();
    }

    logOperation('USER_LOGGED_OUT', { userId: req.session.userId });
    req.session.destroy((err) => {
        if (err) {
            return next(err);
        }
        finish();
    });
};

/**
 * Get current authenticated user profile
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
    return res.status(200).json({
        success: true,
        user: req.user
    });
};

module.exports = {
    login,
    logout,
    getMe
};
