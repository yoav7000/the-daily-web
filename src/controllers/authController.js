const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const { logOperation } = require('../middleware/requestLogger');
const { cleanText } = require('../utils/text');

const ASSIGNABLE_ROLES = ['reporter', 'editor'];

/**
 * Validates the shared fields of a new account.
 * Returns { error } with a Hebrew message, or { username, password, fullName } ready to save.
 */
const readNewUserFields = async (body) => {
    const username = cleanText(body.username).toLowerCase();
    const fullName = cleanText(body.fullName);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password || !fullName) {
        return { error: 'שם משתמש, סיסמה ושם מלא הם שדות חובה' };
    }
    if (await User.exists({ username })) {
        return { error: 'שם המשתמש כבר קיים במערכת' };
    }
    return { username, password, fullName };
};

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
 * Public sign-up. Always creates a Reporter - editor accounts can only be created by an editor.
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
    try {
        const fields = await readNewUserFields(req.body);
        if (fields.error) {
            return res.status(400).json({ success: false, message: fields.error });
        }

        const user = await User.create({ ...fields, role: 'reporter' });

        const token = generateToken(user);
        await startSession(req, user);

        logOperation('USER_REGISTERED', {
            userId: user._id,
            username: user.username,
            role: user.role
        });

        return res.status(201).json({
            success: true,
            message: 'המשתמש נרשם בהצלחה',
            token,
            user: toUserResponse(user)
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create an account with any role without logging in as it (editor only)
 * POST /api/auth/users
 */
const createUser = async (req, res, next) => {
    try {
        const fields = await readNewUserFields(req.body);
        if (fields.error) {
            return res.status(400).json({ success: false, message: fields.error });
        }

        const role = ASSIGNABLE_ROLES.includes(req.body.role) ? req.body.role : 'reporter';
        const user = await User.create({ ...fields, role });

        logOperation('USER_CREATED_BY_EDITOR', {
            userId: user._id,
            username: user.username,
            role: user.role,
            createdBy: req.user._id
        });

        return res.status(201).json({
            success: true,
            message: 'המשתמש נוצר בהצלחה',
            user: toUserResponse(user)
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

/**
 * List / search users with pagination (Editor only)
 * GET /api/auth/users
 */
const getAllUsers = async (req, res, next) => {
    try {
        const { search, role } = req.query;
        const query = {};

        if (role && ASSIGNABLE_ROLES.includes(role)) {
            query.role = role;
        }

        const trimmedSearch = cleanText(search);
        if (trimmedSearch) {
            query.$or = [
                { username: { $regex: trimmedSearch, $options: 'i' } },
                { fullName: { $regex: trimmedSearch, $options: 'i' } }
            ];
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const skip = (page - 1) * limit;

        const [users, totalCount] = await Promise.all([
            User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            User.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            users,
            pagination: {
                totalCount,
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit) || 1
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get user by ID (Editor only)
 * GET /api/auth/users/:id
 */
const getUserById = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'המשתמש לא נמצא' });
        }
        return res.status(200).json({ success: true, user });
    } catch (error) {
        next(error);
    }
};

/**
 * Update user details or role (Editor only)
 * PUT /api/auth/users/:id
 */
const updateUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'המשתמש לא נמצא' });
        }

        if (req.body.fullName) {
            user.fullName = cleanText(req.body.fullName);
        }
        if (req.body.role && ASSIGNABLE_ROLES.includes(req.body.role)) {
            user.role = req.body.role;
        }
        if (typeof req.body.isActive === 'boolean') {
            user.isActive = req.body.isActive;
        }
        if (req.body.password) {
            if (typeof req.body.password !== 'string' || req.body.password.length < 6) {
                return res.status(400).json({ success: false, message: 'הסיסמה חייבת להכיל לפחות 6 תווים' });
            }
            user.password = req.body.password;
        }

        await user.save();

        logOperation('USER_UPDATED', {
            userId: user._id,
            updatedBy: req.user._id,
            role: user.role
        });

        return res.status(200).json({
            success: true,
            message: 'המשתמש עודכן בהצלחה',
            user: toUserResponse(user)
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete user (Editor only)
 * DELETE /api/auth/users/:id
 */
const deleteUser = async (req, res, next) => {
    try {
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({ success: false, message: 'לא ניתן למחוק את המשתמש של עצמך' });
        }

        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'המשתמש לא נמצא' });
        }

        logOperation('USER_DELETED', {
            userId: user._id,
            deletedBy: req.user._id
        });

        return res.status(200).json({
            success: true,
            message: 'המשתמש נמחק בהצלחה'
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    register,
    createUser,
    login,
    logout,
    getMe,
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser
};
