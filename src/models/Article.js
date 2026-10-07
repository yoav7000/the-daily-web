const mongoose = require('mongoose');
const { ARTICLE_STATUS, ARTICLE_CATEGORIES, DEFAULT_ARTICLE_IMAGE } = require('../constants/articleConstants');

/**
 * Draft subdocument schema for editing published articles
 * When a published article is being edited, its live published version remains untouched
 * until the editor reviews and approves the new draft version.
 */
const draftVersionSchema = new mongoose.Schema({
    title: {
        type: String,
        trim: true
    },
    summary: {
        type: String,
        trim: true
    },
    content: {
        type: String
    },
    category: {
        type: String,
        enum: ARTICLE_CATEGORIES
    },
    mainImage: {
        type: String,
        trim: true
    },
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
    title: {
        type: String,
        required: [true, 'Article title is required'],
        trim: true,
        maxlength: [300, 'Title cannot exceed 300 characters']
    },
    summary: {
        type: String,
        trim: true,
        maxlength: [600, 'Summary cannot exceed 600 characters'],
        default: ''
    },
    content: {
        type: String,
        required: [true, 'Article content is required']
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        enum: {
            values: ARTICLE_CATEGORIES,
            message: '{VALUE} is not a valid category'
        }
    },
    mainImage: {
        type: String,
        trim: true,
        default: DEFAULT_ARTICLE_IMAGE
    },
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

// Full-text search index on title, summary and content
articleSchema.index({
    title: 'text',
    summary: 'text',
    content: 'text'
}, {
    weights: {
        title: 10,
        summary: 5,
        content: 1
    },
    name: 'ArticleTextIndex'
});

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
