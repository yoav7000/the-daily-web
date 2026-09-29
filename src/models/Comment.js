const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    article: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Article',
        required: [true, 'Article reference is required'],
        index: true
    },
    authorName: {
        type: String,
        required: [true, 'Author name is required'],
        trim: true,
        maxlength: 100
    },
    content: {
        type: String,
        required: [true, 'Comment content is required'],
        trim: true,
        maxlength: 1000
    },
    clientIp: {
        type: String,
        required: false
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Index for anti-spam rate limiting (3 comments per minute per device/IP) and fast article comments retrieval
commentSchema.index({ article: 1, createdAt: -1 });
commentSchema.index({ clientIp: 1, createdAt: -1 });

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;
