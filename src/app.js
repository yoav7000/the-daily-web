const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ quiet: true });

const articleRoutes = require('./routes/articleRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const commentRoutes = require('./routes/commentRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const weatherRoutes = require('./routes/weatherRoutes');
const sessionMiddleware = require('./config/session');
const { errorHandler } = require('./middleware/errorHandler');
const { httpLogger } = require('./middleware/requestLogger');

const app = express();

// Do not advertise the framework to every visitor
app.disable('x-powered-by');

// View engine setup (EJS as mandated in course requirements)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Behind a reverse proxy (nginx, a cloud load balancer) set TRUST_PROXY to the number of proxies,
// so req.ip is the real visitor. Never trust forwarding headers otherwise: clients can fake them.
if (Number(process.env.TRUST_PROXY) > 0) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY));
}

// Basic protective headers for every response
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Core middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Browsers ask for /favicon.ico on their own; answer with the site icon instead of a 404
app.get('/favicon.ico', (req, res) => {
    res.type('image/svg+xml').sendFile(path.join(__dirname, '../public/favicon.svg'));
});

// Static files (CSS, Vanilla JS client scripts, images)
app.use(express.static(path.join(__dirname, '../public')));

// Request logging (httpLogger stays silent while tests run)
app.use(httpLogger);

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
app.use('/api/users', userRoutes);
app.use('/api/auth/users', userRoutes); // earlier address of the same endpoints, kept so existing clients keep working
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

// Any other address: a styled "not found" page for browsers
app.use((req, res) => {
    res.status(404).render('error', { status: 404, heading: 'העמוד לא נמצא', message: 'הקישור שגוי, או שהעמוד הוסר.' });
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
