const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config();

const User = require('../models/User');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const ViewStat = require('../models/ViewStat');
const { ARTICLE_STATUS, ARTICLE_CATEGORIES } = require('../constants/articleConstants');
const { getTimeBucketKey } = require('../controllers/analyticsController');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/the-daily-web';

// תבניות כותרות ותכנים מגוונים לפי קטגוריות
const categoryTemplates = {
    'חדשות': [
        'הסכם היסטורי נחתם בוועידת הפסגה האזורית',
        'הרחבת רשת הרכבת הקלה במרכז: קווים חדשים אושרו',
        'היערכות מיוחדת לחורף: תוכנית החירום של הרשויות',
        'דו"ח המבקר חושף: שיפור משמעותי במענה לשירותי החירום',
        'פתיחת שנת הלימודים: אלפי תלמידים יחזרו מחר לכיתות'
    ],
    'טכנולוגיה': [
        'פריצת דרך ישראלית: פיתוח שבב בינה מלאכותית מהיר פי 10',
        'חוקרים הצליחו להאריך את חיי סוללות הליתיום ב-300%',
        'מהפכת הרכב האוטונומי: ניסוי ראשון בכבישים מהירים',
        'הדור הבא של מחשוב קוונטי: גילוי חומר חדשני מוליך-על',
        'אבטחת סייבר: שיטה חדשה להגנה על מאגרי מידע ענניים'
    ],
    'כלכלה': [
        'החלטת הריבית של בנק ישראל: השפעה ישירה על שוק המשכנתאות',
        'הבורסה בתל אביב רושמת עליות שערים נאות במדדי הטכנולוגיה',
        'היי-טק כחול-לבן: גיוסי הון של מעל מיליארד דולר ברבעון האחרון',
        'רפורמת היבוא החדשה נכנסת לתוקף: הוזלות במוצרי צריכה ומזון',
        'האינפלציה מתמתנת: ירידה במדד המחירים לצרכן בחודש האחרון'
    ],
    'ספורט': [
        'ניצחון דרמטי בשניות הסיום: גמר גביע המדינה בכדורסל',
        'הנבחרת הלאומית העפילה לשלב הבא בטורניר האירופי',
        'הישג שיא באליפות העולם בשחייה: מדליית זהב שלישית',
        'דרבי לוהט: סיקור המשחק המרכזי והניתוח הטקטי',
        'הכוכב הצעיר חתם על חוזה ארוך טווח במועדון הפאר'
    ],
    'בריאות': [
        'מחקר חדש: תזונה ים-תיכונית מסייעת במניעת מחלות לב וכלי דם',
        'חיסון חדשני נגד נגיפי חורף עונתיים מציג תוצאות מבטיחות',
        'חשיבות שעות השינה: כיצד שינה איכותית משפרת תפקוד קוגניטיבי',
        'טכנולוגיה רפואית: רובוט מנתח זעיר מבצע הליך מורכב בהצלחה',
        'בריאות הנפש: המלצות מומחים להפחתת מתח וחרדה בשגרה'
    ],
    'תרבות': [
        'פסטיבל הקולנוע הבינלאומי נפתח בבכורה עולמית מרגשת',
        'תערוכה רטרוספקטיבית חדשה במוזיאון תל אביב לאמנות',
        'מופע ענק בפארק הירקון: אלפי מעריצים הגיעו להופעה החיה',
        'הספר החדש שכבש את רשימות רבי המכר ברחבי העולם',
        'הצגת תיאטרון מקורית סוחפת ביקורות משבחות'
    ],
    'פוליטיקה': [
        'הכנסת אישרה בקריאה שלישית את חוק התקציב הלאומי',
        'דיון סוער בוועדת הכלכלה על יוקר המחיה והרגולציה',
        'משלחת דיפלומטית רשמית יצאה לסבב שיחות בוושינגטון',
        'מסיבת עיתונאים מיוחדת: הצגת התוכנית הלאומית לתשתיות',
        'סקר מנדטים חדש: המגמות הפוליטיות המרכזיות בציבור'
    ],
    'דעות': [
        'טור דעה: מדוע עלינו לשנות את תפיסת ההשכלה הגבוהה בעידן ה-AI',
        'דעה: החוסן הכלכלי של ישראל מול אתגרי השעה',
        'טור אורח: תחבורה ציבורית בשבת - מבט מאוזן ופרגמטי',
        'דעה: מנהיגות בעת משבר - הלקחים החשובים מהעשור האחרון',
        'טור אישי: מסע בעקבות היזמות המקומית בפריפריה'
    ]
};

