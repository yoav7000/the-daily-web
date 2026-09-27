const mongoose = require('mongoose');

const viewStatSchema = new mongoose.Schema({
    article: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Article',
        required: [true, 'Article reference is required'],
        index: true
    },
    viewedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    // Optional hourly bucket key (e.g., "2026-09-29-14") for high throughput aggregation
    timeBucket: {
        type: String,
        index: true
    },
    viewCount: {
        type: Number,
        default: 1
    }
}, {
    timestamps: true
});

viewStatSchema.index({ article: 1, viewedAt: 1 });
viewStatSchema.index({ article: 1, timeBucket: 1 });

const ViewStat = mongoose.model('ViewStat', viewStatSchema);

module.exports = ViewStat;
