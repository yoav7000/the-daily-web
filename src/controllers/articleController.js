const mongoose = require('mongoose');
const Article = require('../models/Article');
const ViewStat = require('../models/ViewStat');
const Comment = require('../models/Comment');
const { ARTICLE_STATUS, ARTICLE_CATEGORIES, DEFAULT_ARTICLE_IMAGE } = require('../constants/articleConstants');
const { logOperation } = require('../middleware/requestLogger');
const { recordViewInternal } = require('./analyticsController');
const { parsePagination, buildPagination, MAX_STAFF_LIMIT } = require('../utils/pagination');
const { normalizeStatus } = require('../utils/statusFilter');
const { cleanText, normalizeImageUrl } = require('../utils/text');
const { buildSearchFilter } = require('../utils/search');
const { sanitizeHtml } = require('../utils/sanitizeHtml');
const { buildViewedCondition } = require('../utils/viewedFilter');

/**
 * Helper to check if user has permission to modify an article
 * Author can modify their own article. Editor can modify any article.
 */
/**
 * Fields of a published article that are safe to show to the public (never includes draftVersion)
 */
const toPublicArticle = (article) => ({
    _id: article._id,
    title: article.title,
    summary: article.summary,
    content: article.content,
    category: article.category,
    mainImage: article.mainImage,
    author: article.author,
    publishedAt: article.publishedAt
});

/**
 * An article waiting for the editor is locked: edits after submitting would change what the editor reviews.
 * It becomes editable again when the editor returns it for revisions.
 */
const isLockedForEditing = (article) => {
    if (article.status === ARTICLE_STATUS.PENDING_APPROVAL) {
        return true;
    }
    return article.status === ARTICLE_STATUS.PUBLISHED
        && Boolean(article.draftVersion)
        && article.draftVersion.status === ARTICLE_STATUS.PENDING_APPROVAL;
};

const canModifyArticle = (article, user) => {
    if (user.role === 'editor') return true;
    return article.author.toString() === user._id.toString();
};

// ==========================================
// REPORTER CONTROLLERS
// ==========================================

/**
 * Create a new article (starts in "בהכנה" - DRAFT)
 * POST /api/articles
 */
