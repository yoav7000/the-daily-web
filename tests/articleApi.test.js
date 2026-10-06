const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const app = require('../src/app');
const Article = require('../src/models/Article');
const User = require('../src/models/User');
const { connectTestDb, disconnectTestDb, createEditor, createReporter } = require('./helpers/testEnv');

let server;
let baseUrl;

// Helper to make HTTP requests
const request = (method, path, body = null, headers = {}) => {
    return new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl);
        const options = {
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = data;
                }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: parsed
                });
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
};

test.before(async () => {
    await connectTestDb();
    await Article.deleteMany({});
    await User.deleteMany({});

    await new Promise((resolve) => {
        server = app.listen(0, () => {
            const port = server.address().port;
            baseUrl = `http://localhost:${port}`;
            resolve();
        });
    });
});

test.after(async () => {
    await Article.deleteMany({});
    await User.deleteMany({});
    await new Promise(resolve => server.close(resolve));
    await disconnectTestDb();
});

test('Complete Article RESTful API Flow', async (t) => {
    let reporterToken = null;
    let editorToken = null;
    let articleId = null;

    await t.test('1. Create reporter and editor accounts', async () => {
        const reporter = await createReporter('reporter1', 'ישראל ישראלי');
        reporterToken = reporter.token;
        assert.ok(reporterToken);

        const editor = await createEditor('editor1', 'רונית העורכת');
        editorToken = editor.token;
        assert.ok(editorToken);
    });

    await t.test('2. Reporter creates a new draft article via POST /api/articles', async () => {
        const res = await request('POST', '/api/articles', {
            title: 'גילויים חדשים בחקר החלל',
            summary: 'טלסקופ החלל תיעד כוכב לכת חדש',
            content: '<p>פירוט מלא על הגילוי בחלל...</p>',
            category: 'טכנולוגיה'
        }, {
            Authorization: `Bearer ${reporterToken}`
        });

        assert.equal(res.status, 201);
        assert.equal(res.body.article.status, 'draft');
        articleId = res.body.article._id;
    });

    await t.test('3. Auto-save API updates draft without changing state or losing work', async () => {
        const res = await request('PUT', `/api/articles/${articleId}/autosave`, {
            content: '<p>פירוט מלא ומעודכן שנשמר אוטומטית...</p>'
        }, {
            Authorization: `Bearer ${reporterToken}`
        });

        assert.equal(res.status, 200);
        assert.equal(res.body.success, true);
    });

    await t.test('4. Reporter submits article for editor review -> "pending_approval"', async () => {
        const res = await request('POST', `/api/articles/${articleId}/submit`, {}, {
            Authorization: `Bearer ${reporterToken}`
        });

        assert.equal(res.status, 200);
        assert.equal(res.body.status, 'pending_approval');
    });

    await t.test('5. Unauthorized state jumps are blocked (Reporter cannot approve or publish)', async () => {
        const res = await request('POST', `/api/articles/${articleId}/approve`, {}, {
            Authorization: `Bearer ${reporterToken}`
        });

        assert.equal(res.status, 403, 'Reporter must not be allowed to approve articles');
    });

    await t.test('6. Editor returning for revisions requires mandatory feedback note', async () => {
        // Missing feedback note -> 400
        const resFail = await request('POST', `/api/articles/${articleId}/reject`, {}, {
            Authorization: `Bearer ${editorToken}`
        });
        assert.equal(resFail.status, 400);

        // With valid feedback note -> 200
        const resSuccess = await request('POST', `/api/articles/${articleId}/reject`, {
            feedback: 'יש לצרף צילומי לוויין באיכות גבוהה יותר'
        }, {
            Authorization: `Bearer ${editorToken}`
        });
        assert.equal(resSuccess.status, 200);
        assert.equal(resSuccess.body.status, 'revision_requested');
    });

    await t.test('7. Reporter retrieves returned article, sees feedback, edits and resubmits', async () => {
        const resGet = await request('GET', `/api/articles/${articleId}/edit`, null, {
            Authorization: `Bearer ${reporterToken}`
        });
        assert.equal(resGet.status, 200);
        assert.equal(resGet.body.article.editorFeedback, 'יש לצרף צילומי לוויין באיכות גבוהה יותר');

        // Resubmit
        const resSubmit = await request('POST', `/api/articles/${articleId}/submit`, {}, {
            Authorization: `Bearer ${reporterToken}`
        });
        assert.equal(resSubmit.status, 200);
        assert.equal(resSubmit.body.status, 'pending_approval');
    });

    await t.test('8. Editor approves article -> published publicly', async () => {
        const res = await request('POST', `/api/articles/${articleId}/approve`, {}, {
            Authorization: `Bearer ${editorToken}`
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.article.status, 'published');

        // Public can now view it
        const resPublic = await request('GET', `/api/articles/public/${articleId}`);
        assert.equal(resPublic.status, 200);
        assert.equal(resPublic.body.article.title, 'גילויים חדשים בחקר החלל');
    });

    await t.test('9. Editing published article keeps public version live while auto-saving draft update', async () => {
        // Reporter edits the published article
        const resAutoSave = await request('PUT', `/api/articles/${articleId}/autosave`, {
            title: 'גילויים חדשים בחקר החלל: עדכון מרעיש מהטלסקופ!',
            content: '<p>התוכן החדש והמעודכן שטרם אושר לפרסום...</p>'
        }, {
            Authorization: `Bearer ${reporterToken}`
        });
        assert.equal(resAutoSave.status, 200);
        assert.equal(resAutoSave.body.isPublished, true);

        // Public STILL sees original title and content!
        const resPublic = await request('GET', `/api/articles/public/${articleId}`);
        assert.equal(resPublic.status, 200);
        assert.equal(resPublic.body.article.title, 'גילויים חדשים בחקר החלל');

        // Reporter submits the update for editor approval
        const resSubmit = await request('POST', `/api/articles/${articleId}/submit`, {}, {
            Authorization: `Bearer ${reporterToken}`
        });
        assert.equal(resSubmit.status, 200);

        // Public STILL sees original title and content!
        const resPublic2 = await request('GET', `/api/articles/public/${articleId}`);
        assert.equal(resPublic2.body.article.title, 'גילויים חדשים בחקר החלל');

        // Editor reviews diff
        const resReview = await request('GET', `/api/articles/editor/${articleId}/review`, null, {
            Authorization: `Bearer ${editorToken}`
        });
        assert.equal(resReview.status, 200);
        assert.equal(resReview.body.article.currentPublished.title, 'גילויים חדשים בחקר החלל');
        assert.equal(resReview.body.article.pendingVersion.title, 'גילויים חדשים בחקר החלל: עדכון מרעיש מהטלסקופ!');

        // Editor approves update
        const resApprove = await request('POST', `/api/articles/${articleId}/approve`, {}, {
            Authorization: `Bearer ${editorToken}`
        });
        assert.equal(resApprove.status, 200);

        // NOW public sees the new approved update!
        const resPublicUpdated = await request('GET', `/api/articles/public/${articleId}`);
        assert.equal(resPublicUpdated.body.article.title, 'גילויים חדשים בחקר החלל: עדכון מרעיש מהטלסקופ!');
    });
});
