const ViewStat = require('../models/ViewStat');
const Article = require('../models/Article');
const { ARTICLE_STATUS } = require('../constants/articleConstants');
const { logOperation } = require('../middleware/requestLogger');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { cleanText } = require('../utils/text');

const isValidViewCount = (value) => Number.isInteger(value) && value >= 0;

/**
 * פונקציית עזר ליצירת מפתח דלי זמן שעתי
 * פורמט: YYYY-MM-DD-HH (לדוגמה: 2026-09-30-11)
 */
const getTimeBucketKey = (date = new Date()) => {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}-${hh}`;
};

/**
 * רישום צפייה בכתבה (איסוף מותאם לעומס כבד)
 * מבצע Upsert אטומי עם $inc כדי לחסוך נעילות ומשאבי I/O
 */
const recordViewInternal = async (articleId, viewDate = new Date()) => {
    try {
        const timeBucket = getTimeBucketKey(viewDate);
        const bucketStart = new Date(viewDate);
        bucketStart.setMinutes(0, 0, 0);

        await ViewStat.updateOne(
            { article: articleId, timeBucket },
            {
                $inc: { viewCount: 1 },
                $setOnInsert: {
                    viewedAt: bucketStart,
                    article: articleId,
                    notes: `צפיות עבור שעה ${timeBucket}`
                }
            },
            { upsert: true }
        );
        return true;
    } catch (err) {
        console.error('Error recording view in ViewStat:', err);
        return false;
    }
};

/**
 * נקודת קצה לרישום צפייה (POST /api/analytics/view/:articleId)
 */
const recordView = async (req, res, next) => {
    try {
        const { articleId } = req.params;

        const article = await Article.findById(articleId).select('status');
        if (!article) {
            return res.status(404).json({ success: false, message: 'הכתבה לא נמצאה' });
        }

        if (article.status !== ARTICLE_STATUS.PUBLISHED) {
            return res.status(400).json({ success: false, message: 'לא ניתן לרשום צפייה עבור כתבה שטרם פורסמה' });
        }

        await recordViewInternal(articleId);

        return res.status(200).json({
            success: true,
            message: 'הצפייה נרשמה בהצלחה'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * שליפת נתוני גרף Impact Analytics עבור עורך
 * GET /api/analytics/article/:articleId
 * מחזיר ציר זמן של צפיות, סימון נקודות אישור ועדכון גרסה,
 * והשוואת היקף הצפיות לפני ואחרי כל עדכון
 */
const getArticleImpactAnalytics = async (req, res, next) => {
    try {
        const { articleId } = req.params;

        const article = await Article.findById(articleId)
            .populate('author', 'fullName username')
            .populate('revisionsHistory.approvedBy', 'fullName username')
            .lean();

        if (!article) {
            return res.status(404).json({
                success: false,
                message: 'הכתבה המבוקשת לא נמצאה'
            });
        }

        // שליפת כל דליי הצפייה לאורך ציר הזמן, ממוינים מהישן לחדש
        const stats = await ViewStat.find({ article: articleId })
            .sort({ viewedAt: 1 })
            .lean();

        // הכנת הנתונים עבור גרף Chart.js
        const timelineLabels = [];
        const viewCounts = [];
        let totalViews = 0;

        stats.forEach((s) => {
            const dateObj = new Date(s.viewedAt);
            const label = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')} ${String(dateObj.getHours()).padStart(2, '0')}:00`;
            timelineLabels.push(label);
            viewCounts.push(s.viewCount);
            totalViews += s.viewCount;
        });

        // נקודות ציון של פרסום ועדכונים (Milestones)
        const milestones = [];

        // 1. נקודת פרסום ראשוני
        if (article.publishedAt) {
            milestones.push({
                type: 'INITIAL_PUBLISH',
                title: 'פרסום ראשוני',
                timestamp: article.publishedAt,
                timeBucket: getTimeBucketKey(article.publishedAt),
                description: 'הכתבה אושרה ופורסמה לראשונה לציבור'
            });
        }

        // 2. נקודות עדכון נוספות מההיסטוריה
        if (Array.isArray(article.revisionsHistory)) {
            article.revisionsHistory.forEach((rev, idx) => {
                milestones.push({
                    type: 'REVISION_UPDATE',
                    title: `עדכון גרסה #${idx + 1}`,
                    timestamp: rev.approvedAt,
                    timeBucket: getTimeBucketKey(rev.approvedAt),
                    editorName: rev.approvedBy ? rev.approvedBy.fullName : 'עורך',
                    description: rev.changesSummary || 'אישור שינויים ועדכון תוכן הכתבה'
                });
            });
        }

        // ניתוח השפעה (Impact Comparison): בדיקת שינוי בצפיות לפני ואחרי העדכון האחרון
        let impactAnalysis = null;
        if (milestones.length > 1) {
            const lastUpdate = milestones[milestones.length - 1];
            const updateTime = new Date(lastUpdate.timestamp).getTime();

            let viewsBeforeUpdate = 0;
            let countBucketsBefore = 0;
            let viewsAfterUpdate = 0;
            let countBucketsAfter = 0;

            stats.forEach((s) => {
                const statTime = new Date(s.viewedAt).getTime();
                if (statTime < updateTime) {
                    viewsBeforeUpdate += s.viewCount;
                    countBucketsBefore++;
                } else {
                    viewsAfterUpdate += s.viewCount;
                    countBucketsAfter++;
                }
            });

            const avgHourlyBefore = countBucketsBefore > 0 ? (viewsBeforeUpdate / countBucketsBefore).toFixed(1) : 0;
            const avgHourlyAfter = countBucketsAfter > 0 ? (viewsAfterUpdate / countBucketsAfter).toFixed(1) : 0;
            const percentageChange = avgHourlyBefore > 0 
                ? (((avgHourlyAfter - avgHourlyBefore) / avgHourlyBefore) * 100).toFixed(1)
                : 100;

            impactAnalysis = {
                lastUpdateTimestamp: lastUpdate.timestamp,
                lastUpdateTitle: lastUpdate.title,
                viewsBeforeUpdate,
                viewsAfterUpdate,
                avgHourlyBefore: Number(avgHourlyBefore),
                avgHourlyAfter: Number(avgHourlyAfter),
                percentageChange: Number(percentageChange),
                isPositiveImpact: Number(percentageChange) >= 0
            };
        }

        return res.status(200).json({
            success: true,
            article: {
                _id: article._id,
                title: article.title,
                category: article.category,
                author: article.author ? article.author.fullName : 'לא ידוע',
                publishedAt: article.publishedAt
            },
            totalViews,
            timeline: {
                labels: timelineLabels,
                views: viewCounts,
                rawStats: stats.map(s => ({
                    timeBucket: s.timeBucket,
                    viewedAt: s.viewedAt,
                    viewCount: s.viewCount
                }))
            },
            milestones,
            impactAnalysis
        });
    } catch (error) {
        next(error);
    }
};

