const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../../src/models/User');
const { generateToken } = require('../../src/middleware/auth');

let mongod;

/**
 * Every test file gets its own throwaway in-memory MongoDB, so tests never touch (or wipe)
 * the development database and files can run in parallel.
 */
const connectTestDb = async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
};

const disconnectTestDb = async () => {
    await mongoose.connection.close();
    if (mongod) {
        await mongod.stop();
    }
};

/**
 * Editors cannot self-register, so tests create them directly in the database.
 */
const createEditor = async (username, fullName = 'עורכת בדיקה') => {
    const user = await User.create({ username, password: 'password123', fullName, role: 'editor' });
    return {
        token: generateToken(user),
        user: { id: user._id, username: user.username, fullName: user.fullName, role: user.role }
    };
};

module.exports = { connectTestDb, disconnectTestDb, createEditor };
