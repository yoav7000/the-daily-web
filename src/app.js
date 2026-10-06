const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const articleRoutes = require('./routes/articleRoutes');
const authRoutes = require('./routes/authRoutes');
const commentRoutes = require('./routes/commentRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const weatherRoutes = require('./routes/weatherRoutes');
const sessionMiddleware = require('./config/session');
const { errorHandler } = require('./middleware/errorHandler');
const { httpLogger } = require('./middleware/requestLogger');

const app = express();

// View engine setup (EJS as mandated in course requirements)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Core middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (CSS, Vanilla JS client scripts, images)
app.use(express.static(path.join(__dirname, '../public')));

// Request logging (skipped in tests)
if (process.env.NODE_ENV !== 'test') {
    app.use(httpLogger);
}

// Server-side sessions (MongoDB store) so logins survive a server restart
app.use(sessionMiddleware);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// EJS Page Routes
const articleController = require('./controllers/articleController');
app.get('/article/:id', articleController.renderArticlePage);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api', commentRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/weather', weatherRoutes);

// Catch 404 for undefined API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `נתיב ה-API המבוקש לא קיים: ${req.originalUrl}`
    });
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
