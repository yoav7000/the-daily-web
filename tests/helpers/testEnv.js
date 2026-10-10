const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../../src/models/User');

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
 * Logs in through the real login API and returns the session cookie ("daily.sid=..."), ready to send
 * as a Cookie header. The session is stored in MongoDB, so it works with any server of the test file.
 */
const loginCookie = async (username, password = 'password123') => {
    const app = require('../../src/app');
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (res.status !== 200) {
            throw new Error(`login as ${username} failed with HTTP ${res.status}`);
        }
        return res.headers.get('set-cookie').split(';')[0];
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
};

/**
 * There is no public sign-up: accounts are created by editors (or the seed script),
 * so tests create their users directly in the database and then log in.
 */
const createUser = async (username, fullName, role) => {
    const user = await User.create({ username, password: 'password123', fullName, role });
    return {
        cookie: await loginCookie(username),
        user: { id: user._id, username: user.username, fullName: user.fullName, role: user.role }
    };
};

const createEditor = (username, fullName = 'עורכת בדיקה') => createUser(username, fullName, 'editor');
const createReporter = (username, fullName = 'כתב בדיקה') => createUser(username, fullName, 'reporter');

module.exports = { connectTestDb, disconnectTestDb, getTestDbUri, createEditor, createReporter, loginCookie };
