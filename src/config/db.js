const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/the-daily-web';

// Where the development database keeps its files, so data, logins and drafts survive a server restart
const LOCAL_DB_PATH = path.join(__dirname, '../../data/local-db');

/**
 * Development MongoDB started by the server itself (USE_MEMORY_DB=true), for a machine without MongoDB.
 * Its files are kept in data/local-db, so everything survives a restart. The demo data is added
 * on the first run only; delete the data folder to start over. MEMORY_DB_PERSIST=false keeps nothing.
 */
const connectInMemory = async () => {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('USE_MEMORY_DB cannot be used in production.');
    }

    const { MongoMemoryServer } = require('mongodb-memory-server');
    const seedDatabase = require('../scripts/seed');
    const User = require('../models/User');

    const persist = process.env.MEMORY_DB_PERSIST !== 'false';
    let instance = {};
    if (persist) {
        fs.mkdirSync(LOCAL_DB_PATH, { recursive: true });
        instance = { dbPath: LOCAL_DB_PATH, storageEngine: 'wiredTiger' };
    }

    const mongoServer = await MongoMemoryServer.create({ instance });
    const conn = await mongoose.connect(mongoServer.getUri('the-daily-web'));
    console.log(persist
        ? `[MongoDB] Connected to the local development database (files in ${LOCAL_DB_PATH}).`
        : '[MongoDB] Connected to a temporary IN-MEMORY database (data is lost on exit).');

    // (not estimatedDocumentCount: that number can read 0 after the server was stopped abruptly)
    if (!(await User.exists({}))) {
        await seedDatabase({ connect: false });
    }
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
            serverSelectionTimeoutMS: 2500
        });
        console.log(`[MongoDB] Connected to host: ${conn.connection.host}, database: ${conn.connection.name}`);
        return conn;
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn(`[MongoDB] Could not connect to local MongoDB (${error.message}). Falling back to temporary IN-MEMORY database...`);
            return connectInMemory();
        }
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
