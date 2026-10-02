const express = require('express');
const router = express.Router();
const weatherController = require('../controllers/weatherController');

// GET /api/weather - קבלת נתוני מזג אוויר עם שמירה במטמון (Cache) של 15 דקות
router.get('/', weatherController.getWeather);

module.exports = router;
