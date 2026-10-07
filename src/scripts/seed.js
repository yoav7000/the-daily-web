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
    'https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1575320181282-9afab399332c?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80'
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

/**
 * Wipes the database and fills it with demo data.
 * Pass { connect: false } when mongoose is already connected (e.g. the in-memory dev database).
 */
const seedDatabase = async ({ connect = true } = {}) => {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Refusing to seed: this script deletes all data and must not run in production.');
    }

    console.log('==================================================');
    console.log('מתחיל הזנת נתוני דמה (Seeder) עבור The Daily Web');
    if (connect) {
        console.log('מתחבר ל-MongoDB:', MONGO_URI);
    }
    console.log('==================================================');

    if (connect) {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
    }

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
                <p class="lead fw-bold mb-4" style="font-size: 1.25rem; line-height: 1.7; color: #1e293b;">
                    ${summary}
                </p>
                <p style="margin-bottom: 1.4rem; font-size: 1.15rem; line-height: 1.8;">
                    דיווח מיוחד: בהתפתחות משמעותית בתחום ה-${category}, גורמים בכירים מוסרים כי נרשמת התעניינות רבה מצד גורמים בארץ ובעולם סביב <strong>${title}</strong>. המהלך מסמן נקודת מפנה ומציב רף חדש של פעילות בענף.
                </p>
                <h3 class="fw-bold my-4" style="color: #0f172a; font-size: 1.4rem; border-right: 4px solid #dc2626; padding-right: 12px;">
                    רקע והשתלשלות האירועים
                </h3>
                <p style="margin-bottom: 1.4rem; font-size: 1.15rem; line-height: 1.8;">
                    במהלך השבועות האחרונים התקיימו מגעים קדחתניים ופגישות עבודה אינטנסיביות במטרה לגבש את המתווה הנוכחי. מומחים ומובילי דעה מעריכים כי המגמה הנוכחית עשויה להשפיע על המערכת כולה לאורך זמן, כאשר ההשפעות כבר מורגשות היטב בשטח.
                </p>
                <blockquote class="p-3 my-4 bg-light rounded-2 border-end border-3 border-danger" style="font-style: italic; font-size: 1.15rem; color: #334155;">
                    ״אנו עדים לשינוי תפיסתי עמוק שמחייב היערכות מחודשת מכלל הגורמים הפועלים בזירה״, הדגיש גורם מקצועי המעורה בפרטים.
                </blockquote>
                <h3 class="fw-bold my-4" style="color: #0f172a; font-size: 1.4rem; border-right: 4px solid #2563eb; padding-right: 12px;">
                    משמעויות והשלכות לעתיד
                </h3>
                <p style="margin-bottom: 1.4rem; font-size: 1.15rem; line-height: 1.8;">
                    במבט קדימה, הציפיות הן להמשך התרחבות והעמקת הפעילות בחודשים הקרובים. כתבי מערכת The Daily Web ימשיכו לעקוב מקרוב אחר ההתפתחויות ויביאו דיווחים שוטפים ככל שיידרש.
                </p>
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
};

module.exports = seedDatabase;

// Run directly with: npm run seed
if (require.main === module) {
    seedDatabase()
        .then(() => mongoose.disconnect())
        .catch(async (err) => {
            console.error('\n❌ שגיאה בהזנת הנתונים (Seeding Error):', err.message);
            console.error('💡 ודא שמסד הנתונים MongoDB פועל כהלכה:');
            console.error('   • הפעלת קונטיינר דרך Docker: docker compose up -d mongodb');
            console.error('   • או ודא ששירות MongoDB מקומי פעיל, או עדכן את MONGODB_URI בקובץ .env');
            await mongoose.disconnect();
            process.exit(1);
        });
}
