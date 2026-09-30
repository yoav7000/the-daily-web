const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const commentRateLimiter = require('../middleware/commentRateLimiter');
const { authenticate, requireEditor } = require('../middleware/auth');

// ==========================================
// PUBLIC COMMENT ROUTES
// ==========================================

// הוספת תגובה חדשה לכתבה עם הגבלת קצב של עד 3 תגובות בדקה לאותו מכשיר
router.post('/articles/:articleId/comments', commentRateLimiter, commentController.addComment);

// קבלת תגובות עבור כתבה מסוימת (כולל חיפוש ודפדוף)
router.get('/articles/:articleId/comments', commentController.getArticleComments);

// קבלת תגובה ספציפית לפי מזהה (CRUD - Read)
router.get('/comments/:id', commentController.getCommentById);

// ==========================================
// MANAGEMENT & MODERATION ROUTES (CRUD)
// ==========================================

// קבלת כלל התגובות במערכת עם תמיכה בחיפוש
router.get('/comments', commentController.getAllComments);

// עדכון תוכן תגובה (CRUD - Update)
router.put('/comments/:id', authenticate, requireEditor, commentController.updateComment);

// מחיקת תגובה על ידי עורך (CRUD - Delete)
router.delete('/comments/:id', authenticate, requireEditor, commentController.deleteComment);

module.exports = router;
