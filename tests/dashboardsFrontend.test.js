const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const app = require('../src/app');
const User = require('../src/models/User');
const Article = require('../src/models/Article');
const { ARTICLE_STATUS, ARTICLE_CATEGORIES } = require('../src/constants/articleConstants');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/the-daily-web-test-frontend';

let server;
let baseUrl;
let reporterToken;
let editorToken;
let reporterUser;
let editorUser;
let mongod;

test.before(async () => {
    if (mongoose.connection.readyState === 0) {
        try {
            await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 1500 });
        } catch (err) {
            const { MongoMemoryServer } = require('mongodb-memory-server');
            mongod = await MongoMemoryServer.create();
            await mongoose.connect(mongod.getUri());
        }
    }

    await Article.deleteMany({});
    await User.deleteMany({});

    await new Promise((resolve) => {
        server = app.listen(0, () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });

    // Register reporter and editor
    const repRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: 'reporter_m4',
            password: 'Password123!',
            fullName: 'רועי הכתב',
            role: 'reporter'
        })
    });
    const repData = await repRes.json();
    reporterToken = repData.token;
    reporterUser = repData.user;

    const edRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: 'editor_m4',
            password: 'Password123!',
            fullName: 'מיכל העורכת',
            role: 'editor'
        })
    });
    const edData = await edRes.json();
    editorToken = edData.token;
    editorUser = edData.user;
});

test.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await Article.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.close();
    if (mongod) await mongod.stop();
});

