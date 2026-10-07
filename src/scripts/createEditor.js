/**
 * Creates an editor account from the command line (editors cannot self-register).
 *
 * Usage: npm run create-editor -- <username> <password> "<full name>"
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config({ quiet: true });

const [username, password, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(' ');

const run = async () => {
    if (!username || !password || !fullName) {
        console.error('Usage: npm run create-editor -- <username> <password> "<full name>"');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/the-daily-web');
    try {
        const existing = await User.findOne({ username: username.toLowerCase() });
        if (existing) {
            console.error(`User "${username}" already exists (role: ${existing.role}).`);
            process.exitCode = 1;
            return;
        }
        await User.create({ username, password, fullName, role: 'editor' });
        console.log(`Editor "${username}" created.`);
    } finally {
        await mongoose.disconnect();
    }
};

run().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