/**
 * יצירת רשומת סטטיסטיקה ידנית (CRUD - Create)
 * POST /api/analytics
 */
const createViewStat = async (req, res, next) => {
    try {
        const { articleId, timeBucket, viewCount = 1, notes } = req.body;

        if (!articleId) {
            return res.status(400).json({ success: false, message: 'מזהה כתבה נדרש' });
        }

        if (!isValidViewCount(Number(viewCount))) {
            return res.status(400).json({ success: false, message: 'כמות צפיות חייבת להיות מספר שלם שאינו שלילי' });
        }

        const bucket = cleanText(timeBucket) || getTimeBucketKey(new Date());

        const stat = new ViewStat({
            article: articleId,
            timeBucket: bucket,
            viewCount: Number(viewCount),
            notes: cleanText(notes) || `רשומה ידנית עבור דלי ${bucket}`
        });

        await stat.save();

        logOperation('VIEW_STAT_CREATED', {
            statId: stat._id,
            articleId,
            timeBucket: bucket
        });

        return res.status(201).json({
            success: true,
            message: 'רשומת הסטטיסטיקה נוצרה בהצלחה',
            stat
        });
    } catch (error) {
        next(error);
    }
};

/**
 * קבלת כלל רשומות הסטטיסטיקה עם חיפוש ודפדוף (CRUD - Read / Search)
 * GET /api/analytics
 */
