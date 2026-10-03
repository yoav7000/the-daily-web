/**
 * Seed script for testing - creates 45 articles across all categories
 * Run: node seed_test.js
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// We'll hit the running server's API instead of connecting to DB directly
const BASE = 'http://localhost:3000';

async function seed() {
    // Connect to same in-memory DB by importing the app's connection
    // Actually, easier approach: just POST to the API or connect separately
    // But since the server uses in-memory DB, let's just add articles via the same process

    // We'll use a different approach - create a standalone script that 
    // connects to the running server's mongoose connection
    
    const Article = require('./src/models/Article');
    const User = require('./src/models/User');

    // Check if mongoose is already connected
    if (mongoose.connection.readyState !== 1) {
        console.log('Not connected to DB. This script must be loaded from the running server.');
        process.exit(1);
    }

    let author = await User.findOne({ role: 'reporter' });
    if (!author) {
        author = await User.create({
            fullName: 'Test Reporter',
            username: 'testreporter123',
            email: 'test@example.com',
            password: 'Password123!',
            role: 'reporter'
        });
    }

    const articles = [
        // פוליטיקה (6)
        { title: 'ראש הממשלה הכריז על תוכנית כלכלית חדשה', summary: 'התוכנית כוללת הקלות מס לעסקים קטנים ובינוניים ותמריצים לתעסוקה', category: 'פוליטיקה' },
        { title: 'הכנסת אישרה חוק חדש בנושא חינוך', summary: 'החוק מגדיר תקנים חדשים למערכת החינוך ומוסיף שעות לימוד', category: 'פוליטיקה' },
        { title: 'שר הביטחון נפגש עם עמיתו האמריקאי', summary: 'בפגישה נדונו נושאי ביטחון אזוריים ושיתוף פעולה צבאי', category: 'פוליטיקה' },
        { title: 'בחירות מוניציפליות: תוצאות ראשוניות מתפרסמות', summary: 'המפלגות הגדולות מתחרות על השליטה בעיריות המרכזיות', category: 'פוליטיקה' },
        { title: 'ועדת החוקה דנה בהצעת חוק שנויה במחלוקת', summary: 'חברי הכנסת מתווכחים על חוק חדש הנוגע לזכויות אזרחיות', category: 'פוליטיקה' },
        { title: 'ממשלת ישראל מאשרת תקציב חדש', summary: 'התקציב כולל תוספות לבריאות, חינוך ותשתיות', category: 'פוליטיקה' },
        
        // טכנולוגיה (6)
        { title: 'סטארטאפ ישראלי גייס 50 מיליון דולר', summary: 'החברה מפתחת טכנולוגיית בינה מלאכותית לתחום הרפואה', category: 'טכנולוגיה' },
        { title: 'אפל חשפה את הדגם החדש של האייפון', summary: 'המכשיר מגיע עם מצלמה משודרגת ועיבוד AI מובנה', category: 'טכנולוגיה' },
        { title: 'פריצת דרך בתחום המחשוב הקוונטי', summary: 'חוקרים הצליחו ליצור מעבד קוונטי יציב בטמפרטורת חדר', category: 'טכנולוגיה' },
        { title: 'מתקפת סייבר חדשה מאיימת על מוסדות פיננסיים', summary: 'מומחי אבטחה מזהירים מפני נוזקה חדשה המתמקדת בבנקים', category: 'טכנולוגיה' },
        { title: 'גוגל מכריזה על מודל AI חדש', summary: 'המודל מציג ביצועים חסרי תקדים במגוון משימות שפה', category: 'טכנולוגיה' },
        { title: 'הרכב האוטונומי של טסלה מקבל אישור בישראל', summary: 'משרד התחבורה מאשר ניסויי נהיגה אוטונומית בכבישים מרכזיים', category: 'טכנולוגיה' },
        
        // כלכלה (6)
        { title: 'הבורסה רשמה עליות חדות היום', summary: 'מדד ת"א 35 עלה ב-2.3% על רקע נתונים כלכליים חיוביים', category: 'כלכלה' },
        { title: 'בנק ישראל מוריד את הריבית', summary: 'ההחלטה צפויה להשפיע על שוק המשכנתאות והאשראי', category: 'כלכלה' },
        { title: 'חברת תעופה חדשה מתחילה לפעול בישראל', summary: 'החברה מציעה טיסות מוזלות ליעדים באירופה', category: 'כלכלה' },
        { title: 'מחירי הדירות עולים ברבעון השלישי', summary: 'עליה של 4% במחירי הנדל"ן למגורים ברחבי הארץ', category: 'כלכלה' },
        { title: 'ייצוא ההייטק הישראלי שובר שיאים', summary: 'היצוא הגיע ל-18 מיליארד דולר ברבעון האחרון', category: 'כלכלה' },
        { title: 'האינפלציה יורדת לרמה של 2.1%', summary: 'מדד המחירים לצרכן ירד מעבר לצפי האנליסטים', category: 'כלכלה' },
        
        // ספורט (6)
        { title: 'מכבי תל אביב ניצחה בליגת האלופות', summary: 'הקבוצה גברה על יריבתה 2-0 במשחק מרגש', category: 'ספורט' },
        { title: 'שחקן ישראלי חתם בקבוצה אירופאית', summary: 'הקשר הצעיר עובר לשחק בליגה הספרדית', category: 'ספורט' },
        { title: 'אולימפיאדת 2028: ישראל מציגה את המשלחת', summary: '120 ספורטאים ייצגו את ישראל במשחקים בלוס אנג׳לס', category: 'ספורט' },
        { title: 'הפועל ירושלים זכתה באליפות הכדורסל', summary: 'ניצחון דרמטי בגמר מול מכבי ראשון לציון', category: 'ספורט' },
        { title: 'שיא ישראלי חדש בשחייה', summary: 'השחיין הישראלי שבר את השיא הלאומי ב-200 מטר חופשי', category: 'ספורט' },
        { title: 'ליגת העל בכדורגל: סיכום המחזור', summary: 'תוצאות ודירוגים עדכניים מכל משחקי השבוע', category: 'ספורט' },
        
        // בריאות (5)
        { title: 'חיסון חדש נגד שפעת מציג תוצאות מבטיחות', summary: 'ניסוי קליני בשלב 3 מראה יעילות של 95%', category: 'בריאות' },
        { title: 'מחקר: פעילות גופנית מפחיתה סיכון לדמנציה', summary: 'חוקרים מצאו קשר ישיר בין הליכה יומית לבריאות המוח', category: 'בריאות' },
        { title: 'בית חולים חדש נפתח בבאר שבע', summary: 'המרכז הרפואי החדש כולל 500 מיטות ומחלקות מתקדמות', category: 'בריאות' },
        { title: 'תזונה ים-תיכונית: היתרונות הבריאותיים', summary: 'מחקרים חדשים מחזקים את הקשר בין תזונה ים-תיכונית לאריכות ימים', category: 'בריאות' },
        { title: 'גל חום: הנחיות משרד הבריאות', summary: 'המשרד מפרסם הנחיות להתמודדות עם טמפרטורות גבוהות', category: 'בריאות' },
        
        // מדע (5)
        { title: 'מדענים גילו כוכב לכת חדש', summary: 'הכוכב נמצא באזור המגורים של מערכת שמש קרובה', category: 'מדע' },
        { title: 'פריצת דרך בחקר תאי גזע', summary: 'שיטה חדשה מאפשרת ייצור תאי גזע בצורה יעילה יותר', category: 'מדע' },
        { title: 'טלסקופ ג׳יימס ווב מצלם גלקסיה רחוקה', summary: 'התמונה החדשה חושפת פרטים על היקום הקדום', category: 'מדע' },
        { title: 'חוקרים פיצחו את מבנה חלבון קריטי', summary: 'התגלית עשויה לסייע בפיתוח תרופות חדשות למחלות ניווניות', category: 'מדע' },
        { title: 'שינויי אקלים: דוח חדש של האו"ם', summary: 'הדוח מצביע על האצה בקצב ההתחממות הגלובלית', category: 'מדע' },
        
        // תרבות (5)
        { title: 'פסטיבל הסרטים הבינלאומי נפתח בירושלים', summary: 'עשרות סרטים ישראליים ובינלאומיים יוקרנו במהלך השבוע', category: 'תרבות' },
        { title: 'תערוכה חדשה במוזיאון תל אביב', summary: 'אמנים ישראליים וזרים מציגים עבודות בנושא זהות ושייכות', category: 'תרבות' },
        { title: 'ספר ישראלי חדש מככב ברשימת רבי המכר', summary: 'הרומן של הסופרת הישראלית מתורגם ל-20 שפות', category: 'תרבות' },
        { title: 'להקת רוק ישראלית יוצאת לסיבוב הופעות באירופה', summary: 'הלהקה תופיע ב-15 ערים במשך חודשיים', category: 'תרבות' },
        { title: 'מחזמר חדש עולה על הבמה בתיאטרון הבימה', summary: 'ההפקה המקורית עוסקת בחיים בישראל בשנות ה-80', category: 'תרבות' },
        
        // אחר (5)
        { title: 'מזג אוויר סוער צפוי בסוף השבוע', summary: 'שירות המטאורולוגי מתריע על גשמים עזים ורוחות חזקות', category: 'אחר' },
        { title: 'פתיחת שנת הלימודים: מה חדש?', summary: 'שינויים בתוכנית הלימודים ותוספת שעות טכנולוגיה', category: 'אחר' },
        { title: 'מתכון: שקשוקה ישראלית מושלמת', summary: 'כל הסודות להכנת שקשוקה קלאסית עם ביצים רכות', category: 'אחר' },
        { title: 'טיולים בארץ: 5 מסלולים מומלצים לסתיו', summary: 'מסלולי הליכה מדהימים שאתם חייבים להכיר', category: 'אחר' },
        { title: 'ראיון בלעדי עם הזוכה בפרס ישראל', summary: 'פרופסור מאוניברסיטת תל אביב מספר על הדרך להישג', category: 'אחר' },
    ];

    console.log(`Seeding ${articles.length} articles...`);

    for (let i = 0; i < articles.length; i++) {
        const a = articles[i];
        // Spread publish dates across last 30 days so sorting by date works well
        const daysAgo = Math.floor(i * 30 / articles.length);
        const publishDate = new Date();
        publishDate.setDate(publishDate.getDate() - daysAgo);
        publishDate.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));

        await Article.create({
            title: a.title,
            summary: a.summary,
            content: `<p>${a.summary}</p><p>זהו תוכן מלא של כתבה לצורך בדיקות. הכתבה עוסקת ב${a.category} ומציגה נקודות מבט שונות בנושא.</p><p>פסקה נוספת עם פרטים ומידע רלוונטי לקוראים.</p>`,
            category: a.category,
            status: 'published',
            publishedAt: publishDate,
            author: author._id
        });
    }

    const count = await Article.countDocuments({ status: 'published' });
    console.log(`Done! Total published articles: ${count}`);
}

module.exports = seed;
