const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        lowercase: true,
        minlength: [3, 'Username must be at least 3 characters long'],
        index: true
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters long'],
        maxlength: [72, 'Password cannot be longer than 72 characters']
    },
    fullName: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true
    },
    role: {
        type: String,
        enum: {
            values: ['guest', 'reporter', 'editor'],
            message: '{VALUE} is not a supported role'
        },
        default: 'reporter',
        required: true,
        index: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// ---------------------------------------------------------------------------
// Passwords are never stored in plain text. Every way of writing a password to the database
// (save, insertMany, updateOne / updateMany / findOneAndUpdate) hashes it with bcrypt first.
// ---------------------------------------------------------------------------
const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 72; // bcrypt ignores everything after 72 bytes, so longer passwords would be misleading

// The same rules as the schema validators, for the write paths that skip validation (insertMany, updates)
const assertPasswordPolicy = (plain) => {
    if (typeof plain !== 'string' || plain.length < MIN_PASSWORD_LENGTH || plain.length > MAX_PASSWORD_LENGTH) {
        const error = new Error(`Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters long`);
        error.statusCode = 400;
        throw error;
    }
};

const hashPassword = async (plain) => {
    assertPasswordPolicy(plain);
    return bcrypt.hash(plain, SALT_ROUNDS);
};

// save(): hash when the password was set or changed
userSchema.pre('save', async function () {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
    }
});

// insertMany(): hash every document
userSchema.pre('insertMany', async function (next, docs) {
    for (const doc of docs) {
        doc.password = await hashPassword(doc.password);
    }
});

// updateOne / updateMany / findOneAndUpdate: hash a password that is part of the update,
// whether it was written as { password } or as { $set: { password } }
userSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], async function () {
    const update = this.getUpdate() || {};
    const { password: topLevelPassword, ...rest } = update;
    const plain = update.$set && update.$set.password !== undefined ? update.$set.password : topLevelPassword;

    if (plain === undefined) {
        return;
    }

    const hashed = await hashPassword(plain);
    this.setUpdate({ ...rest, $set: { ...(rest.$set || {}), password: hashed } });
});

// Instance method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON serialization for security
userSchema.methods.toJSON = function () {
    const userObj = this.toObject();
    delete userObj.password;
    return userObj;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
