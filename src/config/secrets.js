const DEV_DEFAULTS = {
    SESSION_SECRET: 'daily_web_session_secret_default_2026'
};

/**
 * Reads a secret from the environment. A built-in default is only allowed outside production,
 * so a forgotten variable can never leave a deployed server signing sessions with a public key.
 */
const getSecret = (name) => {
    if (process.env[name]) {
        return process.env[name];
    }
    if (process.env.NODE_ENV === 'production') {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return DEV_DEFAULTS[name];
};

module.exports = { getSecret };
