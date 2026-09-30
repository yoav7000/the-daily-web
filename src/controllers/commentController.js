const Comment = require('../models/Comment');
const Article = require('../models/Article');
const { ARTICLE_STATUS } = require('../constants/articleConstants');
const { logOperation } = require('../middleware/requestLogger');

/**
 * הוספת תגובה חדשה לכתבה
 * POST /api/articles/:articleId/comments
 * מוגן על ידי מנגנון הגבלת קצב תגובות (3 תגובות בדקה לאורח)
 */
const addComment = async (req, res, next) => {
    try {
        const { articleId } = req.params;
        const { authorName, content } = req.body;

        // בדיקת שדות חובה
        if (!authorName || !authorName.trim()) {
            return res.status(400).json({
                success: false,
                message: 'נא להזין שם מגיב'
            });
        }

        if (!content || !content.trim()) {
            return res.status(400).json({
                success: false,
                message: 'נא להזין תוכן לתגובה'
            });
        }

        if (authorName.trim().length > 100) {
            return res.status(400).json({
                success: false,
                message: 'שם המגיב לא יכול לעלות על 100 תווים'
            });
        }

        if (content.trim().length > 1000) {
            return res.status(400).json({
                success: false,
                message: 'תוכן התגובה לא יכול לעלות על 1000 תווים'
            });
        }

        // בדיקה שהכתבה קיימת ופורסמה לציבור
        const article = await Article.findById(articleId);
        if (!article) {
            return res.status(404).json({
                success: false,
                message: 'הכתבה המבוקשת לא נמצאה'
            });
        }

        if (article.status !== ARTICLE_STATUS.PUBLISHED) {
            return res.status(400).json({
                success: false,
                message: 'לא ניתן להגיב על כתבה שטרם פורסמה'
            });
        }

        // שמירת התגובה עם מזהה ה-IP/מכשיר שנבדק במגבלת הקצב
        const comment = new Comment({
            article: articleId,
            authorName: authorName.trim(),
            content: content.trim(),
            clientIp: req.clientIdentifier || req.ip || '127.0.0.1'
        });

        await comment.save();

        logOperation('COMMENT_ADDED', {
            commentId: comment._id,
            articleId: article._id,
            authorName: comment.authorName
        });

        return res.status(201).json({
            success: true,
            message: 'התגובה נוספה בהצלחה',
            comment
        });
    } catch (error) {
        next(error);
    }
};

/**
 * קבלת רשימת התגובות עבור כתבה מסוימת
 * GET /api/articles/:articleId/comments
 * תומך בדפדוף (Pagination), מיון וחיפוש טקסטואלי
 */
const getArticleComments = async (req, res, next) => {
    try {
        const { articleId } = req.params;
        const { page = 1, limit = 50, search } = req.query;

        const query = { article: articleId };

        // תמיכה בחיפוש טקסטואלי בתוך תגובות הכתבה
        if (search && search.trim()) {
            query.$text = { $search: search.trim() };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [comments, totalCount] = await Promise.all([
            Comment.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Comment.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            comments,
            pagination: {
                totalCount,
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * קבלת תגובה בודדת לפי מזהה (CRUD - Read)
 * GET /api/comments/:id
 */
const getCommentById = async (req, res, next) => {
    try {
        const comment = await Comment.findById(req.params.id).populate('article', 'title');
        if (!comment) {
            return res.status(404).json({
                success: false,
                message: 'התגובה המבוקשת לא נמצאה'
            });
        }

        return res.status(200).json({
            success: true,
            comment
        });
    } catch (error) {
        next(error);
    }
};

/**
 * עדכון תגובה (CRUD - Update)
 * PUT /api/comments/:id
 * מאפשר עריכה או ניהול תוכן התגובה
 */
const updateComment = async (req, res, next) => {
    try {
        const { content, authorName } = req.body;

        const comment = await Comment.findById(req.params.id);
        if (!comment) {
            return res.status(404).json({
                success: false,
                message: 'התגובה לא נמצאה'
            });
        }

        if (content !== undefined) {
            if (!content.trim()) {
                return res.status(400).json({ success: false, message: 'תוכן התגובה אינו יכול להיות ריק' });
            }
            comment.content = content.trim();
        }

        if (authorName !== undefined) {
            if (!authorName.trim()) {
                return res.status(400).json({ success: false, message: 'שם המגיב אינו יכול להיות ריק' });
            }
            comment.authorName = authorName.trim();
        }

        await comment.save();

        logOperation('COMMENT_UPDATED', {
            commentId: comment._id,
            articleId: comment.article
        });

        return res.status(200).json({
            success: true,
            message: 'התגובה עודכנה בהצלחה',
            comment
        });
    } catch (error) {
        next(error);
    }
};

/**
 * מחיקת תגובה (CRUD - Delete)
 * DELETE /api/comments/:id
 * משמש לניהול וניקוי תגובות בלתי הולמות ע"י עורך
 */
const deleteComment = async (req, res, next) => {
    try {
        const comment = await Comment.findById(req.params.id);
        if (!comment) {
            return res.status(404).json({
                success: false,
                message: 'התגובה המבוקשת לא נמצאה'
            });
        }

        await Comment.findByIdAndDelete(req.params.id);

        logOperation('COMMENT_DELETED', {
            commentId: req.params.id,
            articleId: comment.article
        });

        return res.status(200).json({
            success: true,
            message: 'התגובה נמחקה בהצלחה'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * קבלת כלל התגובות במערכת עם חיפוש ודפדוף (עבור ממשק הניהול של העורך)
 * GET /api/comments
 */
const getAllComments = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        const query = {};

        if (search && search.trim()) {
            query.$text = { $search: search.trim() };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [comments, totalCount] = await Promise.all([
            Comment.find(query)
                .populate('article', 'title')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Comment.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            comments,
            pagination: {
                totalCount,
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    addComment,
    getArticleComments,
    getCommentById,
    updateComment,
    deleteComment,
    getAllComments
};
