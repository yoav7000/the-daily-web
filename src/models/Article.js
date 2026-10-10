const mongoose = require('mongoose');
const { ARTICLE_STATUS, ARTICLE_CATEGORIES, DEFAULT_ARTICLE_IMAGE } = require('../constants/articleConstants');

/**
 * A draft may be incomplete while the reporter writes it (autosave must never lose work because the title
 * is still empty). Title and content become required once the version is handed to the editor or published.
 */
const SUBMITTED_STATUSES = [ARTICLE_STATUS.PENDING_APPROVAL, ARTICLE_STATUS.PUBLISHED];
function isSubmitted() {
    return SUBMITTED_STATUSES.includes(this.status);
}

/**
 * The fields a reporter writes. The single place their rules live: used both by the live article and by the
 * pending update of a published article (draftVersion), so the two can never disagree.
 * cast: false refuses a value of the wrong type (a number or an object as the title) instead of converting it.
 */
const editableFields = () => ({
    title: {
        type: String,
        cast: false,
        trim: true,
        required: [isSubmitted, 'כותרת הכתבה היא שדה חובה'],
        maxlength: [300, 'הכותרת יכולה להכיל עד 300 תווים']
    },
    summary: {
        type: String,
        cast: false,
        trim: true,
        maxlength: [600, 'התקציר יכול להכיל עד 600 תווים'],
        default: ''
    },
    content: {
        type: String,
        cast: false,
        required: [isSubmitted, 'תוכן הכתבה הוא שדה חובה']
    },
    category: {
        type: String,
        cast: false,
        trim: true,
        required: [true, 'יש לבחור קטגוריה'],
        enum: { values: ARTICLE_CATEGORIES, message: 'קטגוריה לא תקינה: {VALUE}' }
    },
    mainImage: {
        type: String,
        cast: false,
        trim: true,
        default: DEFAULT_ARTICLE_IMAGE
    }
});

/**
 * Draft subdocument schema for editing published articles
 * When a published article is being edited, its live published version remains untouched
 * until the editor reviews and approves the new draft version.
 */
const draftVersionSchema = new mongoose.Schema({
    ...editableFields(),
    status: {
        type: String,
        enum: [
            ARTICLE_STATUS.DRAFT,
            ARTICLE_STATUS.PENDING_APPROVAL,
            ARTICLE_STATUS.REVISION_REQUESTED
        ],
        default: ARTICLE_STATUS.DRAFT
    },
    editorFeedback: {
        type: String,
        default: null
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

/**
 * Revisions history schema for tracking approval timestamps
 * Crucial for the Impact Analytics graph requirement (correlating view spikes with publication timestamps)
 */
const revisionHistorySchema = new mongoose.Schema({
    approvedAt: {
        type: Date,
        default: Date.now,
        required: true
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    changesSummary: {
        type: String,
        default: 'Article published/updated'
    }
}, { _id: false });

const articleSchema = new mongoose.Schema({
    ...editableFields(),
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Author is required'],
        index: true
    },
    status: {
        type: String,
        enum: Object.values(ARTICLE_STATUS),
        default: ARTICLE_STATUS.DRAFT,
        index: true
    },
    editorFeedback: {
        type: String,
        default: null
    },
    publishedAt: {
        type: Date,
        default: null,
        index: true
    },
    lastAutoSavedAt: {
        type: Date,
        default: null
    },
    revisionsHistory: [revisionHistorySchema],
    draftVersion: {
        type: draftVersionSchema,
        default: null
    }
}, {
    timestamps: true
});

// Compound indexes for optimal performance as database scales to thousands of articles
articleSchema.index({ status: 1, publishedAt: -1 });
articleSchema.index({ author: 1, status: 1 });
articleSchema.index({ category: 1, status: 1, publishedAt: -1 });

/**
 * Helper to get the working content for a reporter
 * If published and a draft exists, returns the draft.
 * Otherwise returns the main document.
 */
articleSchema.methods.getWorkingCopy = function () {
    if (this.status === ARTICLE_STATUS.PUBLISHED && this.draftVersion) {
        return {
            _id: this._id,
            author: this.author,
            isPublished: true,
            hasPendingChanges: true,
            status: this.draftVersion.status,
            editorFeedback: this.draftVersion.editorFeedback,
            title: this.draftVersion.title,
            summary: this.draftVersion.summary,
            content: this.draftVersion.content,
            category: this.draftVersion.category,
            mainImage: this.draftVersion.mainImage,
            lastAutoSavedAt: this.draftVersion.updatedAt || this.lastAutoSavedAt,
            publishedAt: this.publishedAt,
            publishedVersion: {
                title: this.title,
                summary: this.summary,
                content: this.content,
                category: this.category,
                mainImage: this.mainImage
            }
        };
    }

    return {
        _id: this._id,
        author: this.author,
        isPublished: this.status === ARTICLE_STATUS.PUBLISHED,
        hasPendingChanges: false,
        status: this.status,
        editorFeedback: this.editorFeedback,
        title: this.title,
        summary: this.summary,
        content: this.content,
        category: this.category,
        mainImage: this.mainImage,
        lastAutoSavedAt: this.lastAutoSavedAt,
        publishedAt: this.publishedAt
    };
};

const Article = mongoose.model('Article', articleSchema);

module.exports = Article;
