const mongoose = require('mongoose');

/**
 * מודל נתוני צפייה וסטטיסטיקות (ViewStat / Analytics)
 * מותאם לעבודה בעומסי תעבורה כבדים (אלפי קוראים במקביל)
 * בשיטת Time-Bucket Aggregation עם עדכונים אטומיים ($inc),
 * תוך תמיכה מלאה בכל פעולות ה-CRUD הנדרשות.
 */
const viewStatSchema = new mongoose.Schema({
    article: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Article',
        required: [true, 'מזהה כתבה הוא שדה חובה'],
        index: true
    },
    viewedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    // מפתח דלי זמן שעתי (למשל: "2026-09-30-11") לצבירה אטומית מהירה
    timeBucket: {
        type: String,
        required: [true, 'דלי זמן הוא שדה חובה'],
        index: true
    },
    viewCount: {
        type: Number,
        default: 1,
        min: 0
    },
    notes: {
        type: String,
        default: '',
        trim: true
    }
}, {
    timestamps: true
});

// אינדקס ייחודי המאפשר ביצוע Upsert אטומי לכל שעה וכתבה
viewStatSchema.index({ article: 1, timeBucket: 1 }, { unique: true });
viewStatSchema.index({ article: 1, viewedAt: 1 });

const ViewStat = mongoose.model('ViewStat', viewStatSchema);

module.exports = ViewStat;
