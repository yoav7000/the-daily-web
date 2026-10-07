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
        minlength: [6, 'Password must be at least 6 characters long']
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

// Pre-save hook to hash password with bcrypt if modified
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
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