const dummyImages = [
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80'
];

const commentAuthors = [
    'יונתן לוי', 'רונית שפירא', 'איתי ברקוביץ', 'שיר כהן', 'אלון גרינברג',
    'מאיה אברהם', 'תומר קפלן', 'עדי שחר', 'נדב פלג', 'נועה ארצי',
    'מיכאל גולן', 'הדר מזרחי', 'דורון שלם', 'עומר לוי', 'מיכל זיו'
];

const commentSamples = [
    'כתבה מצוינת ומאירת עיניים, תודה על הסיקור המעמיק!',
    'האם יש נתונים נוספים לגבי ההשלכות ארוכות הטווח?',
    'נקודה חשובה מאוד שלא מקבלת מספיק במה בתקשורת.',
    'אני חולק על המסקנה בפסקה השנייה, יש גורמים נוספים שלא נלקחו בחשבון.',
    'מחכה לעדכונים נוספים בנושא. יישר כוח לצוות הכתבים.',
    'מעניין מאוד לראות כיצד התחום הזה מתפתח בחודשים האחרונים.',
    'הפתרון המוצע הגיוני ויעיל, מקווה שיאומץ בקרוב ברמה הלאומית.',
    'ההסבר בהיר ומדויק, תודה רבה על המידע.'
];

