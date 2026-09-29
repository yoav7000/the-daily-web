const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        await connectDB();
        app.listen(PORT, () => {
            console.log(`===============================================`);
            console.log(`The Daily Web server is running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`Health check: http://localhost:${PORT}/api/health`);
            console.log(`===============================================`);
        });
    } catch (error) {
        console.error('Fatal error starting server:', error);
        process.exit(1);
    }
};

startServer();
