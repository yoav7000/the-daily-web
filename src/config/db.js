const mongoose = require('mongoose');

/**
 * Connect to MongoDB with retry logic and event listeners.
 */
const connectDB = async () => {
    let mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/the-daily-web';

    try {
        const conn = await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 2000
        });

        console.log(`[MongoDB] Connected successfully to host: ${conn.connection.host}, database: ${conn.connection.name}`);
        return conn;
    } catch (error) {
        console.warn(`[MongoDB] Connection error: ${error.message}. Starting IN-MEMORY fallback...`);
        try {
            const { MongoMemoryServer } = require('mongodb-memory-server');
            const mongoServer = await MongoMemoryServer.create();
            mongoURI = mongoServer.getUri();
            
            const conn = await mongoose.connect(mongoURI);
            console.log(`[MongoDB] Connected to IN-MEMORY database successfully.`);
            
            // Seed DB with test articles
            const seedTestData = require('../../seed_test');
            await seedTestData();
            return conn;
        } catch (memError) {
            throw memError;
        }
    }
};

mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Disconnected from database.');
});

mongoose.connection.on('reconnected', () => {
    console.log('[MongoDB] Reconnected to database.');
});

module.exports = connectDB;
