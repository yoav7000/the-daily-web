const Comment = require('../models/Comment');

/**
 * מנגנון הגבלת תגובות (Anti-Spam Rate Limiter)
 * דרישת פרויקט: חסימת אורח מלהגיב יותר מ-3 תגובות בדקה מאותו מכשיר/IP.
 * 
 * היתרון בבדיקה מול מסד הנתונים:
 * 1. עמידות מלאה ל-Restart של השרת - המידע נשמר במסד הנתונים ולא מתאפס באתחול.
 * 2. אינדקס משולב { clientIp: 1, createdAt: -1 } מבטיח ביצועים מהירים במיוחד.
 */
const commentRateLimiter = async (req, res, next) => {
    try {
        // זיהוי ה-IP או המכשיר של השולח
        let clientIp = req.headers['x-forwarded-for'] || 
                       req.socket.remoteAddress || 
                       req.ip || 
                       '127.0.0.1';

        // טיפול במחרוזת של מספר כתובות IP במקרה של פרוקסי
        if (typeof clientIp === 'string' && clientIp.includes(',')) {
            clientIp = clientIp.split(',')[0].trim();
        }

        // נרמול כתובת localhost ב-IPv6
        if (clientIp === '::1' || clientIp === '::ffff:127.0.0.1') {
            clientIp = '127.0.0.1';
        }

        // אפשרות לתמיכה במזהה מכשיר ייעודי מה-Header אם קיים
        const deviceId = req.headers['x-device-id'];
        const clientIdentifier = deviceId ? `${clientIp}_${deviceId}` : clientIp;

        // חלון זמן של 60 שניות אחורה
        const windowMs = 60 * 1000;
        const windowStartTime = new Date(Date.now() - windowMs);

        // ספירת כמות התגובות שפורסמו מחשבון/מכשיר זה בדקה האחרונה
        const recentCommentsCount = await Comment.countDocuments({
            clientIp: clientIdentifier,
            createdAt: { $gte: windowStartTime }
        });

        // בדיקה האם המשתמש עבר את מכסת 3 התגובות
        if (recentCommentsCount >= 3) {
            // מציאת התגובה הישנה ביותר בחלון כדי לחשב במדויק מתי ייפתח החלון מחדש
            const oldestInWindow = await Comment.findOne({
                clientIp: clientIdentifier,
                createdAt: { $gte: windowStartTime }
            }).sort({ createdAt: 1 }).select('createdAt');

            let retryAfterSeconds = 60;
            if (oldestInWindow && oldestInWindow.createdAt) {
                const msRemaining = (oldestInWindow.createdAt.getTime() + windowMs) - Date.now();
                retryAfterSeconds = Math.max(1, Math.ceil(msRemaining / 1000));
            }

            res.set('Retry-After', String(retryAfterSeconds));
            return res.status(429).json({
                success: false,
                message: 'חריגה ממגבלת התגובות: ניתן לפרסם עד 3 תגובות בדקה מאותו מכשיר. אנא המתן מעט ונסה שוב.',
                limit: 3,
                currentCount: recentCommentsCount,
                retryAfterSeconds
            });
        }

        // העברת מזהה הלקוח אל ה-Request להמשך הטיפול
        req.clientIdentifier = clientIdentifier;
        next();
    } catch (error) {
        console.error('Error in commentRateLimiter:', error);
        // במקרה של שגיאה בלתי צפויה במנגנון ההגבלה, נאפשר לבקשה להמשיך כדי לא להשבית את השירות
        next();
    }
};

module.exports = commentRateLimiter;
