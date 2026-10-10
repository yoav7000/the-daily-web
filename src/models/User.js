const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ---------------------------------------------------------------------------
// Passwords are never stored in plain text. Every way of writing a password to the database
// (save, insertMany, updateOne / updateMany / findOneAndUpdate) hashes it with bcrypt first.
// ---------------------------------------------------------------------------
const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes (a Hebrew letter takes 2), so longer would mislead
const PASSWORD_RULE_MESSAGE = `הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים ועד ${MAX_PASSWORD_BYTES} בתים`;

// The one password rule. Used by the schema (save) and by the write paths that skip validators (insertMany, updates).
const isValidPassword = (plain) => typeof plain === 'string'
    && plain.length >= MIN_PASSWORD_LENGTH
    && Buffer.byteLength(plain, 'utf8') <= MAX_PASSWORD_BYTES;

const hashPassword = async (plain) => {
    if (!isValidPassword(plain)) {
        const error = new Error(PASSWORD_RULE_MESSAGE);
        error.statusCode = 400;
        throw error;
    }
    return bcrypt.hash(plain, SALT_ROUNDS);
};

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        cast: false,
        required: [true, 'שם משתמש הוא שדה חובה'],
        unique: true,
        trim: true,
        lowercase: true,
        minlength: [3, 'שם המשתמש חייב להכיל לפחות 3 תווים'],
        index: true
    },
    password: {
        type: String,
        cast: false,
        required: [true, 'סיסמה היא שדה חובה'],
        validate: { validator: isValidPassword, message: PASSWORD_RULE_MESSAGE }
    },
    fullName: {
        type: String,
        cast: false,
        required: [true, 'שם מלא הוא שדה חובה'],
        trim: true
    },
    // Guests are visitors who are not logged in, they are never stored: an account is a reporter or an editor
    role: {
        type: String,
        enum: {
            values: ['reporter', 'editor'],
            message: 'תפקיד לא תקין: {VALUE}'
        },
        default: 'reporter',
        required: true,
        index: true
    }
}, {
    timestamps: true
});

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
