const Comment = require('../models/Comment');
const Article = require('../models/Article');
const { ARTICLE_STATUS } = require('../constants/articleConstants');
const { logOperation } = require('../middleware/requestLogger');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { cleanText } = require('../utils/text');
const { buildSearchFilter } = require('../utils/search');

// clientIp is only used for spam protection and must never be sent to the browser
const PUBLIC_FIELDS = '-clientIp';

/**
 * הוספת תגובה חדשה לכתבה
 * POST /api/articles/:articleId/comments
 * מוגן על ידי מנגנון הגבלת קצב תגובות (3 תגובות בדקה לאורח)
 */
const addComment = async (req, res, next) => {
    try {
        const { articleId } = req.params;
        const { authorName, content } = req.body;

        const name = cleanText(authorName);
        const text = cleanText(content);

        // בדיקת שדות חובה
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'נא להזין שם מגיב'
            });
        }

        if (!text) {
            return res.status(400).json({
                success: false,
                message: 'נא להזין תוכן לתגובה'
            });
        }

        if (name.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'שם המגיב לא יכול לעלות על 100 תווים'
            });
        }

        if (text.length > 1000) {
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
            authorName: name,
            content: text,
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
            comment: {
                _id: comment._id,
                article: comment.article,
                authorName: comment.authorName,
                content: comment.content,
                createdAt: comment.createdAt
            }
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
        const { search } = req.query;

        const query = { article: articleId };

        // תמיכה בחיפוש טקסטואלי בתוך תגובות הכתבה
        Object.assign(query, buildSearchFilter(search, ['content', 'authorName']));

        const { page, limit, skip } = parsePagination(req.query, 50);

        const [comments, totalCount] = await Promise.all([
            Comment.find(query)
                .select(PUBLIC_FIELDS)
                .sort({ createdAt: -1, _id: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Comment.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            comments,
            pagination: buildPagination(totalCount, page, limit)
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
        const comment = await Comment.findById(req.params.id).select(PUBLIC_FIELDS).populate('article', 'title');
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
            if (!cleanText(content)) {
                return res.status(400).json({ success: false, message: 'תוכן התגובה אינו יכול להיות ריק' });
            }
            comment.content = cleanText(content);
        }

        if (authorName !== undefined) {
            if (!cleanText(authorName)) {
                return res.status(400).json({ success: false, message: 'שם המגיב אינו יכול להיות ריק' });
            }
            comment.authorName = cleanText(authorName);
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
        const { search } = req.query;
        const query = {};

        Object.assign(query, buildSearchFilter(search, ['content', 'authorName']));

        const { page, limit, skip } = parsePagination(req.query);

        const [comments, totalCount] = await Promise.all([
            Comment.find(query)
                .populate('article', 'title')
                .sort({ createdAt: -1, _id: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Comment.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            comments,
            pagination: buildPagination(totalCount, page, limit)
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
