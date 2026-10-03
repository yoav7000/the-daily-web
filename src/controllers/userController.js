const User = require('../models/User');
const Article = require('../models/Article');
const { logOperation } = require('../middleware/requestLogger');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { buildSearchFilter } = require('../utils/search');
const { cleanText } = require('../utils/text');

const ASSIGNABLE_ROLES = ['reporter', 'editor'];

const toUserResponse = (user) => ({
    id: user._id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive
});

/**
 * The system must always keep at least one active editor, otherwise nobody can approve articles
 * or manage accounts any more.
 */
const isLastActiveEditor = async (user) => (
    user.role === 'editor'
    && user.isActive
    && (await User.countDocuments({ role: 'editor', isActive: true })) <= 1
);

/**
 * Create an account with a chosen role (editor only)
 * POST /api/users
 */
const createUser = async (req, res, next) => {
    try {
        const username = cleanText(req.body.username).toLowerCase();
        const fullName = cleanText(req.body.fullName);
        const password = typeof req.body.password === 'string' ? req.body.password : '';

        if (!username || !password || !fullName) {
            return res.status(400).json({ success: false, message: 'שם משתמש, סיסמה ושם מלא הם שדות חובה' });
        }
        if (await User.exists({ username })) {
            return res.status(400).json({ success: false, message: 'שם המשתמש כבר קיים במערכת' });
        }

        const role = ASSIGNABLE_ROLES.includes(req.body.role) ? req.body.role : 'reporter';
        const user = await User.create({ username, password, fullName, role });

        logOperation('USER_CREATED_BY_EDITOR', {
            userId: user._id,
            username: user.username,
            role: user.role,
            createdBy: req.user._id
        });

        return res.status(201).json({ success: true, message: 'המשתמש נוצר בהצלחה', user: toUserResponse(user) });
    } catch (error) {
        next(error);
    }
};

/**
 * List / search users (editor only)
 * GET /api/users?search=&role=&page=&limit=
 */
const getUsers = async (req, res, next) => {
    try {
        const { role } = req.query;
        const query = buildSearchFilter(req.query.search, ['username', 'fullName']) || {};

        if (typeof role === 'string' && role) {
            query.role = role;
        }

        const { page, limit, skip } = parsePagination(req.query);
        const [users, totalCount] = await Promise.all([
            User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            User.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            users,
            pagination: buildPagination(totalCount, page, limit)
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get a single user (editor only)
 * GET /api/users/:id
 */
const getUserById = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id).select('-password').lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'המשתמש לא נמצא' });
        }
        return res.status(200).json({ success: true, user });
    } catch (error) {
        next(error);
    }
};

/**
 * Update a user: name, role, active flag or a new password (editor only)
 * PUT /api/users/:id
 */
const updateUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'המשתמש לא נמצא' });
        }

        const { fullName, role, isActive, password } = req.body;

        const losesEditorAccess = (role !== undefined && role !== 'editor') || isActive === false;
        if (losesEditorAccess && await isLastActiveEditor(user)) {
            return res.status(400).json({ success: false, message: 'לא ניתן להסיר או להשבית את העורך הפעיל האחרון במערכת' });
        }

        if (fullName !== undefined) {
            if (!cleanText(fullName)) {
                return res.status(400).json({ success: false, message: 'שם מלא אינו יכול להיות ריק' });
            }
            user.fullName = cleanText(fullName);
        }
        if (role !== undefined) {
            if (!ASSIGNABLE_ROLES.includes(role)) {
                return res.status(400).json({ success: false, message: 'תפקיד לא תקין' });
            }
            user.role = role;
        }
        if (isActive !== undefined) {
            if (typeof isActive !== 'boolean') {
                return res.status(400).json({ success: false, message: 'הערך isActive חייב להיות true או false' });
            }
            user.isActive = isActive;
        }
        if (password !== undefined) {
            if (typeof password !== 'string') {
                return res.status(400).json({ success: false, message: 'סיסמה לא תקינה' });
            }
            user.password = password; // hashed by the model before saving
        }

        await user.save();

        logOperation('USER_UPDATED', { userId: user._id, updatedBy: req.user._id });

        return res.status(200).json({ success: true, message: 'המשתמש עודכן בהצלחה', user: toUserResponse(user) });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete a user (editor only)
 * DELETE /api/users/:id
 * Users who wrote articles cannot be deleted (the articles would lose their author) - deactivate them instead.
 */
const deleteUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'המשתמש לא נמצא' });
        }

        if (user._id.equals(req.user._id)) {
            return res.status(400).json({ success: false, message: 'לא ניתן למחוק את המשתמש שאיתו התחברת' });
        }
        if (await isLastActiveEditor(user)) {
            return res.status(400).json({ success: false, message: 'לא ניתן למחוק את העורך הפעיל האחרון במערכת' });
        }
        if (await Article.exists({ author: user._id })) {
            return res.status(409).json({
                success: false,
                message: 'לכתב זה יש כתבות במערכת ולכן לא ניתן למחוק אותו. ניתן להשבית את החשבון במקום.'
            });
        }

        await user.deleteOne();

        logOperation('USER_DELETED', { userId: user._id, username: user.username, deletedBy: req.user._id });

        return res.status(200).json({ success: true, message: 'המשתמש נמחק בהצלחה' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createUser,
    getUsers,
    getUserById,
    updateUser,
    deleteUser
};
