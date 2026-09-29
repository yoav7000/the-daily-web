const mongoose = require('mongoose');

/**
 * Connect to MongoDB with retry logic and event listeners.
 */
const connectDB = async () => {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/the-daily-web';

    try {
        const conn = await mongoose.connect(mongoURI, {
            // Modern Mongoose defaults are optimal
        });

        console.log(`[MongoDB] Connected successfully to host: ${conn.connection.host}, database: ${conn.connection.name}`);
        return conn;
    } catch (error) {
        console.error(`[MongoDB] Connection error: ${error.message}`);
        // Do not crash immediately in dev/test if connection fails; let caller handle or retry
        throw error;
    }
};

mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Disconnected from database.');
});

mongoose.connection.on('reconnected', () => {
    console.log('[MongoDB] Reconnected to database.');
});

module.exports = connectDB;