const createArticle = async (req, res, next) => {
    try {
        const { title, summary, content, category, mainImage } = req.body;

        if (!cleanText(title)) {
            return res.status(400).json({ success: false, message: 'כותרת הכתבה היא שדה חובה' });
        }
        if (!cleanText(content)) {
            return res.status(400).json({ success: false, message: 'תוכן הכתבה הוא שדה חובה' });
        }
        if (!category || !ARTICLE_CATEGORIES.includes(category)) {
            return res.status(400).json({
                success: false,
                message: `קטגוריה לא תקינה. קטגוריות מורשות: ${ARTICLE_CATEGORIES.join(', ')}`
            });
        }

        const article = new Article({
            title: cleanText(title),
            summary: cleanText(summary),
            content: sanitizeHtml(content),
            category,
            mainImage: normalizeImageUrl(mainImage),
            author: req.user._id,
            status: ARTICLE_STATUS.DRAFT
        });

        await article.save();

        logOperation('ARTICLE_CREATED', {
            articleId: article._id,
            authorId: req.user._id,
            title: article.title
        });

        return res.status(201).json({
            success: true,
            message: 'הכתבה נוצרה בהצלחה ונשמרה במצב "בהכנה"',
            article
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Auto-Save draft API
 * PUT /api/articles/:id/autosave or POST /api/articles/autosave
 * Continuously saves work in background without explicit user "Save" action.
 * If article already published, auto-saves to draftVersion so live site is never altered!
 */
const autoSaveArticle = async (req, res, next) => {
    try {
        const articleId = req.params.id;
        const { title, summary, content, category, mainImage } = req.body;

        let article;

        const cleanCat = category !== undefined ? cleanText(category) : undefined;
        const validCat = cleanCat && ARTICLE_CATEGORIES.includes(cleanCat) ? cleanCat : undefined;

        if (articleId) {
            article = await Article.findById(articleId);
            if (!article) {
                return res.status(404).json({ success: false, message: 'הכתבה לא נמצאה' });
            }

            if (!canModifyArticle(article, req.user)) {
                return res.status(403).json({ success: false, message: 'אין לך הרשאה לערוך כתבה זו' });
            }

            if (isLockedForEditing(article)) {
                return res.status(409).json({
                    success: false,
                    message: 'הכתבה ממתינה לאישור עורך ונעולה לעריכה עד שהעורך יחזיר אותה או יאשר אותה'
                });
            }
        } else {
            // If no ID provided, initialize a new draft article
            article = new Article({
                title: cleanText(title) || 'טיוטה ללא כותרת',
                summary: cleanText(summary),
                content: sanitizeHtml(content) || '<p></p>',
                category: validCat || ARTICLE_CATEGORIES[0],
                mainImage: normalizeImageUrl(mainImage),
                author: req.user._id,
                status: ARTICLE_STATUS.DRAFT
            });
        }

        const now = new Date();

        // If article is already published, save to draftVersion to keep live content protected
        if (article.status === ARTICLE_STATUS.PUBLISHED) {
            if (!article.draftVersion) {
                // Initialize draftVersion from current published fields merged with new edits
                article.draftVersion = {
                    title: title !== undefined ? cleanText(title) : article.title,
                    summary: summary !== undefined ? cleanText(summary) : article.summary,
                    content: content !== undefined ? sanitizeHtml(content) : article.content,
                    category: validCat || article.category,
                    mainImage: mainImage !== undefined ? normalizeImageUrl(mainImage) : article.mainImage,
                    status: ARTICLE_STATUS.DRAFT,
                    updatedAt: now
                };
            } else {
                if (title !== undefined) article.draftVersion.title = cleanText(title);
                if (summary !== undefined) article.draftVersion.summary = cleanText(summary);
                if (content !== undefined) article.draftVersion.content = sanitizeHtml(content);
                if (validCat) article.draftVersion.category = validCat;
                if (mainImage !== undefined) article.draftVersion.mainImage = normalizeImageUrl(mainImage);
                article.draftVersion.updatedAt = now;
            }
        } else {
            // For unpublished articles, directly update the draft fields
            if (title !== undefined) article.title = cleanText(title);
            if (summary !== undefined) article.summary = cleanText(summary);
            if (content !== undefined) article.content = sanitizeHtml(content) || '<p></p>';
            if (validCat) article.category = validCat;
            if (mainImage !== undefined) article.mainImage = normalizeImageUrl(mainImage);
            article.lastAutoSavedAt = now;
        }

        await article.save();

        return res.status(200).json({
            success: true,
            message: 'נשמר אוטומטית בהצלחה',
            savedAt: now,
            articleId: article._id,
            isPublished: article.status === ARTICLE_STATUS.PUBLISHED,
            status: article.status === ARTICLE_STATUS.PUBLISHED && article.draftVersion ? article.draftVersion.status : article.status
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get reporter's own articles
 * GET /api/articles/my-articles
 */
const getMyArticles = async (req, res, next) => {
    try {
        const { status, category, search } = req.query;
        const query = { author: req.user._id };

        if (status) {
            query.status = normalizeStatus(status);
        }

        if (category) {
            query.category = cleanText(category);
        }

        Object.assign(query, buildSearchFilter(search, ['title', 'summary']));

        const { page, limit, skip } = parsePagination(req.query, 20, MAX_STAFF_LIMIT);
        const [articles, totalCount] = await Promise.all([
            Article.find(query)
                .sort({ updatedAt: -1, _id: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Article.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            articles,
            pagination: buildPagination(totalCount, page, limit)
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get single article for editing by reporter
 * GET /api/articles/:id/edit
 * Returns the latest working draft (if published and being edited, returns the draftVersion)
 */
const getArticleForEdit = async (req, res, next) => {
    try {
        const article = await Article.findById(req.params.id);
        if (!article) {
            return res.status(404).json({ success: false, message: 'הכתבה לא נמצאה' });
        }

        if (!canModifyArticle(article, req.user)) {
            return res.status(403).json({ success: false, message: 'אין לך הרשאה לגשת לכתבה זו' });
        }

        const workingCopy = article.getWorkingCopy();

        return res.status(200).json({
            success: true,
            article: workingCopy
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Submit article to Editor for approval ("ממתינה לאישור עורך")
 * POST /api/articles/:id/submit
 * Allowed from: "בהכנה" (DRAFT) or "הוחזרה לתיקונים" (REVISION_REQUESTED)
 */
const submitForApproval = async (req, res, next) => {
    try {
        const article = await Article.findById(req.params.id);
        if (!article) {
            return res.status(404).json({ success: false, message: 'הכתבה לא נמצאה' });
        }

        if (!canModifyArticle(article, req.user)) {
            return res.status(403).json({ success: false, message: 'אין לך הרשאה להגיש כתבה זו לאישור' });
        }

        // Case 1: Article is published and has a draftVersion
        if (article.status === ARTICLE_STATUS.PUBLISHED) {
            if (!article.draftVersion) {
                return res.status(400).json({
                    success: false,
                    message: 'לא בוצעו שינויים בכתבה זו להגשה לאישור'
                });
            }

            const currentDraftStatus = article.draftVersion.status;
            if (currentDraftStatus !== ARTICLE_STATUS.DRAFT && currentDraftStatus !== ARTICLE_STATUS.REVISION_REQUESTED) {
                return res.status(400).json({
                    success: false,
                    message: `מעבר לא מורשה. הטיוטה כבר נמצאת במצב "${currentDraftStatus}"`
                });
            }

            article.draftVersion.status = ARTICLE_STATUS.PENDING_APPROVAL;
            article.draftVersion.updatedAt = new Date();
            await article.save();

            logOperation('ARTICLE_UPDATE_SUBMITTED', {
                articleId: article._id,
                authorId: req.user._id,
                title: article.draftVersion.title
            });

            return res.status(200).json({
                success: true,
                message: 'השינויים הוגשו בהצלחה לאישור עורך. הגרסה הקודמת תמשיך להופיע באתר עד לאישור.',
                status: ARTICLE_STATUS.PENDING_APPROVAL
            });
        }

        // Case 2: Article is unpublished (in DRAFT or REVISION_REQUESTED)
        if (article.status !== ARTICLE_STATUS.DRAFT && article.status !== ARTICLE_STATUS.REVISION_REQUESTED) {
            return res.status(400).json({
                success: false,
                message: `מעבר לא מורשה. לא ניתן להגיש לאישור כתבה שנמצאת במצב "${article.status}"`
            });
        }

        // Validate mandatory fields before submitting for review
        if (!cleanText(article.title)) {
            return res.status(400).json({ success: false, message: 'כותרת הכתבה היא שדה חובה לפני הגשה לאישור' });
        }
        if (!cleanText(article.content)) {
            return res.status(400).json({ success: false, message: 'תוכן הכתבה הוא שדה חובה לפני הגשה לאישור' });
        }

        article.status = ARTICLE_STATUS.PENDING_APPROVAL;
        await article.save();

        logOperation('ARTICLE_SUBMITTED_FOR_APPROVAL', {
            articleId: article._id,
            authorId: req.user._id,
            title: article.title
        });

        return res.status(200).json({
            success: true,
            message: 'הכתבה הועברה בהצלחה למצב "ממתינה לאישור עורך"',
            status: article.status
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// EDITOR CONTROLLERS
// ==========================================

/**
 * Get all articles for Editor (with filters by status, author, category, search)
 * GET /api/articles/editor/all
 */
const getAllArticlesForEditor = async (req, res, next) => {
    try {
        const { status, category, author, search } = req.query;
        const query = {};

        if (status === 'pending_update') {
            // Articles that are published but have a draftVersion pending approval
            query.status = ARTICLE_STATUS.PUBLISHED;
            query['draftVersion.status'] = ARTICLE_STATUS.PENDING_APPROVAL;
        } else if (status === 'needs_review') {
            // Everything waiting for the editor: new submissions and updates to published articles
            query.$and = [{
                $or: [
                    { status: ARTICLE_STATUS.PENDING_APPROVAL },
                    { status: ARTICLE_STATUS.PUBLISHED, 'draftVersion.status': ARTICLE_STATUS.PENDING_APPROVAL }
                ]
            }];
        } else if (status) {
            query.status = normalizeStatus(status);
        }

        if (category) {
            query.category = cleanText(category);
        }

        if (author) {
            query.author = cleanText(author);
        }

        if (req.query.hasUpdates === 'true') {
            query['revisionsHistory.1'] = { $exists: true };
        }

        Object.assign(query, buildSearchFilter(search, ['title', 'summary']));

        const { page, limit, skip } = parsePagination(req.query, 20, MAX_STAFF_LIMIT);
        const [articles, totalCount] = await Promise.all([
            Article.find(query)
                .populate('author', 'fullName username role')
                .sort({ updatedAt: -1, _id: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Article.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            articles,
            pagination: buildPagination(totalCount, page, limit)
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get pending articles for editor review
 * GET /api/articles/editor/pending
 */
const getPendingArticlesForEditor = async (req, res, next) => {
    try {
        // Find articles where status is pending_approval OR published articles with draftVersion.status pending_approval
        const query = {
            $or: [
                { status: ARTICLE_STATUS.PENDING_APPROVAL },
                { status: ARTICLE_STATUS.PUBLISHED, 'draftVersion.status': ARTICLE_STATUS.PENDING_APPROVAL }
            ]
        };

        const articles = await Article.find(query)
            .populate('author', 'fullName username')
            .sort({ updatedAt: -1, _id: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            articles
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get single article review details for editor
 * GET /api/articles/editor/:id/review
 * Highlights current published vs pending draft for comparison/diff
 */
const getArticleReviewDetails = async (req, res, next) => {
    try {
        const article = await Article.findById(req.params.id)
            .populate('author', 'fullName username')
            .populate('revisionsHistory.approvedBy', 'fullName username');

        if (!article) {
            return res.status(404).json({ success: false, message: 'הכתבה לא נמצאה' });
        }

        const isPublishedUpdate = article.status === ARTICLE_STATUS.PUBLISHED && Boolean(article.draftVersion);

        return res.status(200).json({
            success: true,
            article: {
                _id: article._id,
                author: article.author,
                status: article.status,
                publishedAt: article.publishedAt,
                isPublishedUpdate,
                currentPublished: article.status === ARTICLE_STATUS.PUBLISHED ? {
                    title: article.title,
                    summary: article.summary,
                    content: article.content,
                    category: article.category,
                    mainImage: article.mainImage
                } : null,
                pendingVersion: isPublishedUpdate ? article.draftVersion : {
                    title: article.title,
                    summary: article.summary,
                    content: article.content,
                    category: article.category,
                    mainImage: article.mainImage,
                    status: article.status,
                    editorFeedback: article.editorFeedback
                },
                revisionsHistory: article.revisionsHistory || []
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Editor approves and publishes article
 * POST /api/articles/:id/approve
 * Moves from "ממתינה לאישור עורך" -> "פורסמה"
 */
const approveArticle = async (req, res, next) => {
    try {
        const article = await Article.findById(req.params.id);
        if (!article) {
            return res.status(404).json({ success: false, message: 'הכתבה לא נמצאה' });
        }

        const now = new Date();

        // Case 1: Approving update to already published article
        if (article.status === ARTICLE_STATUS.PUBLISHED) {
            if (!article.draftVersion || article.draftVersion.status !== ARTICLE_STATUS.PENDING_APPROVAL) {
                return res.status(400).json({
                    success: false,
                    message: 'אין גרסת טיוטה הממתינה לאישור עבור כתבה זו'
                });
            }

            // Promote draft version to published content
            article.title = article.draftVersion.title;
            article.summary = article.draftVersion.summary;
            article.content = article.draftVersion.content;
            article.category = article.draftVersion.category;
            article.mainImage = article.draftVersion.mainImage;

            // Record update point in revisionHistory (Required for Impact Analytics!)
            article.revisionsHistory.push({
                approvedAt: now,
                approvedBy: req.user._id,
                changesSummary: 'עדכון תוכן אושר ופורסם'
            });

            // Clear draft version
            article.draftVersion = null;
            await article.save();

            logOperation('ARTICLE_UPDATE_APPROVED', {
                articleId: article._id,
                editorId: req.user._id,
                title: article.title,
                timestamp: now
            });

            return res.status(200).json({
                success: true,
                message: 'העדכון אושר ופורסם בהצלחה לציבור',
                article
            });
        }

        // Case 2: Approving initial publication
        if (article.status !== ARTICLE_STATUS.PENDING_APPROVAL) {
            return res.status(400).json({
                success: false,
                message: `מעבר לא מורשה. לא ניתן לאשר כתבה שנמצאת במצב "${article.status}"`
            });
        }

        article.status = ARTICLE_STATUS.PUBLISHED;
        article.publishedAt = now;
        article.editorFeedback = null;

        article.revisionsHistory.push({
            approvedAt: now,
            approvedBy: req.user._id,
            changesSummary: 'פרסום ראשוני של הכתבה'
        });

        await article.save();

        logOperation('ARTICLE_PUBLISHED', {
            articleId: article._id,
            editorId: req.user._id,
            title: article.title,
            timestamp: now
        });

        return res.status(200).json({
            success: true,
            message: 'הכתבה אושרה ופורסמה בהצלחה באתר',
            article
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Editor returns article for revisions ("הוחזרה לתיקונים")
 * POST /api/articles/:id/reject
 * Mandates feedback comment explaining what needs fixing!
 */
const returnForRevisions = async (req, res, next) => {
    try {
        const { feedback } = req.body;

        if (!cleanText(feedback)) {
            return res.status(400).json({
                success: false,
                message: 'חובה לצרף הערת עורך המסבירה אילו תיקונים נדרשים'
            });
        }

        const article = await Article.findById(req.params.id);
        if (!article) {
            return res.status(404).json({ success: false, message: 'הכתבה לא נמצאה' });
        }

        // Case 1: Published article with draft update
        if (article.status === ARTICLE_STATUS.PUBLISHED) {
            if (!article.draftVersion || article.draftVersion.status !== ARTICLE_STATUS.PENDING_APPROVAL) {
                return res.status(400).json({
                    success: false,
                    message: 'אין עדכון הממתין לאישור עבור כתבה זו'
                });
            }

            article.draftVersion.status = ARTICLE_STATUS.REVISION_REQUESTED;
            article.draftVersion.editorFeedback = cleanText(feedback);
            article.draftVersion.updatedAt = new Date();
            await article.save();

            logOperation('ARTICLE_UPDATE_RETURNED_FOR_REVISIONS', {
                articleId: article._id,
                editorId: req.user._id,
                feedback: cleanText(feedback)
            });

            return res.status(200).json({
                success: true,
                message: 'העדכון הוחזר לכתב לתיקונים בצירוף הערות',
                status: ARTICLE_STATUS.REVISION_REQUESTED
            });
        }

        // Case 2: Unpublished article
        if (article.status !== ARTICLE_STATUS.PENDING_APPROVAL) {
            return res.status(400).json({
                success: false,
                message: `מעבר לא מורשה. לא ניתן להחזיר לתיקונים כתבה שאינה ממתינה לאישור (מצב נוכחי: "${article.status}")`
            });
        }

        article.status = ARTICLE_STATUS.REVISION_REQUESTED;
        article.editorFeedback = cleanText(feedback);
        await article.save();

        logOperation('ARTICLE_RETURNED_FOR_REVISIONS', {
            articleId: article._id,
            editorId: req.user._id,
            feedback: cleanText(feedback)
        });

        return res.status(200).json({
            success: true,
            message: 'הכתבה הוחזרה לכתב לתיקונים בצירוף הערות',
            status: article.status
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Editor direct edit of any article
 * PUT /api/articles/editor/:id
 */
const editorDirectEdit = async (req, res, next) => {
    try {
        const { title, summary, content, category, mainImage } = req.body;

        // A category that does not exist is an error, not something to skip quietly while reporting success
        if (category !== undefined && !ARTICLE_CATEGORIES.includes(category)) {
            return res.status(400).json({
                success: false,
                message: `קטגוריה לא תקינה. קטגוריות מורשות: ${ARTICLE_CATEGORIES.join(', ')}`
            });
        }

        const article = await Article.findById(req.params.id);
        if (!article) {
            return res.status(404).json({ success: false, message: 'הכתבה לא נמצאה' });
        }

        // A published article with an update in progress: the editor edits that update (the version they see
        // in the review), and readers keep the approved version until the editor approves it
        const editsPendingUpdate = article.status === ARTICLE_STATUS.PUBLISHED && Boolean(article.draftVersion);
        const target = editsPendingUpdate ? article.draftVersion : article;

        if (title !== undefined) target.title = cleanText(title);
        if (summary !== undefined) target.summary = cleanText(summary);
        if (content !== undefined) target.content = sanitizeHtml(content);
        if (category !== undefined) target.category = category;
        if (mainImage !== undefined) target.mainImage = normalizeImageUrl(mainImage);

        if (editsPendingUpdate) {
            article.draftVersion.updatedAt = new Date();
        } else if (article.status === ARTICLE_STATUS.PUBLISHED) {
            // The editor changed the live article: that is a published update, so it gets a marker on the Impact Analytics graph
            article.revisionsHistory.push({
                approvedAt: new Date(),
                approvedBy: req.user._id,
                changesSummary: 'עדכון ישיר של עורך'
            });
        }

        await article.save();

        logOperation('EDITOR_DIRECT_EDIT', {
            articleId: article._id,
            editorId: req.user._id,
            editedPendingUpdate: editsPendingUpdate
        });

        return res.status(200).json({
            success: true,
            message: 'הכתבה עודכנה בהצלחה על ידי עורך',
            article
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete article (Editor only)
 * DELETE /api/articles/:id
 */
const deleteArticle = async (req, res, next) => {
    try {
        const article = await Article.findById(req.params.id);
        if (!article) {
            return res.status(404).json({ success: false, message: 'הכתבה לא נמצאה' });
        }

        // An article's comments and view statistics mean nothing without it, so they go too
        const [removedComments, removedStats] = await Promise.all([
            Comment.deleteMany({ article: article._id }),
            ViewStat.deleteMany({ article: article._id })
        ]);
        await Article.findByIdAndDelete(req.params.id);

        logOperation('ARTICLE_DELETED', {
            removedComments: removedComments.deletedCount,
            removedViewStats: removedStats.deletedCount,
            articleId: req.params.id,
            editorId: req.user._id,
            title: article.title
        });

        return res.status(200).json({
            success: true,
            message: 'הכתבה נמחקה בהצלחה מהמערכת'
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================
// PUBLIC CONTROLLERS (Read-only for Readers)
// ==========================================

/**
 * Get published articles (Public Feed)
 * GET /api/articles/public
 * Always serves published articles ONLY, never exposes unapproved drafts
 */
const getPublicArticles = async (req, res, next) => {
    try {
        const { category, search, sort = 'newest' } = req.query;
        const query = { status: ARTICLE_STATUS.PUBLISHED };

        if (category) {
            query.category = cleanText(category);
        }

        if (req.query.hasUpdates === 'true') {
            query['revisionsHistory.1'] = { $exists: true };
        }

        Object.assign(query, buildSearchFilter(search, ['title', 'summary']));

        const viewedCondition = buildViewedCondition(req.query);
        if (viewedCondition) {
            query._id = viewedCondition;
        }

        // _id breaks ties between articles published at the same moment, so infinite scroll never repeats or skips one
        let sortOption = { publishedAt: -1, _id: -1 };
        if (sort === 'oldest') {
            sortOption = { publishedAt: 1, _id: 1 };
        }

        // Popularity: the database adds up each article's views and sorts, we only fetch the requested page
        if (sort === 'popular') {
            const { page, limit, skip } = parsePagination(req.query);

            // aggregate() does not cast ids for us like find() does
            const match = { ...query };
            if (match._id) {
                const toId = (id) => new mongoose.Types.ObjectId(id);
                match._id = match._id.$in ? { $in: match._id.$in.map(toId) } : { $nin: match._id.$nin.map(toId) };
            }

            const [pageOfArticles, totalCount] = await Promise.all([
                Article.aggregate([
                    { $match: match },
                    { $lookup: { from: ViewStat.collection.name, localField: '_id', foreignField: 'article', as: 'views' } },
                    { $addFields: { totalViews: { $sum: '$views.viewCount' } } },
                    { $sort: { totalViews: -1, publishedAt: -1, _id: -1 } },
                    { $skip: skip },
                    { $limit: limit },
                    { $project: { title: 1, summary: 1, category: 1, mainImage: 1, author: 1, publishedAt: 1, createdAt: 1, totalViews: 1 } }
                ]),
                Article.countDocuments(query)
            ]);

            const articles = await Article.populate(pageOfArticles, { path: 'author', select: 'fullName username' });

            return res.status(200).json({
                success: true,
                articles,
                pagination: buildPagination(totalCount, page, limit)
            });
        }

        const { page, limit, skip } = parsePagination(req.query);
        const [articles, totalCount] = await Promise.all([
            Article.find(query)
                .select('title summary category mainImage author publishedAt createdAt')
                .populate('author', 'fullName username')
                .sort(sortOption)
                .skip(skip)
                .limit(limit)
                .lean(),
            Article.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            articles,
            pagination: buildPagination(totalCount, page, limit)
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get single published article (Public View)
 * GET /api/articles/public/:id
 */
const getPublicArticleById = async (req, res, next) => {
    try {
        const article = await Article.findOne({
            _id: req.params.id,
            status: ARTICLE_STATUS.PUBLISHED
        }).populate('author', 'fullName username');

        if (!article) {
            return res.status(404).json({ success: false, message: 'הכתבה לא נמצאה או שטרם פורסמה' });
        }

        // דרישת פרויקט: כל כניסה לכתבה נלקחת בחשבון לצורך נתוני הצפייה והסטטיסטיקות
        recordViewInternal(article._id);

        // Return published content only (ignore any draftVersion)
        return res.status(200).json({
            success: true,
            article: toPublicArticle(article)
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Number of articles per status for the dashboard counters, computed by the database
 * (the dashboards only load one page of articles, so they cannot count them in the browser).
 */
const countByStatus = async (match = {}) => {
    const published = { ...match, status: ARTICLE_STATUS.PUBLISHED };
    const [grouped, pendingUpdates, revisionUpdates] = await Promise.all([
        Article.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
        Article.countDocuments({ ...published, 'draftVersion.status': ARTICLE_STATUS.PENDING_APPROVAL }),
        Article.countDocuments({ ...published, 'draftVersion.status': ARTICLE_STATUS.REVISION_REQUESTED })
    ]);

    const counts = Object.fromEntries(Object.values(ARTICLE_STATUS).map((status) => [status, 0]));
    grouped.forEach(({ _id, count }) => { counts[_id] = count; });

    return {
        total: Object.values(counts).reduce((sum, n) => sum + n, 0),
        ...counts,
        pendingUpdates, // published articles whose update waits for the editor
        revisionUpdates // published articles whose update was sent back for fixes
    };
};

/**
 * Counters for the editor dashboard
 * GET /api/articles/editor/stats
 */
const getEditorStats = async (req, res, next) => {
    try {
        return res.status(200).json({ success: true, stats: await countByStatus() });
    } catch (error) {
        next(error);
    }
};

/**
 * Counters for the reporter's own articles
 * GET /api/articles/my-stats
 */
const getMyStats = async (req, res, next) => {
    try {
        return res.status(200).json({ success: true, stats: await countByStatus({ author: req.user._id }) });
    } catch (error) {
        next(error);
    }
};

/**
 * Server-rendered article page (EJS) so search engines get the full content
 * GET /article/:id
 */
const renderArticlePage = async (req, res, next) => {
    try {
        const article = await Article.findOne({
            _id: req.params.id,
            status: ARTICLE_STATUS.PUBLISHED
        }).populate('author', 'fullName username');

        if (!article) {
            return res.status(404).render('error', {
                status: 404,
                heading: 'הכתבה לא נמצאה',
                message: 'הכתבה הוסרה, שטרם פורסמה או שהקישור שגוי.'
            });
        }

        recordViewInternal(article._id);

        res.render('article', { article: toPublicArticle(article), categories: ARTICLE_CATEGORIES });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createArticle,
    autoSaveArticle,
    getMyArticles,
    getArticleForEdit,
    submitForApproval,
    getAllArticlesForEditor,
    getPendingArticlesForEditor,
    getArticleReviewDetails,
    approveArticle,
    returnForRevisions,
    editorDirectEdit,
    deleteArticle,
    getPublicArticles,
    getPublicArticleById,
    getEditorStats,
    getMyStats,
    renderArticlePage
};
