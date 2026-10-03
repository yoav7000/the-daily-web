const Comment = require('../models/Comment');

const MAX_COMMENTS = 3;
const WINDOW_MS = 60 * 1000;

/**
 * מנגנון הגבלת תגובות (Anti-Spam Rate Limiter)
 * דרישת פרויקט: חסימת אורח מלהגיב יותר מ-3 תגובות בדקה מאותו מכשיר/IP.
 *
 * - הזיהוי מבוסס על req.ip בלבד. כותרות שהלקוח שולח (X-Forwarded-For, מזהה מכשיר) אינן מהימנות
 *   ולכן לא נקראות. מאחורי פרוקסי אמיתי יש להגדיר TRUST_PROXY (ראו app.js).
 * - הספירה מתבצעת מול מסד הנתונים, ולכן עמידה ל-Restart של השרת.
 * - בקשות מאותו IP מטופלות אחת אחרי השנייה, כך ששליחה של כמה בקשות במקביל לא עוקפת את הספירה.
 */

// תור בקשות לכל IP: הבקשה הבאה מתחילה רק אחרי שהקודמת סיימה (נשמרה או נדחתה)
const queues = new Map();

const enterQueue = (key) => {
    const previous = queues.get(key) || Promise.resolve();
    let leave;
    const turn = new Promise((resolve) => { leave = resolve; });
    const tail = previous.then(() => turn);
    queues.set(key, tail);
    tail.then(() => {
        if (queues.get(key) === tail) {
            queues.delete(key);
        }
    });
    return previous.then(() => leave);
};

const normalizeIp = (ip) => {
    if (!ip || ip === '::1') {
        return '127.0.0.1';
    }
    return ip.replace(/^::ffff:/, '');
};

const commentRateLimiter = async (req, res, next) => {
    const clientIdentifier = normalizeIp(req.ip || req.socket.remoteAddress);
    const leave = await enterQueue(clientIdentifier);

    // משחררים את התור כשהתגובה נשלחה ללקוח (או שהחיבור נסגר)
    let released = false;
    const release = () => {
        if (!released) {
            released = true;
            leave();
        }
    };
    res.on('finish', release);
    res.on('close', release);

    try {
        const windowStartTime = new Date(Date.now() - WINDOW_MS);

        const recentComments = await Comment.find({
            clientIp: clientIdentifier,
            createdAt: { $gte: windowStartTime }
        }).sort({ createdAt: 1 }).select('createdAt').lean();

        if (recentComments.length >= MAX_COMMENTS) {
            // החלון ייפתח מחדש כשהתגובה הישנה ביותר שבחלון "תצא" ממנו
            const msRemaining = recentComments[0].createdAt.getTime() + WINDOW_MS - Date.now();
            const retryAfterSeconds = Math.max(1, Math.ceil(msRemaining / 1000));

            res.set('Retry-After', String(retryAfterSeconds));
            return res.status(429).json({
                success: false,
                message: 'חריגה ממגבלת התגובות: ניתן לפרסם עד 3 תגובות בדקה מאותו מכשיר. אנא המתן מעט ונסה שוב.',
                limit: MAX_COMMENTS,
                currentCount: recentComments.length,
                retryAfterSeconds
            });
        }

        req.clientIdentifier = clientIdentifier;
        next();
    } catch (error) {
        release();
        next(error);
    }
};

module.exports = commentRateLimiter;