test('Team Member 4: Dashboards Frontend & Review Workflow Integration Suite', async (t) => {

    await t.test('1. Static HTML Pages are served correctly', async () => {
        const loginRes = await fetch(`${baseUrl}/login.html`);
        assert.equal(loginRes.status, 200);
        const loginHtml = await loginRes.text();
        assert.ok(loginHtml.includes('The Daily Web'));
        assert.ok(loginHtml.includes('התחברות'));

        const reporterRes = await fetch(`${baseUrl}/reporter.html`);
        assert.equal(reporterRes.status, 200);
        const reporterHtml = await reporterRes.text();
        assert.ok(reporterHtml.includes('אזור עבודה לכתב'));
        assert.ok(reporterHtml.includes('autosaveIndicator'));

        const editorRes = await fetch(`${baseUrl}/editor.html`);
        assert.equal(editorRes.status, 200);
        const editorHtml = await editorRes.text();
        assert.ok(editorHtml.includes('אזור ניהול ועריכה'));
        assert.ok(editorHtml.includes('diffViewContainer'));
        assert.ok(editorHtml.includes('returnRevisionsModal'));
    });

    let testArticleId;

    await t.test('2. Reporter creates draft and background auto-saves updates', async () => {
        // Create draft via auto-save
        const autoSaveRes = await fetch(`${baseUrl}/api/articles/autosave`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${reporterToken}`
            },
            body: JSON.stringify({
                title: 'פיתוח בינה מלאכותית חדשה',
                category: 'טכנולוגיה',
                summary: 'חוקרים הציגו מודל שפה מתקדם במיוחד',
                content: '<p>פסקה ראשונה של הכתבה.</p>'
            })
        });

        assert.equal(autoSaveRes.status, 200);
        const autoSaveData = await autoSaveRes.json();
        assert.equal(autoSaveData.success, true);
        assert.ok(autoSaveData.articleId);
        testArticleId = autoSaveData.articleId;

        // Subsequent auto-save update
        const updateRes = await fetch(`${baseUrl}/api/articles/${testArticleId}/autosave`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${reporterToken}`
            },
            body: JSON.stringify({
                title: 'פיתוח בינה מלאכותית חדשה - עדכון מחקר',
                category: 'טכנולוגיה',
                summary: 'חוקרים הציגו מודל שפה מתקדם במיוחד ומדויק',
                content: '<p>פסקה ראשונה מעודכנת עם נתונים חדשים.</p>'
            })
        });

        assert.equal(updateRes.status, 200);
        const updateData = await updateRes.json();
        assert.equal(updateData.success, true);

        // Fetch for edit
        const editRes = await fetch(`${baseUrl}/api/articles/${testArticleId}/edit`, {
            headers: { 'Authorization': `Bearer ${reporterToken}` }
        });
        assert.equal(editRes.status, 200);
        const editData = await editRes.json();
        assert.equal(editData.article.title, 'פיתוח בינה מלאכותית חדשה - עדכון מחקר');
        assert.equal(editData.article.status, ARTICLE_STATUS.DRAFT);
    });

    await t.test('3. Reporter submits article for editor approval', async () => {
        const submitRes = await fetch(`${baseUrl}/api/articles/${testArticleId}/submit`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${reporterToken}` }
        });

        assert.equal(submitRes.status, 200);
        const submitData = await submitRes.json();
        assert.equal(submitData.success, true);
        assert.equal(submitData.status, ARTICLE_STATUS.PENDING_APPROVAL);
    });

    await t.test('4. Editor reviews article and returns for revisions with mandatory feedback', async () => {
        // Attempt rejection without feedback -> should fail (400)
        const failRes = await fetch(`${baseUrl}/api/articles/${testArticleId}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${editorToken}`
            },
            body: JSON.stringify({ feedback: '' })
        });
        assert.equal(failRes.status, 400);

        // Rejection with valid feedback
        const rejectRes = await fetch(`${baseUrl}/api/articles/${testArticleId}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${editorToken}`
            },
            body: JSON.stringify({ feedback: 'נא להוסיף קישור למאמר המדעי המקורי בפסקה הראשונה.' })
        });

        assert.equal(rejectRes.status, 200);
        const rejectData = await rejectRes.json();
        assert.equal(rejectData.success, true);
        assert.equal(rejectData.status, ARTICLE_STATUS.REVISION_REQUESTED);

        // Reporter fetches article and sees the feedback
        const repCheckRes = await fetch(`${baseUrl}/api/articles/${testArticleId}/edit`, {
            headers: { 'Authorization': `Bearer ${reporterToken}` }
        });
        assert.equal(repCheckRes.status, 200);
        const repCheckData = await repCheckRes.json();
        assert.equal(repCheckData.article.status, ARTICLE_STATUS.REVISION_REQUESTED);
        assert.equal(repCheckData.article.editorFeedback, 'נא להוסיף קישור למאמר המדעי המקורי בפסקה הראשונה.');
    });

    await t.test('5. Reporter fixes revisions and resubmits, Editor approves & publishes', async () => {
        // Auto-save corrections
        await fetch(`${baseUrl}/api/articles/${testArticleId}/autosave`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${reporterToken}`
            },
            body: JSON.stringify({
                content: '<p>פסקה ראשונה מעודכנת עם נתונים חדשים וקישור למאמר המדעי.</p>'
            })
        });

        // Resubmit
        const resubmitRes = await fetch(`${baseUrl}/api/articles/${testArticleId}/submit`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${reporterToken}` }
        });
        assert.equal(resubmitRes.status, 200);

        // Editor approves
        const approveRes = await fetch(`${baseUrl}/api/articles/${testArticleId}/approve`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${editorToken}` }
        });
        assert.equal(approveRes.status, 200);
        const approveData = await approveRes.json();
        assert.equal(approveData.article.status, ARTICLE_STATUS.PUBLISHED);
    });

    await t.test('6. Editor Review Diff View for Published Article Updates', async () => {
        // Reporter edits published article
        await fetch(`${baseUrl}/api/articles/${testArticleId}/autosave`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${reporterToken}`
            },
            body: JSON.stringify({
                title: 'פיתוח בינה מלאכותית חדשה - עדכון פורץ דרך!',
                content: '<p>פסקה ראשונה מעודכנת עם תוצאות הניסוי הסופי שנערך היום.</p>'
            })
        });

        // Reporter submits update
        await fetch(`${baseUrl}/api/articles/${testArticleId}/submit`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${reporterToken}` }
        });

        // Editor fetches review details for Diff View
        const reviewRes = await fetch(`${baseUrl}/api/articles/editor/${testArticleId}/review`, {
            headers: { 'Authorization': `Bearer ${editorToken}` }
        });
        assert.equal(reviewRes.status, 200);
        const reviewData = await reviewRes.json();
        assert.equal(reviewData.success, true);
        assert.equal(reviewData.article.isPublishedUpdate, true);
        assert.ok(reviewData.article.currentPublished);
        assert.ok(reviewData.article.pendingVersion);
        assert.equal(reviewData.article.currentPublished.title, 'פיתוח בינה מלאכותית חדשה - עדכון מחקר');
        assert.equal(reviewData.article.pendingVersion.title, 'פיתוח בינה מלאכותית חדשה - עדכון פורץ דרך!');

        // Public article remains untouched until approved
        const pubRes = await fetch(`${baseUrl}/api/articles/public/${testArticleId}`);
        assert.equal(pubRes.status, 200);
        const pubData = await pubRes.json();
        assert.equal(pubData.article.title, 'פיתוח בינה מלאכותית חדשה - עדכון מחקר');

        // Editor approves update
        const approveUpdateRes = await fetch(`${baseUrl}/api/articles/${testArticleId}/approve`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${editorToken}` }
        });
        assert.equal(approveUpdateRes.status, 200);

        // Now public article has the new title
        const pubAfterRes = await fetch(`${baseUrl}/api/articles/public/${testArticleId}`);
        assert.equal(pubAfterRes.status, 200);
        const pubAfterData = await pubAfterRes.json();
        assert.equal(pubAfterData.article.title, 'פיתוח בינה מלאכותית חדשה - עדכון פורץ דרך!');
    });
});
