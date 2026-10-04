const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const User = require('../src/models/User');
const Article = require('../src/models/Article');
const Comment = require('../src/models/Comment');
const ViewStat = require('../src/models/ViewStat');
const { connectTestDb, disconnectTestDb, createEditor } = require('./helpers/testEnv');
const { ARTICLE_STATUS, ARTICLE_CATEGORIES } = require('../src/constants/articleConstants');
const { recordViewInternal, getTimeBucketKey } = require('../src/controllers/analyticsController');

let server;
let baseUrl;
let editorToken;
let reporterToken;
let testArticleId;

test.before(async () => {
    await connectTestDb();

    // הרמת שרת זמני על פורט דינמי
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });

    // יצירת משתמשי בדיקה וקבלת Tokens
    const regReporter = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: `tester_rep_${Date.now()}`,
            password: 'password123',
            fullName: 'כתב בדיקה',
            role: 'reporter'
        })
    });
    const repData = await regReporter.json();
    reporterToken = repData.token;

    const edData = await createEditor(`tester_ed_${Date.now()}`, 'עורכת בדיקה');
    editorToken = edData.token;

    // יצירת כתבה שפורסמה לבדיקות
    const article = await Article.create({
        title: 'כתבת מבחן עבור תגובות ואנליטיקות',
        summary: 'תקציר כתבת מבחן לבדיקת מודול תגובות ו-Impact Analytics',
        content: '<p>תוכן כתבת מבחן מלא...</p>',
        category: 'טכנולוגיה',
        author: repData.user.id,
        status: ARTICLE_STATUS.PUBLISHED,
        publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // לפני 3 ימים
        revisionsHistory: [
            {
                approvedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // לפני יום
                approvedBy: edData.user.id,
                changesSummary: 'עדכון בדיקה ראשון'
            }
        ]
    });
    testArticleId = article._id.toString();
});

test.after(async () => {
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
    await disconnectTestDb();
});

test('Comments & Anti-Spam Rate Limiter Test Suite', async (t) => {

    await t.test('1. Guest successfully posts a comment via AJAX (POST /api/articles/:id/comments)', async () => {
        const res = await fetch(`${baseUrl}/api/articles/${testArticleId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-device-id': 'device_test_1'
            },
            body: JSON.stringify({
                authorName: 'משה כהן',
                content: 'תגובה מעולה, נהניתי לקרוא!'
            })
        });

        assert.equal(res.status, 201);
        const data = await res.json();
        assert.equal(data.success, true);
        assert.equal(data.comment.authorName, 'משה כהן');
        assert.equal(data.comment.content, 'תגובה מעולה, נהניתי לקרוא!');
        assert.equal(data.comment.article, testArticleId);
    });

    await t.test('2. Retrieve comments for article without full page reload (GET /api/articles/:id/comments)', async () => {
        const res = await fetch(`${baseUrl}/api/articles/${testArticleId}/comments`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.success, true);
        assert.ok(Array.isArray(data.comments));
        assert.ok(data.comments.length >= 1);
        assert.equal(data.comments[0].authorName, 'משה כהן');
    });

    await t.test('3. Anti-Spam: Block guest posting more than 3 comments per minute from same device/IP', async () => {
        const spamDeviceId = 'spam_device_test_99';

        // שליחת 3 תגובות מותרות
        for (let i = 1; i <= 3; i++) {
            const res = await fetch(`${baseUrl}/api/articles/${testArticleId}/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-device-id': spamDeviceId
                },
                body: JSON.stringify({
                    authorName: `משתמש לגיטימי #${i}`,
                    content: `תגובה מותרת מספר ${i}`
                })
            });
            assert.equal(res.status, 201, `Comment ${i} should be accepted`);
        }

        // ניסיון שליחת תגובה רביעית תוך אותה דקה -> חייב להיחסם כחוק עם 429
        const blockedRes = await fetch(`${baseUrl}/api/articles/${testArticleId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-device-id': spamDeviceId
            },
            body: JSON.stringify({
                authorName: 'ספאמר זדוני',
                content: 'תגובת ספאם שלא צריכה לעבור'
            })
        });

        assert.equal(blockedRes.status, 429, 'Fourth comment must be rejected with HTTP 429');
        const blockedData = await blockedRes.json();
        assert.equal(blockedData.success, false);
        assert.ok(blockedData.message.includes('חריגה ממגבלת התגובות'));
        assert.equal(blockedData.limit, 3);
        assert.ok(blockedData.retryAfterSeconds > 0);
    });

    await t.test('4. Full CRUD on Comments: Editor can update and delete a comment', async () => {
        // יצירת תגובה
        const createRes = await fetch(`${baseUrl}/api/articles/${testArticleId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-device-id': 'crud_device'
            },
            body: JSON.stringify({
                authorName: 'יוסי',
                content: 'תוכן ראשוני לפני עריכה'
            })
        });
        const created = await createRes.json();
        const commentId = created.comment._id;

        // קריאה בודדת (Read)
        const getRes = await fetch(`${baseUrl}/api/comments/${commentId}`);
        assert.equal(getRes.status, 200);

        // עריכה (Update) ע"י עורך
        const updateRes = await fetch(`${baseUrl}/api/comments/${commentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${editorToken}`
            },
            body: JSON.stringify({
                content: 'תוכן מעודכן לאחר מודרציה ע"י עורך'
            })
        });
        assert.equal(updateRes.status, 200);
        const updated = await updateRes.json();
        assert.equal(updated.comment.content, 'תוכן מעודכן לאחר מודרציה ע"י עורך');

        // מחיקה (Delete) ע"י עורך
        const deleteRes = await fetch(`${baseUrl}/api/comments/${commentId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${editorToken}`
            }
        });
        assert.equal(deleteRes.status, 200);

        // וידוא שהתגובה נמחקה
        const checkRes = await fetch(`${baseUrl}/api/comments/${commentId}`);
        assert.equal(checkRes.status, 404);
    });
});

