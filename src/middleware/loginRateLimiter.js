const { cleanText } = require('../utils/text');

/**
 * Slows down password guessing: after too many wrong passwords for the same username from the same
 * address (or from one address overall), further login attempts are refused for a while.
 *
 * The counters live in this server process. A restart clears them, which is acceptable for brute-force
 * protection (the attacker loses the same time again).
 */
const attempts = new Map(); // key -> { count, firstFailureAt }

const settings = () => ({
    windowMs: (Number(process.env.LOGIN_WINDOW_MINUTES) || 15) * 60 * 1000,
    maxPerUser: Number(process.env.LOGIN_MAX_ATTEMPTS) || 10,
    maxPerIp: (Number(process.env.LOGIN_MAX_ATTEMPTS) || 10) * 5
});

const currentEntry = (key, windowMs) => {
    const entry = attempts.get(key);
    if (entry && Date.now() - entry.firstFailureAt > windowMs) {
        attempts.delete(key);
        return null;
    }
    return entry || null;
};

const recordFailure = (key, windowMs) => {
    const entry = currentEntry(key, windowMs);
    if (entry) {
        entry.count += 1;
    } else {
        attempts.set(key, { count: 1, firstFailureAt: Date.now() });
    }
};

// keeps the map from growing forever when many different usernames are tried
const sweepExpired = (windowMs) => {
    if (attempts.size < 5000) {
        return;
    }
    for (const key of attempts.keys()) {
        currentEntry(key, windowMs);
    }
};

const loginRateLimiter = (req, res, next) => {
    const { windowMs, maxPerUser, maxPerIp } = settings();
    sweepExpired(windowMs);

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const username = cleanText(req.body && req.body.username).toLowerCase();
    const userKey = `user:${ip}|${username}`;
    const ipKey = `ip:${ip}`;

    for (const [key, max] of [[userKey, maxPerUser], [ipKey, maxPerIp]]) {
        const entry = currentEntry(key, windowMs);
        if (entry && entry.count >= max) {
            const retryAfterSeconds = Math.max(1, Math.ceil((entry.firstFailureAt + windowMs - Date.now()) / 1000));
            res.set('Retry-After', String(retryAfterSeconds));
            return res.status(429).json({
                success: false,
                message: `יותר מדי ניסיונות התחברות שגויים. נסו שוב בעוד ${Math.ceil(retryAfterSeconds / 60)} דקות.`,
                retryAfterSeconds
            });
        }
    }

    res.on('finish', () => {
        if (res.statusCode === 401) {
            recordFailure(userKey, windowMs);
            recordFailure(ipKey, windowMs);
        } else if (res.statusCode === 200) {
            attempts.delete(userKey); // a correct password clears the count for this user
        }
    });

    next();
};

const resetLoginAttempts = () => attempts.clear();

module.exports = { loginRateLimiter, resetLoginAttempts };
