const ViewStat = require('../models/ViewStat');
const Article = require('../models/Article');
const { ARTICLE_STATUS } = require('../constants/articleConstants');
const { logOperation } = require('../middleware/requestLogger');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { cleanText } = require('../utils/text');
const { buildSearchFilter } = require('../utils/search');

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

// Live views are counted in 5-minute buckets: an hour is too coarse to tell views before an update from views after it
const VIEW_BUCKET_MINUTES = 5;

/**
 * The 5-minute bucket of a view: its start and its key, YYYY-MM-DD-HH-mm (for example 2026-09-30-11-05)
 */
const getViewBucket = (date = new Date()) => {
    const start = new Date(date);
    start.setMinutes(start.getMinutes() - (start.getMinutes() % VIEW_BUCKET_MINUTES), 0, 0);
    return { start, key: `${getTimeBucketKey(start)}-${String(start.getMinutes()).padStart(2, '0')}` };
};

/**
 * רישום צפייה בכתבה (איסוף מותאם לעומס כבד)
 * מבצע Upsert אטומי עם $inc כדי לחסוך נעילות ומשאבי I/O
 */
const recordViewInternal = async (articleId, viewDate = new Date()) => {
    try {
        const { start: bucketStart, key: timeBucket } = getViewBucket(viewDate);

        await ViewStat.updateOne(
            { article: articleId, timeBucket },
            {
                $inc: { viewCount: 1 },
                $setOnInsert: {
                    viewedAt: bucketStart,
                    article: articleId,
                    notes: `צפיות עבור ${timeBucket}`
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

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MAX_GRAPH_POINTS = 400;
const GRAPH_STEPS = [
    { ms: VIEW_BUCKET_MINUTES * MINUTE_MS, name: 'minute' },
    { ms: 15 * MINUTE_MS, name: 'minute' },
    { ms: HOUR_MS, name: 'hour' },
    { ms: DAY_MS, name: 'day' },
    { ms: WEEK_MS, name: 'week' }
];

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * The viewer's time zone, as Date#getTimezoneOffset gives it (minutes behind UTC; Israel is -180 / -120).
 * The graph's hours and days are the viewer's, not the server's (a server in a container usually runs in UTC).
 */
const parseTzOffset = (value) => {
    const offset = Number(value);
    return value !== undefined && value !== '' && Number.isInteger(offset) && Math.abs(offset) <= 14 * 60
        ? offset
        : new Date().getTimezoneOffset();
};

/**
 * How long one stored record covers: a live view record covers 5 minutes, a manual or demo record a whole hour
 * ("YYYY-MM-DD-HH"). The graph is never finer than its coarsest record, or an hour of views would look like one spike.
 */
const statSpanMs = (stat) => (/^\d{4}-\d{2}-\d{2}-\d{2}$/.test(stat.timeBucket || '') ? HOUR_MS : VIEW_BUCKET_MINUTES * MINUTE_MS);

/**
 * סדרת זמן רציפה לגרף: פרקי זמן ללא צפיות מופיעים כ-0, כדי שציר הזמן ישקף את המציאות.
 * הרזולוציה (5 דקות / רבע שעה / שעה / יום / שבוע) גדלה כשהתקופה ארוכה, כדי שלא יישלחו אלפי נקודות לדפדפן.
 * הנקודות מיושרות לשעון של הצופה (tzOffset), כך שיום מתחיל בחצות שלו.
 */
const buildTimeline = (stats, startMs, endMs, tzOffset) => {
    const coarsestRecord = stats.reduce((max, stat) => Math.max(max, statSpanMs(stat)), 0);
    const step = GRAPH_STEPS.find((s) => s.ms >= coarsestRecord && (endMs - startMs) / s.ms < MAX_GRAPH_POINTS)
        || GRAPH_STEPS[GRAPH_STEPS.length - 1];
    // local time = UTC - tzOffset; weeks start on Sunday (1/1/1970 was a Thursday)
    const shift = -tzOffset * MINUTE_MS + (step.ms === WEEK_MS ? 4 * DAY_MS : 0);
    const floorToStep = (ms) => ms - ((((ms + shift) % step.ms) + step.ms) % step.ms);
    const toLocal = (ms) => new Date(ms - tzOffset * MINUTE_MS); // read the viewer's clock through the UTC fields

    const origin = floorToStep(startMs);
    const positionOf = (ms) => Math.max(0, (ms - origin) / step.ms);
    const indexOf = (ms) => Math.floor(positionOf(ms));

    const points = Array.from({ length: indexOf(endMs) + 1 }, (_, i) => ({ t: origin + i * step.ms, views: 0 }));
    stats.forEach((stat) => {
        const point = points[Math.min(indexOf(new Date(stat.viewedAt).getTime()), points.length - 1)];
        point.views += stat.viewCount;
    });

    const labels = points.map(({ t }) => {
        const d = toLocal(t);
        const date = `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}`;
        return step.ms < DAY_MS ? `${date} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}` : date;
    });

    return { points, labels, views: points.map((p) => p.views), stepMs: step.ms, indexOf, positionOf, granularity: step.name };
};

/**
 * נקודות הציון של הכתבה: הפרסום הראשוני ואישורי העדכונים של העורך.
 * רק אישור של עורך נרשם ב-revisionsHistory: עריכה של הכתב שעוד לא אושרה אינה נקודת ציון.
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

    let initialPublishEntryFound = false;
    (article.revisionsHistory || []).forEach((rev) => {
        // approving the first publication stores publishedAt and this entry at the same moment (allow clock rounding).
        // Only one entry is the publication: an update approved right after it is still an update.
        const isInitialPublishEntry = !initialPublishEntryFound && publishedMs !== null
            && Math.abs(new Date(rev.approvedAt).getTime() - publishedMs) < 1000;
        if (isInitialPublishEntry) {
            initialPublishEntryFound = true;
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
 * רשומת צפיות שהתחילה לפני רגע האישור נספרת "לפני"; הגרף צובע לפי אותו כלל (firstPointAfterUpdate).
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
 * GET /api/analytics/article/:articleId?tzOffset=-180
 * מחזיר ציר זמן רציף של צפיות, נקודות פרסום ועדכון (עם המיקום המדויק שלהן על הגרף),
 * השוואת קצב הצפיות לפני ואחרי העדכון האחרון, ועדכון של הכתב שממתין לאישור (אם יש) - שאינו מסומן בגרף
 */
const getArticleImpactAnalytics = async (req, res, next) => {
    try {
        const { articleId } = req.params;
        const tzOffset = parseTzOffset(req.query.tzOffset);

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

        const timeline = buildTimeline(stats, startMs, endMs, tzOffset);
        milestones.forEach((m) => {
            const ms = new Date(m.timestamp).getTime();
            m.pointIndex = timeline.indexOf(ms);                        // the point whose period contains the milestone
            m.position = Number(timeline.positionOf(ms).toFixed(4));    // the exact moment, between the points
        });

        const totalViews = stats.reduce((sum, s) => sum + s.viewCount, 0);

        // יש מה להשוות רק כשהיה לפחות עדכון אחד שעורך אישר אחרי הפרסום הראשוני
        const updates = milestones.filter((m) => m.type === 'REVISION_UPDATE');
        const lastUpdate = updates[updates.length - 1];
        const impactAnalysis = lastUpdate
            ? buildImpactAnalysis(stats, lastUpdate, article.publishedAt ? new Date(article.publishedAt).getTime() : startMs, endMs)
            : null;
        if (impactAnalysis) {
            // the first point counted entirely "after" the update (the point holding the update itself is counted "before")
            const updateMs = new Date(lastUpdate.timestamp).getTime();
            const firstAfter = timeline.points.findIndex((p) => p.t >= updateMs);
            impactAnalysis.firstPointAfterUpdate = firstAfter === -1 ? timeline.points.length : firstAfter;
        }

        // a reporter's change to the published article that no editor approved yet: not live, so not a milestone
        const pendingUpdate = article.status === ARTICLE_STATUS.PUBLISHED && article.draftVersion
            ? { status: article.draftVersion.status, updatedAt: article.draftVersion.updatedAt || null }
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
                stepMinutes: timeline.stepMs / MINUTE_MS,
                tzOffset,
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
            impactAnalysis,
            pendingUpdate
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
            viewCount, // the ViewStat model checks it is a whole number of at least 0
            notes: notes || `רשומה ידנית עבור דלי ${bucket}`
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

        // the ViewStat model validates the new values
        if (viewCount !== undefined) stat.viewCount = viewCount;
        if (notes !== undefined) stat.notes = notes;

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
    getTimeBucketKey,
    getViewBucket
};
