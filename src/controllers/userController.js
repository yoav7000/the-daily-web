const User = require('../models/User');
const Article = require('../models/Article');
const { logOperation } = require('../middleware/requestLogger');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { buildSearchFilter } = require('../utils/search');

const toUserResponse = (user) => ({
    id: user._id,
    username: user.username,
    fullName: user.fullName,
    role: user.role
});

/**
 * The system must always keep at least one active editor, otherwise nobody can approve articles
 * or manage accounts any more.
 */
const isLastEditor = async (user) => (
    user.role === 'editor'
    && (await User.countDocuments({ role: 'editor' })) <= 1
);

/**
 * Create an account with a chosen role (editor only)
 * POST /api/users
 */
const createUser = async (req, res, next) => {
    try {
        const { username, password, fullName, role } = req.body;

        // The User model validates every field; a taken username is refused by its unique index
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
            User.find(query).select('-password').sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
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

        const { fullName, role, password } = req.body;

        if (role !== undefined && role !== 'editor' && await isLastEditor(user)) {
            return res.status(400).json({ success: false, message: 'לא ניתן להוריד את העורך האחרון במערכת לתפקיד כתב' });
        }

        // The User model validates the new values; the password is hashed by the model before saving
        if (fullName !== undefined) user.fullName = fullName;
        if (role !== undefined) user.role = role;
        if (password !== undefined) user.password = password;

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
        if (await isLastEditor(user)) {
            return res.status(400).json({ success: false, message: 'לא ניתן למחוק את העורך האחרון במערכת' });
        }
        if (await Article.exists({ author: user._id })) {
            return res.status(409).json({
                success: false,
                message: 'לכתב זה יש כתבות במערכת, ולכן לא ניתן למחוק אותו: הכתבות היו נשארות ללא כתב.'
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
