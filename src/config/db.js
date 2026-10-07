const mongoose = require('mongoose');

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/the-daily-web';

/**
 * Throwaway in-memory MongoDB filled with the demo data. Opt-in for development
 * (USE_MEMORY_DB=true) on a machine without MongoDB; everything is lost when the server stops.
 */
const connectInMemory = async () => {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('USE_MEMORY_DB cannot be used in production.');
    }

    const { MongoMemoryServer } = require('mongodb-memory-server');
    const seedDatabase = require('../scripts/seed');

    const mongoServer = await MongoMemoryServer.create();
    const conn = await mongoose.connect(mongoServer.getUri());
    console.log('[MongoDB] Connected to a temporary IN-MEMORY database (data is lost on exit).');

    await seedDatabase({ connect: false });
    return conn;
};

/**
 * Connect to MongoDB (MONGODB_URI, or a local instance by default).
 */
const connectDB = async () => {
    if (process.env.USE_MEMORY_DB === 'true') {
        return connectInMemory();
    }

    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || DEFAULT_URI, {
            serverSelectionTimeoutMS: 5000
        });
        console.log(`[MongoDB] Connected to host: ${conn.connection.host}, database: ${conn.connection.name}`);
        return conn;
    } catch (error) {
        throw new Error(
            `Could not connect to MongoDB (${error.message}). ` +
            'Start it with "docker compose up -d mongodb", or set USE_MEMORY_DB=true for a temporary dev database.'
        );
    }
};

mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Disconnected from database.');
});

mongoose.connection.on('reconnected', () => {
    console.log('[MongoDB] Reconnected to database.');
});

module.exports = connectDB;