const seedDatabase = async () => {
    try {
        console.log('==================================================');
        console.log('מתחיל הזנת נתוני דמה (Seeder) עבור The Daily Web');
        console.log('מתחבר ל-MongoDB:', MONGO_URI);
        console.log('==================================================');

        await mongoose.connect(MONGO_URI);

        // 1. ניקוי נתונים קיימים
        console.log('מנקה אוספים קיימים...');
        await Promise.all([
            User.deleteMany({}),
            Article.deleteMany({}),
            Comment.deleteMany({}),
            ViewStat.deleteMany({})
        ]);

        // 2. יצירת משתמשי דמה (עורכים וכתבים עם סיסמה מוצפנת ב-bcrypt)
        console.log('יוצר משתמשים (כתבים ועורכים)...');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('password123', salt);

        const usersData = [
            { username: 'sarah_editor', password: hashedPassword, fullName: 'שרה לוי', role: 'editor' },
            { username: 'yossi_editor', password: hashedPassword, fullName: 'יוסי אדלר', role: 'editor' },
            { username: 'dan_reporter', password: hashedPassword, fullName: 'דן שטרן', role: 'reporter' },
            { username: 'michal_reporter', password: hashedPassword, fullName: 'מיכל כהן', role: 'reporter' },
            { username: 'ron_reporter', password: hashedPassword, fullName: 'רון אברהמי', role: 'reporter' },
            { username: 'noa_reporter', password: hashedPassword, fullName: 'נועה ברקוביץ', role: 'reporter' }
        ];

        // נשתמש ב-insertMany כדי לא להפעיל שוב pre-save hook של hashing
        const createdUsers = await User.insertMany(usersData);
        const editors = createdUsers.filter(u => u.role === 'editor');
        const reporters = createdUsers.filter(u => u.role === 'reporter');

        console.log(`נוצרו ${createdUsers.length} משתמשים בהצלחה.`);

        // 3. יצירת 500+ כתבות במצבים ובקטגוריות שונות
        console.log('יוצר 500+ כתבות במגוון קטגוריות וסטטוסים...');
        const articlesToInsert = [];
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;

        const totalArticlesCount = 520; // מעל 500 כנדרש במפרט

        // חלוקת סטטוסים לפי דרישות הפרויקט:
        // ~370 פורסמו (מתוכן מספר כתבות שעברו כמה עדכונים)
        // ~60 בהכנה (טיוטות)
        // ~50 ממתינות לאישור עורך
        // ~40 הוחזרו לתיקונים עם הערות עורך

        for (let i = 1; i <= totalArticlesCount; i++) {
            const categoryKeys = Object.keys(categoryTemplates);
            const category = categoryKeys[i % categoryKeys.length];
            const templates = categoryTemplates[category];
            const baseTitle = templates[i % templates.length];
            const author = reporters[i % reporters.length];

            const title = `${baseTitle} (מהדורה #${i})`;
            const summary = `תקציר מקיף ומפורט עבור כתבה מספר ${i} בתחום ה-${category}. דיווח שוטף ועדכני מאת כתבי The Daily Web.`;
            const content = `
                <p>דיווח מיוחד: כתבה מספר ${i} עוסקת בנושא <strong>${title}</strong>.</p>
                <p>האירועים האחרונים מעידים על תפנית משמעותית בתחום, וגורמים בכירים מוסרים כי נרשמת התעניינות רבה מצד גורמים בארץ ובעולם.</p>
                <p>לדברי מומחים ומובילי דעה, המגמה הנוכחית עשויה להשפיע על המערכת כולה לאורך זמן. כתבי מערכת The Daily Web ימשיכו לעקוב ולדווח מקרוב.</p>
            `;
            const mainImage = dummyImages[i % dummyImages.length];

            let status = ARTICLE_STATUS.PUBLISHED;
            let publishedAt = null;
            let editorFeedback = null;
            let revisionsHistory = [];

            if (i <= 60) {
                // טיוטה בהכנה
                status = ARTICLE_STATUS.DRAFT;
            } else if (i <= 110) {
                // ממתינה לאישור עורך
                status = ARTICLE_STATUS.PENDING_APPROVAL;
            } else if (i <= 150) {
                // הוחזרה לתיקונים
                status = ARTICLE_STATUS.REVISION_REQUESTED;
                const feedbacks = [
                    'נא להוסיף מקורות נתונים מוסמכים עבור פסקת הפתיחה',
                    'יש לצרף ציטוט ישיר מפי המרואיין הראשי',
                    'הכותרת אינה תואמת את רוח הידיעה, נא לדייק את הניסוח',
                    'נא לערוך הגהה לשונית לפסקה האחרונה'
                ];
                editorFeedback = feedbacks[i % feedbacks.length];
            } else {
                // כתבה שפורסמה
                status = ARTICLE_STATUS.PUBLISHED;
                // תאריך פרסום בין 1 ל-14 ימים אחורה
                const daysAgo = (i % 14) + 1;
                publishedAt = new Date(now - daysAgo * oneDayMs);

                // עבור 25 כתבות ראשונות שפורסמו - יצירת היסטוריית עדכונים מרובה עבור גרף Impact Analytics!
                if (i >= 151 && i <= 175) {
                    const editorUser = editors[i % editors.length];
                    const firstPublishDate = new Date(now - 7 * oneDayMs);
                    publishedAt = firstPublishDate;

                    // עדכון גרסה 1: יומיים לאחר הפרסום
                    const updateDate1 = new Date(firstPublishDate.getTime() + 2 * oneDayMs);
                    revisionsHistory.push({
                        approvedAt: updateDate1,
                        approvedBy: editorUser._id,
                        changesSummary: 'עדכון ראשוני עם נתוני שטח והצהרות רשמיות'
                    });

                    // עדכון גרסה 2: ארבעה ימים לאחר הפרסום
                    const updateDate2 = new Date(firstPublishDate.getTime() + 4 * oneDayMs);
                    revisionsHistory.push({
                        approvedAt: updateDate2,
                        approvedBy: editors[(i + 1) % editors.length]._id,
                        changesSummary: 'הוספת תיעוד מצולם וראיון בלעדי עם מומחה בכיר'
                    });
                }
            }

            articlesToInsert.push({
                title,
                summary,
                content,
                category,
                mainImage,
                author: author._id,
                status,
                editorFeedback,
                publishedAt,
                revisionsHistory,
                createdAt: publishedAt || new Date(now - (i % 10) * oneDayMs),
                updatedAt: new Date()
            });
        }

        const insertedArticles = await Article.insertMany(articlesToInsert);
        console.log(`נוצרו ${insertedArticles.length} כתבות במסד הנתונים.`);

        // 4. יצירת נתוני צפייה היסטוריים (ViewStat) עבור גרף ה-Impact Analytics
        console.log('מייצר נתוני צפייה היסטוריים (ViewStat) לאורך ציר הזמן...');
        const viewStatsToInsert = [];

        // כתבת הדגל (Showcase Article) להדגמת Impact Analytics מושלם מול המרצה:
        // כתבה מס' 151 עברה 2 עדכונים: נבנה עבורה עקומת צפיות מפורטת לפני ואחרי כל עדכון
        const showcaseArticle = insertedArticles.find(a => a.revisionsHistory && a.revisionsHistory.length >= 2);

        if (showcaseArticle) {
            console.log(`מגדיר עקומת צפיות עשירה עבור כתבת הדגל: "${showcaseArticle.title}" (ID: ${showcaseArticle._id})`);
            const startTime = new Date(showcaseArticle.publishedAt);
            const update1Time = new Date(showcaseArticle.revisionsHistory[0].approvedAt);
            const update2Time = new Date(showcaseArticle.revisionsHistory[1].approvedAt);

            // יצירת דליים שעתיים על פני 7 ימים (168 שעות)
            const hoursTotal = 7 * 24;
            for (let h = 0; h < hoursTotal; h++) {
                const currentBucketDate = new Date(startTime.getTime() + h * 60 * 60 * 1000);
                if (currentBucketDate.getTime() > now) break;

                const timeBucket = getTimeBucketKey(currentBucketDate);

                let hourlyViews = 20 + Math.floor(Math.random() * 25); // רמת צפיות בסיסית: 20-45 בשעה

                // קפיצת צפיות לאחר עדכון 1 (השפעת עדכון עורך 1)
                if (currentBucketDate >= update1Time && currentBucketDate < update2Time) {
                    hourlyViews = 80 + Math.floor(Math.random() * 60); // עלייה ל-80-140 בשעה
                }

                // קפיצת צפיות דרמטית לאחר עדכון 2 (השפעת עדכון עורך 2 - ויראליות)
                if (currentBucketDate >= update2Time) {
                    hourlyViews = 180 + Math.floor(Math.random() * 120); // עלייה ל-180-300 בשעה
                }

                viewStatsToInsert.push({
                    article: showcaseArticle._id,
                    viewedAt: currentBucketDate,
                    timeBucket,
                    viewCount: hourlyViews,
                    notes: `צפיות שעתיות עבור כתבת דגל - שעה ${timeBucket}`
                });
            }
        }

        // יצירת צפיות כלליות לשאר הכתבות שפורסמו כדי שדירוג הכתבות הנצפות (Top) יהיה עשיר
        const publishedArticles = insertedArticles.filter(a => a.status === ARTICLE_STATUS.PUBLISHED);
        for (let j = 0; j < Math.min(publishedArticles.length, 80); j++) {
            const art = publishedArticles[j];
            if (showcaseArticle && art._id.equals(showcaseArticle._id)) continue;

            const daysOfStats = 3;
            for (let d = 0; d < daysOfStats; d++) {
                const statDate = new Date(now - d * oneDayMs);
                const timeBucket = getTimeBucketKey(statDate);
                viewStatsToInsert.push({
                    article: art._id,
                    viewedAt: statDate,
                    timeBucket,
                    viewCount: Math.floor(Math.random() * 250) + 15,
                    notes: `סטטיסטיקה מצרפית`
                });
            }
        }

        await ViewStat.insertMany(viewStatsToInsert);
        console.log(`נוצרו ${viewStatsToInsert.length} רשומות סטטיסטיקה מצרפיות.`);

        // 5. יצירת תגובות (Comments) על כתבות שפורסמו
        console.log('מייצר תגובות קוראים מגוונות...');
        const commentsToInsert = [];

        // נוסיף לפחות 15-20 תגובות לכתבת הדגל
        if (showcaseArticle) {
            for (let c = 0; c < 18; c++) {
                const author = commentAuthors[c % commentAuthors.length];
                const text = commentSamples[c % commentSamples.length];
                const commentDate = new Date(showcaseArticle.publishedAt.getTime() + (c + 1) * 4 * 60 * 60 * 1000);

                commentsToInsert.push({
                    article: showcaseArticle._id,
                    authorName: author,
                    content: text,
                    clientIp: `192.168.1.${10 + (c % 20)}`,
                    createdAt: commentDate
                });
            }
        }

        // נוסיף תגובות לעוד עשרות כתבות שפורסמו
        for (let k = 0; k < 60; k++) {
            const art = publishedArticles[k % publishedArticles.length];
            const numComments = (k % 5) + 1;

            for (let m = 0; m < numComments; m++) {
                const author = commentAuthors[(k + m) % commentAuthors.length];
                const text = commentSamples[(k + m) % commentSamples.length];

                commentsToInsert.push({
                    article: art._id,
                    authorName: author,
                    content: text,
                    clientIp: `10.0.0.${(k * 3 + m) % 250 + 1}`,
                    createdAt: new Date(now - ((k % 5) + 1) * 60 * 60 * 1000)
                });
            }
        }

        await Comment.insertMany(commentsToInsert);
        console.log(`נוצרו ${commentsToInsert.length} תגובות קוראים.`);

        // סיכום נתונים
        console.log('==================================================');
        console.log('הזנת נתוני הדמה הסתיימה בהצלחה מלאה!');
        console.log('סיכום נתוני המערכת:');
        console.log(`- משתמשים: ${createdUsers.length} (עורכים וכתבים עם סיסמה: password123)`);
        console.log(`- סה"כ כתבות: ${insertedArticles.length}`);
        console.log(`  * פורסמו (Published): ${insertedArticles.filter(a => a.status === ARTICLE_STATUS.PUBLISHED).length}`);
        console.log(`  * טיוטות בהכנה (Draft): ${insertedArticles.filter(a => a.status === ARTICLE_STATUS.DRAFT).length}`);
        console.log(`  * ממתינות לאישור (Pending): ${insertedArticles.filter(a => a.status === ARTICLE_STATUS.PENDING_APPROVAL).length}`);
        console.log(`  * הוחזרו לתיקונים (Revision): ${insertedArticles.filter(a => a.status === ARTICLE_STATUS.REVISION_REQUESTED).length}`);
        console.log(`  * כתבות עם היסטוריית עדכונים: 25 כתבות`);
        console.log(`- רשומות סטטיסטיקה (ViewStat): ${viewStatsToInsert.length}`);
        console.log(`- תגובות קוראים (Comments): ${commentsToInsert.length}`);
        if (showcaseArticle) {
            console.log(`🌟 כתבת דגל להדגמת Impact Analytics: "${showcaseArticle.title}"`);
            console.log(`   ID: ${showcaseArticle._id}`);
            console.log(`   קישור ישיר: http://localhost:3000/analytics.html?articleId=${showcaseArticle._id}`);
        }
        console.log('==================================================');

        process.exit(0);
    } catch (err) {
        console.error('Fatal error during seeding:', err);
        process.exit(1);
    }
};

seedDatabase();
