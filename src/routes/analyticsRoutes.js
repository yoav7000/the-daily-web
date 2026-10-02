const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate, requireEditor } = require('../middleware/auth');

// ==========================================
// PUBLIC & VIEW TRACKING ROUTES
// ==========================================

// רישום צפייה בכתבה (נשלח אוטומטית בעת כניסת קורא)
router.post('/view/:articleId', analyticsController.recordView);

// שליפת נתוני גרף Impact Analytics עבור כתבה
router.get('/article/:articleId', analyticsController.getArticleImpactAnalytics);

// דירוג הכתבות הנצפות ביותר
router.get('/overview/top', analyticsController.getTopArticles);

// ==========================================
// CRUD OPERATIONS (EDITOR / ADMIN)
// ==========================================

// יצירת רשומת סטטיסטיקה ידנית (CRUD - Create)
router.post('/', authenticate, requireEditor, analyticsController.createViewStat);

// שליפת כלל רשומות הסטטיסטיקה עם חיפוש ודפדוף (CRUD - Read / Search)
router.get('/', authenticate, requireEditor, analyticsController.getAllViewStats);

// שליפת רשומת סטטיסטיקה בודדת (CRUD - Read Single)
router.get('/:id', authenticate, requireEditor, analyticsController.getViewStatById);

// עדכון רשומת סטטיסטיקה (CRUD - Update)
router.put('/:id', authenticate, requireEditor, analyticsController.updateViewStat);

// מחיקת רשומת סטטיסטיקה (CRUD - Delete)
router.delete('/:id', authenticate, requireEditor, analyticsController.deleteViewStat);

module.exports = router;