const getAllViewStats = async (req, res, next) => {
    try {
        const { search, articleId } = req.query;
        const query = {};

        if (articleId) {
            query.article = cleanText(articleId);
        }

        if (cleanText(search)) {
            query.$text = { $search: cleanText(search) };
        }

        const { page, limit, skip } = parsePagination(req.query, 50);

        const [stats, totalCount] = await Promise.all([
            ViewStat.find(query)
                .populate('article', 'title category')
                .sort({ viewedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ViewStat.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            stats,
            pagination: buildPagination(totalCount, page, limit)
        });
    } catch (error) {
        next(error);
    }
};

/**
 * קבלת רשומת סטטיסטיקה בודדת (CRUD - Read single)
 * GET /api/analytics/:id
 */
const getViewStatById = async (req, res, next) => {
    try {
        const stat = await ViewStat.findById(req.params.id).populate('article', 'title category');
        if (!stat) {
            return res.status(404).json({ success: false, message: 'רשומת הסטטיסטיקה לא נמצאה' });
        }

        return res.status(200).json({ success: true, stat });
    } catch (error) {
        next(error);
    }
};

/**
 * עדכון רשומת סטטיסטיקה (CRUD - Update)
 * PUT /api/analytics/:id
 */
const updateViewStat = async (req, res, next) => {
    try {
        const { viewCount, notes } = req.body;

        const stat = await ViewStat.findById(req.params.id);
        if (!stat) {
            return res.status(404).json({ success: false, message: 'רשומת הסטטיסטיקה לא נמצאה' });
        }

        if (viewCount !== undefined) {
            if (!isValidViewCount(Number(viewCount))) {
                return res.status(400).json({ success: false, message: 'כמות צפיות חייבת להיות מספר שלם שאינו שלילי' });
            }
            stat.viewCount = Number(viewCount);
        }

        if (notes !== undefined) {
            stat.notes = cleanText(notes);
        }

        await stat.save();

        logOperation('VIEW_STAT_UPDATED', { statId: stat._id, articleId: stat.article });

        return res.status(200).json({
            success: true,
            message: 'רשומת הסטטיסטיקה עודכנה בהצלחה',
            stat
        });
    } catch (error) {
        next(error);
    }
};

/**
 * מחיקת רשומת סטטיסטיקה (CRUD - Delete)
 * DELETE /api/analytics/:id
 */
const deleteViewStat = async (req, res, next) => {
    try {
        const stat = await ViewStat.findById(req.params.id);
        if (!stat) {
            return res.status(404).json({ success: false, message: 'רשומת הסטטיסטיקה לא נמצאה' });
        }

        await ViewStat.findByIdAndDelete(req.params.id);

        logOperation('VIEW_STAT_DELETED', { statId: req.params.id });

        return res.status(200).json({
            success: true,
            message: 'רשומת הסטטיסטיקה נמחקה בהצלחה'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * דירוג הכתבות הנצפות ביותר במערכת (Top Viewed Articles)
 * GET /api/analytics/overview/top
 */
const getTopArticles = async (req, res, next) => {
    try {
        const { limit } = parsePagination(req.query, 10);

        const topArticles = await ViewStat.aggregate([
            {
                $group: {
                    _id: '$article',
                    totalViews: { $sum: '$viewCount' }
                }
            },
            { $sort: { totalViews: -1 } },
            {
                $lookup: {
                    from: 'articles',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'articleDetails'
                }
            },
            { $unwind: '$articleDetails' },
            { $match: { 'articleDetails.status': ARTICLE_STATUS.PUBLISHED } },
            { $limit: limit },
            {
                $project: {
                    _id: 1,
                    totalViews: 1,
                    title: '$articleDetails.title',
                    category: '$articleDetails.category',
                    publishedAt: '$articleDetails.publishedAt',
                    mainImage: '$articleDetails.mainImage'
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            topArticles
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    recordViewInternal,
    recordView,
    getArticleImpactAnalytics,
    createViewStat,
    getAllViewStats,
    getViewStatById,
    updateViewStat,
    deleteViewStat,
    getTopArticles,
    getTimeBucketKey
};
