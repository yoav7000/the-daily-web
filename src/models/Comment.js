const mongoose = require('mongoose');

/**
 * מודל תגובות (Comment)
 * תומך בפעולות CRUD מלאות, מנגנון חיפוש טקסטואלי,
 * ואינדקסים מהירים לשליפת תגובות לפי כתבה ולסינון ספאם לפי IP.
 */
const commentSchema = new mongoose.Schema({
    article: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Article',
        required: [true, 'מזהה כתבה הוא שדה חובה'],
        index: true
    },
    authorName: {
        type: String,
        required: [true, 'שם המגיב הוא שדה חובה'],
        trim: true,
        maxlength: [100, 'שם המגיב לא יכול לעלות על 100 תווים']
    },
    content: {
        type: String,
        required: [true, 'תוכן התגובה הוא שדה חובה'],
        trim: true,
        maxlength: [1000, 'תוכן התגובה לא יכול לעלות על 1000 תווים']
    },
    clientIp: {
        type: String,
        required: false,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// אינדקסים משולבים לביצועים מהירים בעומס
commentSchema.index({ article: 1, createdAt: -1 });
commentSchema.index({ clientIp: 1, createdAt: -1 });

// אינדקס טקסטואלי לחיפוש תגובות לפי תוכן או שם מגיב
commentSchema.index({
    content: 'text',
    authorName: 'text'
}, {
    name: 'CommentTextIndex',
    weights: {
        content: 10,
        authorName: 5
    }
});

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;
