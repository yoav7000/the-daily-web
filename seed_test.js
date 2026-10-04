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

    let author = await User.findOne({ username: 'dan_reporter' });
    if (!author) {
        author = await User.create({
            fullName: 'דן שטרן',
            username: 'dan_reporter',
            password: 'password123',
            role: 'reporter'
        });
    }

    let authorAlt = await User.findOne({ username: 'reporter_dan' });
    if (!authorAlt) {
        await User.create({
            fullName: 'דן הכתב',
            username: 'reporter_dan',
            password: 'password123',
            role: 'reporter'
        });
    }

    let editor = await User.findOne({ username: 'sarah_editor' });
    if (!editor) {
        await User.create({
            fullName: 'שרה לוי',
            username: 'sarah_editor',
            password: 'password123',
            role: 'editor'
        });
    }

    let editorAlt = await User.findOne({ username: 'editor_sarah' });
    if (!editorAlt) {
        await User.create({
            fullName: 'שרה העורכת',
            username: 'editor_sarah',
            password: 'password123',
            role: 'editor'
        });
    }

    let testUser = await User.findOne({ username: 'testreporter123' });
    if (!testUser) {
        await User.create({
            fullName: 'Test Reporter',
            username: 'testreporter123',
            email: 'test@example.com',
            password: 'Password123!',
            role: 'reporter'
        });
    }

    const articles = [
        { title: 'סטארטאפ ישראלי גייס 50 מיליון דולר', summary: 'החברה מפתחת טכנולוגיית בינה מלאכותית לתחום הרפואה', category: 'טכנולוגיה', image: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=800&q=80' },
        { title: 'ראש הממשלה הכריז על תוכנית כלכלית חדשה', summary: 'התוכנית כוללת הקלות מס לעסקים קטנים ובינוניים ותמריצים לתעסוקה', category: 'פוליטיקה', image: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=800&q=80' },
        { title: 'הבורסה רשמה עליות חדות היום', summary: 'מדד ת"א 35 עלה ב-2.3% על רקע נתונים כלכליים חיוביים', category: 'כלכלה', image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=80' },
        { title: 'מכבי תל אביב ניצחה בליגת האלופות', summary: 'הקבוצה גברה על יריבתה 2-0 במשחק מרגש', category: 'ספורט', image: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=800&q=80' },
        { title: 'חיסון חדש נגד שפעת מציג תוצאות מבטיחות', summary: 'ניסוי קליני בשלב 3 מראה יעילות של 95%', category: 'בריאות', image: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80' },
        { title: 'מדענים גילו כוכב לכת חדש', summary: 'הכוכב נמצא באזור המגורים של מערכת שמש קרובה', category: 'חדשות', image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80' },
        { title: 'פסטיבל הסרטים הבינלאומי נפתח בירושלים', summary: 'עשרות סרטים ישראליים ובינלאומיים יוקרנו במהלך השבוע', category: 'תרבות', image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=800&q=80' },
        { title: 'מזג אוויר סוער צפוי בסוף השבוע', summary: 'שירות המטאורולוגי מתריע על גשמים עזים ורוחות חזקות', category: 'דעות', image: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=800&q=80' },
        { title: 'אפל חשפה את הדגם החדש של האייפון', summary: 'המכשיר מגיע עם מצלמה משודרגת ועיבוד AI מובנה', category: 'טכנולוגיה', image: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=800&q=80' },
        { title: 'הכנסת אישרה חוק חדש בנושא חינוך', summary: 'החוק מגדיר תקנים חדשים למערכת החינוך ומוסיף שעות לימוד', category: 'פוליטיקה', image: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=800&q=80' },
        { title: 'בנק ישראל מוריד את הריבית', summary: 'ההחלטה צפויה להשפיע על שוק המשכנתאות והאשראי', category: 'כלכלה', image: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80' },
        { title: 'שחקן ישראלי חתם בקבוצה אירופאית', summary: 'הקשר הצעיר עובר לשחק בליגה הספרדית', category: 'ספורט', image: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=800&q=80' },
        { title: 'מחקר: פעילות גופנית מפחיתה סיכון לדמנציה', summary: 'חוקרים מצאו קשר ישיר בין הליכה יומית לבריאות המוח', category: 'בריאות', image: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=800&q=80' },
        { title: 'טלסקופ ג׳יימס ווב מצלם גלקסיה רחוקה', summary: 'התמונה החדשה חושפת פרטים על היקום הקדום', category: 'חדשות', image: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=800&q=80' },
        { title: 'תערוכה חדשה במוזיאון תל אביב', summary: 'אמנים ישראליים וזרים מציגים עבודות בנושא זהות ושייכות', category: 'תרבות', image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80' },
        { title: 'פתיחת שנת הלימודים: מה חדש?', summary: 'שינויים בתוכנית הלימודים ותוספת שעות טכנולוגיה', category: 'דעות', image: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=800&q=80' },
        { title: 'פריצת דרך בתחום המחשוב הקוונטי', summary: 'חוקרים הצליחו ליצור מעבד קוונטי יציב בטמפרטורת חדר', category: 'טכנולוגיה', image: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=800&q=80' },
        { title: 'שר הביטחון נפגש עם עמיתו האמריקאי', summary: 'בפגישה נדונו נושאי ביטחון אזוריים ושיתוף פעולה צבאי', category: 'פוליטיקה', image: 'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?auto=format&fit=crop&w=800&q=80' },
        { title: 'חברת תעופה חדשה מתחילה לפעול בישראל', summary: 'החברה מציעה טיסות מוזלות ליעדים באירופה', category: 'כלכלה', image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=800&q=80' },
        { title: 'אולימפיאדת 2028: ישראל מציגה את המשלחת', summary: '120 ספורטאים ייצגו את ישראל במשחקים בלוס אנג׳לס', category: 'ספורט', image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=800&q=80' },
        { title: 'בית חולים חדש נפתח בבאר שבע', summary: 'המרכז הרפואי החדש כולל 500 מיטות ומחלקות מתקדמות', category: 'בריאות', image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80' },
        { title: 'פריצת דרך בחקר תאי גזע', summary: 'שיטה חדשה מאפשרת ייצור תאי גזע בצורה יעילה יותר', category: 'חדשות', image: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=800&q=80' },
        { title: 'ספר ישראלי חדש מככב ברשימת רבי המכר', summary: 'הרומן של הסופרת הישראלית מתורגם ל-20 שפות', category: 'תרבות', image: 'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=800&q=80' },
        { title: 'מתכון: שקשוקה ישראלית מושלמת', summary: 'כל הסודות להכנת שקשוקה קלאסית עם ביצים רכות', category: 'דעות', image: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=800&q=80' },
        { title: 'מתקפת סייבר חדשה מאיימת על מוסדות פיננסיים', summary: 'מומחי אבטחה מזהירים מפני נוזקה חדשה המתמקדת בבנקים', category: 'טכנולוגיה', image: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80' },
        { title: 'בחירות מוניציפליות: תוצאות ראשוניות מתפרסמות', summary: 'המפלגות הגדולות מתחרות על השליטה בעיריות המרכזיות', category: 'פוליטיקה', image: 'https://images.unsplash.com/photo-1575320181282-9afab399332c?auto=format&fit=crop&w=800&q=80' },
        { title: 'מחירי הדירות עולים ברבעון השלישי', summary: 'עליה של 4% במחירי הנדל"ן למגורים ברחבי הארץ', category: 'כלכלה', image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80' },
        { title: 'הפועל ירושלים זכתה באליפות הכדורסל', summary: 'ניצחון דרמטי בגמר מול מכבי ראשון לציון', category: 'ספורט', image: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=800&q=80' },
        { title: 'תזונה ים-תיכונית: היתרונות הבריאותיים', summary: 'מחקרים חדשים מחזקים את הקשר בין תזונה ים-תיכונית לאריכות ימים', category: 'בריאות', image: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=800&q=80' },
        { title: 'חוקרים פיצחו את מבנה חלבון קריטי', summary: 'התגלית עשויה לסייע בפיתוח תרופות חדשות למחלות ניווניות', category: 'חדשות', image: 'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?auto=format&fit=crop&w=800&q=80' },
        { title: 'להקת רוק ישראלית יוצאת לסיבוב הופעות באירופה', summary: 'הלהקה תופיע ב-15 ערים במשך חודשיים', category: 'תרבות', image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80' },
        { title: 'טיולים בארץ: 5 מסלולים מומלצים לסתיו', summary: 'מסלולי הליכה מדהימים שאתם חייבים להכיר', category: 'דעות', image: 'https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&w=800&q=80' },
        { title: 'גוגל מכריזה על מודל AI חדש', summary: 'המודל מציג ביצועים חסרי תקדים במגוון משימות שפה', category: 'טכנולוגיה', image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=800&q=80' },
        { title: 'ועדת החוקה דנה בהצעת חוק שנויה במחלוקת', summary: 'חברי הכנסת מתווכחים על חוק חדש הנוגע לזכויות אזרחיות', category: 'פוליטיקה', image: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80' },
        { title: 'ייצוא ההייטק הישראלי שובר שיאים', summary: 'היצוא הגיע ל-18 מיליארד דולר ברבעון האחרון', category: 'כלכלה', image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80' },
        { title: 'שיא ישראלי חדש בשחייה', summary: 'השחיין הישראלי שבר את השיא הלאומי ב-200 מטר חופשי', category: 'ספורט', image: 'https://images.unsplash.com/photo-1519315901367-f34ff9154487?auto=format&fit=crop&w=800&q=80' },
        { title: 'גל חום: הנחיות משרד הבריאות', summary: 'המשרד מפרסם הנחיות להתמודדות עם טמפרטורות גבוהות', category: 'בריאות', image: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=800&q=80' },
        { title: 'שינויי אקלים: דוח חדש של האו"ם', summary: 'הדוח מצביע על האצה בקצב ההתחממות הגלובלית', category: 'חדשות', image: 'https://images.unsplash.com/photo-1569163139599-0f4517e36f51?auto=format&fit=crop&w=800&q=80' },
        { title: 'מחזמר חדש עולה על הבמה בתיאטרון הבימה', summary: 'ההפקה המקורית עוסקת בחיים בישראל בשנות ה-80', category: 'תרבות', image: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=800&q=80' },
        { title: 'ראיון בלעדי עם הזוכה בפרס ישראל', summary: 'פרופסור מאוניברסיטת תל אביב מספר על הדרך להישג', category: 'דעות', image: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=800&q=80' },
        { title: 'הרכב האוטונומי של טסלה מקבל אישור בישראל', summary: 'משרד התחבורה מאשר ניסויי נהיגה אוטונומית בכבישים מרכזיים', category: 'טכנולוגיה', image: 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=800&q=80' },
        { title: 'ממשלת ישראל מאשרת תקציב חדש', summary: 'התקציב כולל תוספות לבריאות, חינוך ותשתיות', category: 'פוליטיקה', image: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=800&q=80' },
        { title: 'האינפלציה יורדת לרמה של 2.1%', summary: 'מדד המחירים לצרכן ירד מעבר לצפי האנליסטים', category: 'כלכלה', image: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&w=800&q=80' },
        { title: 'ליגת העל בכדורגל: סיכום המחזור', summary: 'תוצאות ודירוגים עדכניים מכל משחקי השבוע', category: 'ספורט', image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=800&q=80' },
        { title: 'חשיפת תחקיר: מאחורי הקלעים של עולם העיתונות', summary: 'כיצד נולדות הכותרות הראשיות ומה מתרחש בחדרי החדשות', category: 'חדשות', image: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=800&q=80' }
    ];

    const categoryImages = {
        'פוליטיקה': 'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?auto=format&fit=crop&w=800&q=80',
        'טכנולוגיה': 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80',
        'כלכלה': 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=80',
        'ספורט': 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=800&q=80',
        'בריאות': 'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?auto=format&fit=crop&w=800&q=80',
        'חדשות': 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=800&q=80',
        'דעות': 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=800&q=80',
        'תרבות': 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=800&q=80'
    };

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
            mainImage: a.image || categoryImages[a.category] || '/images/default-article.jpg',
            status: 'published',
            publishedAt: publishDate,
            author: author._id
        });
    }

    const count = await Article.countDocuments({ status: 'published' });
    console.log(`Done! Total published articles: ${count}`);
}

module.exports = seed;
