const express = require('express');
const router = express.Router();
const articleController = require('../controllers/articleController');
const { authenticate, requireReporter, requireEditor, requireRole } = require('../middleware/auth');

// ==========================================
// PUBLIC ROUTES (No login required)
// ==========================================
router.get('/public', articleController.getPublicArticles);
router.get('/public/:id', articleController.getPublicArticleById);

// ==========================================
// REPORTER & SHARED EDIT ROUTES (Authenticated)
// ==========================================
router.use(authenticate); // Require authentication for all routes below

// Create new article (reporters only)
router.post('/', requireReporter, articleController.createArticle);

// Auto-save endpoint (reporters only)
router.post('/autosave', requireReporter, articleController.autoSaveArticle);
router.put('/:id/autosave', requireReporter, articleController.autoSaveArticle);

// Reporter's article management
router.get('/my-articles', requireReporter, articleController.getMyArticles);
router.get('/my-stats', requireReporter, articleController.getMyStats);
router.get('/:id/edit', requireRole('reporter', 'editor'), articleController.getArticleForEdit);
router.post('/:id/submit', requireReporter, articleController.submitForApproval);

// ==========================================
// EDITOR ROUTES (Authenticated editors only)
// ==========================================
router.get('/editor/all', requireEditor, articleController.getAllArticlesForEditor);
router.get('/editor/stats', requireEditor, articleController.getEditorStats);
router.get('/editor/pending', requireEditor, articleController.getPendingArticlesForEditor);
router.get('/editor/:id/review', requireEditor, articleController.getArticleReviewDetails);
router.put('/editor/:id', requireEditor, articleController.editorDirectEdit);
router.post('/:id/approve', requireEditor, articleController.approveArticle);
router.post('/:id/reject', requireEditor, articleController.returnForRevisions);
router.delete('/:id', requireEditor, articleController.deleteArticle);

module.exports = router;
