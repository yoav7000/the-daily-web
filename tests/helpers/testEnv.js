const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../../src/models/User');
const { generateToken } = require('../../src/middleware/auth');

// The test runner exchanges its results over stdout. Log lines from the app or the seeder landing in the
// middle of those messages make it fail with "Unable to deserialize cloned data", so tests run quietly.
process.env.NODE_ENV = 'test';
console.log = () => {};
console.info = () => {};
console.warn = () => {};

let mongod;

/**
 * Every test file gets its own throwaway in-memory MongoDB, so tests never touch (or wipe)
 * the development database and files can run in parallel.
 */
const connectTestDb = async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
};

const getTestDbUri = () => mongod.getUri();

const disconnectTestDb = async () => {
    await mongoose.connection.close();
    if (mongod) {
        await mongod.stop();
    }
};

/**
 * There is no public sign-up: accounts are created by editors (or the seed script),
 * so tests create their users directly in the database.
 */
const createUser = async (username, fullName, role) => {
    const user = await User.create({ username, password: 'password123', fullName, role });
    return {
        token: generateToken(user),
        user: { id: user._id, username: user.username, fullName: user.fullName, role: user.role }
    };
};

const createEditor = (username, fullName = 'עורכת בדיקה') => createUser(username, fullName, 'editor');
const createReporter = (username, fullName = 'כתב בדיקה') => createUser(username, fullName, 'reporter');

module.exports = { connectTestDb, disconnectTestDb, getTestDbUri, createEditor, createReporter };
