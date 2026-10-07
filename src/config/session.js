const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const { getSecret } = require('./secrets');

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let handler = null;

const buildHandler = () => {
    const options = {
        name: 'daily.sid',
        secret: getSecret('SESSION_SECRET'),
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE === 'true',
            maxAge: SESSION_MAX_AGE_MS
        }
    };

    // Sessions are stored in MongoDB so a logged-in user stays logged in after a server restart.
    // The store reuses the mongoose connection, so it can only be built once that is open.
    if (process.env.NODE_ENV !== 'test' && mongoose.connection.readyState === 1) {
        options.store = MongoStore.create({
            client: mongoose.connection.getClient(),
            collectionName: 'sessions',
            ttl: SESSION_MAX_AGE_MS / 1000
        });
        return session(options);
    }

    return null;
};

/**
 * Session middleware that creates the Mongo-backed store lazily (on the first
 * request after the DB connection is up). Tests fall back to the default store.
 */
const sessionMiddleware = (req, res, next) => {
    if (!handler) {
        handler = buildHandler();
        if (!handler && process.env.NODE_ENV === 'test') {
            handler = session({ secret: 'test', resave: false, saveUninitialized: false });
        }
    }
    if (!handler) {
        return next();
    }
    return handler(req, res, next);
};

module.exports = sessionMiddleware;
