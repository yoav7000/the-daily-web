const Article = require('../models/Article');
const { ARTICLE_STATUS, ARTICLE_CATEGORIES } = require('../constants/articleConstants');
const { logOperation } = require('../middleware/requestLogger');

/**
 * Helper to check if user has permission to modify an article
 * Author can modify their own article. Editor can modify any article.
 */
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

        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: 'כותרת הכתבה היא שדה חובה' });
        }
        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, message: 'תוכן הכתבה הוא שדה חובה' });
        }
        if (!category || !ARTICLE_CATEGORIES.includes(category)) {
            return res.status(400).json({
                success: false,
                message: `קטגוריה לא תקינה. קטגוריות מורשות: ${ARTICLE_CATEGORIES.join(', ')}`
            });
        }

        const article = new Article({
            title: title.trim(),
            summary: summary ? summary.trim() : '',
            content,
            category,
            mainImage: mainImage || '/images/default-article.jpg',
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

        if (articleId) {
            article = await Article.findById(articleId);
            if (!article) {
                return res.status(404).json({ success: false, message: 'הכתבה לא נמצאה' });
            }

            if (!canModifyArticle(article, req.user)) {
                return res.status(403).json({ success: false, message: 'אין לך הרשאה לערוך כתבה זו' });
            }
        } else {
            // If no ID provided, initialize a new draft article
            article = new Article({
                title: title && title.trim() ? title.trim() : 'טיוטה ללא כותרת',
                summary: summary ? summary.trim() : '',
                content: content || '',
                category: category && ARTICLE_CATEGORIES.includes(category) ? category : ARTICLE_CATEGORIES[0],
                mainImage: mainImage || '/images/default-article.jpg',
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
                    title: title !== undefined ? title.trim() : article.title,
                    summary: summary !== undefined ? summary.trim() : article.summary,
                    content: content !== undefined ? content : article.content,
                    category: category !== undefined && ARTICLE_CATEGORIES.includes(category) ? category : article.category,
                    mainImage: mainImage !== undefined ? mainImage : article.mainImage,
                    status: ARTICLE_STATUS.DRAFT,
                    updatedAt: now
                };
            } else {
                if (title !== undefined) article.draftVersion.title = title.trim();
                if (summary !== undefined) article.draftVersion.summary = summary.trim();
                if (content !== undefined) article.draftVersion.content = content;
                if (category !== undefined && ARTICLE_CATEGORIES.includes(category)) article.draftVersion.category = category;
                if (mainImage !== undefined) article.draftVersion.mainImage = mainImage;
                article.draftVersion.updatedAt = now;
            }
        } else {
            // For unpublished articles, directly update the draft fields
            if (title !== undefined) article.title = title.trim();
            if (summary !== undefined) article.summary = summary.trim();
            if (content !== undefined) article.content = content;
            if (category !== undefined && ARTICLE_CATEGORIES.includes(category)) article.category = category;
            if (mainImage !== undefined) article.mainImage = mainImage;
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
        const { status, category, search, page = 1, limit = 20 } = req.query;
        const query = { author: req.user._id };

        if (status) {
            query.status = status;
        }

        if (category) {
            query.category = category;
        }

        if (search && search.trim()) {
            query.$text = { $search: search.trim() };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [articles, totalCount] = await Promise.all([
            Article.find(query)
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Article.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            articles,
            pagination: {
                totalCount,
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
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
        if (!article.title || !article.title.trim()) {
            return res.status(400).json({ success: false, message: 'כותרת הכתבה היא שדה חובה לפני הגשה לאישור' });
        }
        if (!article.content || !article.content.trim()) {
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
        const { status, category, author, search, page = 1, limit = 20 } = req.query;
        const query = {};

        if (status) {
            if (status === 'pending_update') {
                // Articles that are published but have a draftVersion pending approval
                query.status = ARTICLE_STATUS.PUBLISHED;
                query['draftVersion.status'] = ARTICLE_STATUS.PENDING_APPROVAL;
            } else {
                query.status = status;
            }
        }

        if (category) {
            query.category = category;
        }

        if (author) {
            query.author = author;
        }

        if (search && search.trim()) {
            query.$text = { $search: search.trim() };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [articles, totalCount] = await Promise.all([
            Article.find(query)
                .populate('author', 'fullName username role')
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Article.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            articles,
            pagination: {
                totalCount,
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
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
            .sort({ updatedAt: -1 })
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
            .populate('author', 'fullName username');

        if (!article) {
            return res.status(404).json({ success: false, message: 'הכתבה לא נמצאה' });
        }

        const isPublishedUpdate = article.status === ARTICLE_STATUS.PUBLISHED && article.draftVersion;

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
                }
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

        if (!feedback || !feedback.trim()) {
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
            article.draftVersion.editorFeedback = feedback.trim();
            article.draftVersion.updatedAt = new Date();
            await article.save();

            logOperation('ARTICLE_UPDATE_RETURNED_FOR_REVISIONS', {
                articleId: article._id,
                editorId: req.user._id,
                feedback: feedback.trim()
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
        article.editorFeedback = feedback.trim();
        await article.save();

        logOperation('ARTICLE_RETURNED_FOR_REVISIONS', {
            articleId: article._id,
            editorId: req.user._id,
            feedback: feedback.trim()
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

        const article = await Article.findById(req.params.id);
        if (!article) {
            return res.status(404).json({ success: false, message: 'הכתבה לא נמצאה' });
        }

        if (title !== undefined) article.title = title.trim();
        if (summary !== undefined) article.summary = summary.trim();
        if (content !== undefined) article.content = content;
        if (category !== undefined && ARTICLE_CATEGORIES.includes(category)) article.category = category;
        if (mainImage !== undefined) article.mainImage = mainImage;

        await article.save();

        logOperation('EDITOR_DIRECT_EDIT', {
            articleId: article._id,
            editorId: req.user._id
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

        await Article.findByIdAndDelete(req.params.id);

        logOperation('ARTICLE_DELETED', {
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
        const { category, search, page = 1, limit = 20, sort = 'newest' } = req.query;
        const query = { status: ARTICLE_STATUS.PUBLISHED };

        if (category) {
            query.category = category;
        }

        if (search && search.trim()) {
            query.$text = { $search: search.trim() };
        }

        let sortOption = { publishedAt: -1 };
        if (sort === 'oldest') {
            sortOption = { publishedAt: 1 };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [articles, totalCount] = await Promise.all([
            Article.find(query)
                .select('title summary category mainImage author publishedAt createdAt')
                .populate('author', 'fullName username')
                .sort(sortOption)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Article.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            articles,
            pagination: {
                totalCount,
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
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

        // Return published content only (ignore any draftVersion)
        return res.status(200).json({
            success: true,
            article: {
                _id: article._id,
                title: article.title,
                summary: article.summary,
                content: article.content,
                category: article.category,
                mainImage: article.mainImage,
                author: article.author,
                publishedAt: article.publishedAt
            }
        });
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
    getPublicArticleById
};
