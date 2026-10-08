const ViewStat = require('../models/ViewStat');
const Article = require('../models/Article');
const { ARTICLE_STATUS } = require('../constants/articleConstants');
const { logOperation } = require('../middleware/requestLogger');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { cleanText } = require('../utils/text');
const { buildSearchFilter } = require('../utils/search');

const isValidViewCount = (value) => Number.isInteger(value) && value >= 0;

/**
 * "2026-10-07-14" -> the start of that hour. Returns null when the text is not a real date and hour.
 */
const parseTimeBucket = (bucket) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})$/.exec(bucket);
    if (!match) {
        return null;
    }
    const [year, month, day, hour] = match.slice(1).map(Number);
    const date = new Date(year, month - 1, day, hour);
    const isRealDate = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && date.getHours() === hour;
    return isRealDate ? date : null;
};

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

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_GRAPH_POINTS = 400;

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * סדרת זמן רציפה לגרף: שעות ללא צפיות מופיעות כ-0, כדי שציר הזמן ישקף את המציאות.
 * הרזולוציה גדלה (שעה / יום / שבוע) כשהתקופה ארוכה, כדי שלא יישלחו אלפי נקודות לדפדפן.
 */
const buildTimeline = (stats, startMs, endMs) => {
    const step = [HOUR_MS, DAY_MS, 7 * DAY_MS].find((ms) => (endMs - startMs) / ms < MAX_GRAPH_POINTS) || 7 * DAY_MS;
    const origin = new Date(startMs).setMinutes(0, 0, 0);
    const indexOf = (ms) => Math.max(0, Math.floor((ms - origin) / step));

    const points = Array.from({ length: indexOf(endMs) + 1 }, (_, i) => ({ t: origin + i * step, views: 0 }));
    stats.forEach((stat) => {
        const point = points[Math.min(indexOf(new Date(stat.viewedAt).getTime()), points.length - 1)];
        point.views += stat.viewCount;
    });

    const labels = points.map(({ t }) => {
        const d = new Date(t);
        const date = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
        return step === HOUR_MS ? `${date} ${pad2(d.getHours())}:00` : date;
    });

    return { points, labels, views: points.map((p) => p.views), indexOf, granularity: step === HOUR_MS ? 'hour' : (step === DAY_MS ? 'day' : 'week') };
};

/**
 * נקודות הציון של הכתבה: הפרסום הראשוני ואישורי העדכונים של העורך.
 * בפרסום ראשוני נרשמת גם רשומה ב-revisionsHistory (באותו רגע כמו publishedAt),
 * לכן היא נחשבת לפרסום ולא לעדכון, כדי שלא תופיע נקודה כפולה.
 */
