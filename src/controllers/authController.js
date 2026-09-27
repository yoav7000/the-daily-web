const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const { logOperation } = require('../middleware/requestLogger');

/**
 * Register a new user (Reporter or Editor)
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
    try {
        const { username, password, fullName, role } = req.body;

        if (!username || !password || !fullName) {
            return res.status(400).json({
                success: false,
                message: 'שם משתמש, סיסמה ושם מלא הם שדות חובה'
            });
        }

        const existingUser = await User.findOne({ username: username.toLowerCase().trim() });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'שם המשתמש כבר קיים במערכת'
            });
        }

        const user = new User({
            username: username.toLowerCase().trim(),
            password,
            fullName: fullName.trim(),
            role: role === 'editor' ? 'editor' : 'reporter'
        });

        await user.save();

        const token = generateToken(user);

        logOperation('USER_REGISTERED', {
            userId: user._id,
            username: user.username,
            role: user.role
        });

        return res.status(201).json({
            success: true,
            message: 'המשתמש נרשם בהצלחה',
            token,
            user: {
                id: user._id,
                username: user.username,
                fullName: user.fullName,
                role: user.role
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Login user (Reporter or Editor)
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'נא להזין שם משתמש וסיסמה'
            });
        }

        const user = await User.findOne({ username: username.toLowerCase().trim() });
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

        const token = generateToken(user);

        logOperation('USER_LOGGED_IN', {
            userId: user._id,
            username: user.username,
            role: user.role
        });

        return res.status(200).json({
            success: true,
            message: 'התחברת בהצלחה',
            token,
            user: {
                id: user._id,
                username: user.username,
                fullName: user.fullName,
                role: user.role
            }
        });
    } catch (error) {
        next(error);
    }
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
    register,
    login,
    getMe
};