test('Scalable View Analytics & Impact Graph Test Suite', async (t) => {

    await t.test('1. High-throughput atomic view recording with time-bucket aggregation', async () => {
        const bucketKey = getTimeBucketKey(new Date());

        // רישום 5 צפיות רצופות
        for (let i = 0; i < 5; i++) {
            await recordViewInternal(testArticleId);
        }

        const stat = await ViewStat.findOne({ article: testArticleId, timeBucket: bucketKey });
        assert.ok(stat, 'ViewStat record should exist for current time bucket');
        assert.equal(stat.viewCount, 5, 'Atomic $inc should correctly sum all 5 views');
    });

    await t.test('2. Impact Analytics API returns time-series data, update milestones and before/after comparison', async () => {
        // הוספת נתוני צפייה היסטוריים לבדיקת ההשוואה
        const pastDateBefore = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // לפני העדכון
        const pastBucketBefore = getTimeBucketKey(pastDateBefore);
        await ViewStat.create({
            article: testArticleId,
            timeBucket: pastBucketBefore,
            viewedAt: pastDateBefore,
            viewCount: 40
        });

        const pastDateAfter = new Date(Date.now() - 12 * 60 * 60 * 1000); // אחרי העדכון
        const pastBucketAfter = getTimeBucketKey(pastDateAfter);
        await ViewStat.create({
            article: testArticleId,
            timeBucket: pastBucketAfter,
            viewedAt: pastDateAfter,
            viewCount: 150
        });

        const res = await fetch(`${baseUrl}/api/analytics/article/${testArticleId}`);
        assert.equal(res.status, 200);
        const data = await res.json();

        assert.equal(data.success, true);
        assert.ok(data.totalViews > 0);
        assert.ok(Array.isArray(data.timeline.labels));
        assert.ok(Array.isArray(data.timeline.views));
        assert.ok(data.milestones.length >= 2, 'Should contain initial publish and at least 1 revision milestone');

        // בדיקת ניתוח השפעה (Impact Analysis)
        assert.ok(data.impactAnalysis, 'Should calculate before vs after comparison');
        assert.ok(data.impactAnalysis.viewsBeforeUpdate > 0);
        assert.ok(data.impactAnalysis.viewsAfterUpdate > 0);
        assert.ok(data.impactAnalysis.percentageChange !== undefined);
    });

    await t.test('3. Full CRUD on ViewStat model', async () => {
        // Create
        const createRes = await fetch(`${baseUrl}/api/analytics`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${editorToken}`
            },
            body: JSON.stringify({
                articleId: testArticleId,
                timeBucket: '2026-09-30-08',
                viewCount: 25,
                notes: 'רשומת בדיקה ידנית'
            })
        });
        assert.equal(createRes.status, 201);
        const created = await createRes.json();
        const statId = created.stat._id;

        // Read Single
        const getRes = await fetch(`${baseUrl}/api/analytics/${statId}`, {
            headers: { 'Authorization': `Bearer ${editorToken}` }
        });
        assert.equal(getRes.status, 200);

        // Search / List
        const listRes = await fetch(`${baseUrl}/api/analytics?search=בדיקה`, {
            headers: { 'Authorization': `Bearer ${editorToken}` }
        });
        assert.equal(listRes.status, 200);

        // Update
        const updateRes = await fetch(`${baseUrl}/api/analytics/${statId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${editorToken}`
            },
            body: JSON.stringify({ viewCount: 50 })
        });
        assert.equal(updateRes.status, 200);
        const updated = await updateRes.json();
        assert.equal(updated.stat.viewCount, 50);

        // Delete
        const deleteRes = await fetch(`${baseUrl}/api/analytics/${statId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${editorToken}` }
        });
        assert.equal(deleteRes.status, 200);
    });

    await t.test('4. Top viewed articles endpoint (GET /api/analytics/overview/top)', async () => {
        const res = await fetch(`${baseUrl}/api/analytics/overview/top?limit=5`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.success, true);
        assert.ok(Array.isArray(data.topArticles));
    });
});

test.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await disconnectTestDb();
});