const buildMilestones = (article) => {
    const publishedMs = article.publishedAt ? new Date(article.publishedAt).getTime() : null;
    const milestones = [];
    let updateNumber = 0;

    if (publishedMs !== null) {
        milestones.push({
            type: 'INITIAL_PUBLISH',
            title: 'פרסום ראשוני',
            timestamp: article.publishedAt,
            timeBucket: getTimeBucketKey(article.publishedAt),
            description: 'הכתבה אושרה ופורסמה לראשונה לציבור'
        });
    }

    (article.revisionsHistory || []).forEach((rev) => {
        // approving the first publication stores publishedAt and this entry at the same moment (allow clock rounding)
        const isInitialPublishEntry = publishedMs !== null && Math.abs(new Date(rev.approvedAt).getTime() - publishedMs) < 1000;
        if (isInitialPublishEntry) {
            milestones[0].editorName = rev.approvedBy ? rev.approvedBy.fullName : 'עורך';
            return;
        }
        updateNumber += 1;
        milestones.push({
            type: 'REVISION_UPDATE',
            title: `עדכון גרסה #${updateNumber}`,
            timestamp: rev.approvedAt,
            timeBucket: getTimeBucketKey(rev.approvedAt),
            editorName: rev.approvedBy ? rev.approvedBy.fullName : 'עורך',
            description: rev.changesSummary || 'אישור שינויים ועדכון תוכן הכתבה'
        });
    });

    return milestones.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

/**
 * השוואת קצב הצפיות (צפיות לשעה) לפני ואחרי העדכון האחרון.
 * הממוצע מחושב על כל השעות שחלפו, כולל שעות בלי צפיות.
 */
const buildImpactAnalysis = (stats, lastUpdate, startMs, endMs) => {
    const updateMs = new Date(lastUpdate.timestamp).getTime();

    let viewsBeforeUpdate = 0;
    let viewsAfterUpdate = 0;
    stats.forEach((stat) => {
        if (new Date(stat.viewedAt).getTime() < updateMs) {
            viewsBeforeUpdate += stat.viewCount;
        } else {
            viewsAfterUpdate += stat.viewCount;
        }
    });

    const avgHourlyBefore = viewsBeforeUpdate / Math.max(1, (updateMs - startMs) / HOUR_MS);
    const avgHourlyAfter = viewsAfterUpdate / Math.max(1, (endMs - updateMs) / HOUR_MS);

    let percentageChange = 0;
    if (avgHourlyBefore > 0) {
        percentageChange = ((avgHourlyAfter - avgHourlyBefore) / avgHourlyBefore) * 100;
    } else if (avgHourlyAfter > 0) {
        percentageChange = 100;
    }

    return {
        lastUpdateTimestamp: lastUpdate.timestamp,
        lastUpdateTitle: lastUpdate.title,
        viewsBeforeUpdate,
        viewsAfterUpdate,
        avgHourlyBefore: Number(avgHourlyBefore.toFixed(1)),
        avgHourlyAfter: Number(avgHourlyAfter.toFixed(1)),
        percentageChange: Number(percentageChange.toFixed(1)),
        isPositiveImpact: percentageChange >= 0
    };
};

/**
 * שליפת נתוני גרף Impact Analytics עבור עורך
 * GET /api/analytics/article/:articleId
 * מחזיר ציר זמן רציף של צפיות, נקודות פרסום ועדכון (עם המיקום שלהן על הגרף),
 * והשוואת קצב הצפיות לפני ואחרי העדכון האחרון
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

        const stats = await ViewStat.find({ article: articleId })
            .sort({ viewedAt: 1 })
            .lean();

        const milestones = buildMilestones(article);

        // הגרף מתחיל בפרסום (או בנקודה הראשונה שיש לה נתונים) ונמשך עד עכשיו
        const times = [
            ...stats.map((s) => new Date(s.viewedAt).getTime()),
            ...milestones.map((m) => new Date(m.timestamp).getTime())
        ];
        const nowMs = Date.now();
        const startMs = times.length > 0 ? Math.min(...times) : nowMs;
        const endMs = Math.max(nowMs, ...times);

        const timeline = buildTimeline(stats, startMs, endMs);
        milestones.forEach((m) => {
            m.pointIndex = timeline.indexOf(new Date(m.timestamp).getTime());
        });

        const totalViews = stats.reduce((sum, s) => sum + s.viewCount, 0);

        // יש מה להשוות רק כשהיה לפחות עדכון אחד אחרי הפרסום הראשוני
        const updates = milestones.filter((m) => m.type === 'REVISION_UPDATE');
        const impactAnalysis = updates.length > 0
            ? buildImpactAnalysis(stats, updates[updates.length - 1], article.publishedAt ? new Date(article.publishedAt).getTime() : startMs, endMs)
            : null;

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
                granularity: timeline.granularity,
                labels: timeline.labels,
                views: timeline.views,
                timestamps: timeline.points.map((p) => p.t),
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
        const bucketStart = parseTimeBucket(bucket);
        if (!bucketStart) {
            return res.status(400).json({ success: false, message: 'פורמט השעה חייב להיות YYYY-MM-DD-HH, לדוגמה 2026-10-07-14' });
        }

        const article = await Article.exists({ _id: cleanText(articleId) });
        if (!article) {
            return res.status(404).json({ success: false, message: 'הכתבה המבוקשת לא נמצאה' });
        }

        const stat = new ViewStat({
            article: articleId,
            timeBucket: bucket,
            viewedAt: bucketStart, // the graph plots the record at its own hour, not at the moment it was typed in
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

        Object.assign(query, buildSearchFilter(search, ['timeBucket', 'notes']));

        const { page, limit, skip } = parsePagination(req.query, 50);

        const [stats, totalCount] = await Promise.all([
            ViewStat.find(query)
                .populate('article', 'title category')
                .sort({ viewedAt: -1, _id: -1 })
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
