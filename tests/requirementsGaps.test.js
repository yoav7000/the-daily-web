const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const Article = require('../src/models/Article');
const User = require('../src/models/User');
const ViewStat = require('../src/models/ViewStat');
const { ARTICLE_STATUS } = require('../src/constants/articleConstants');
const { getTimeBucketKey } = require('../src/controllers/analyticsController');
const { connectTestDb, disconnectTestDb, createEditor, createReporter } = require('./helpers/testEnv');

let server;
let baseUrl;
let editor;
let reporterToken;
let reporterId;

const api = async (method, path, { body, token } = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch (err) { /* empty body */ }
    return { status: res.status, body: json };
};

const newArticle = async (overrides = {}) => {
    const res = await api('POST', '/api/articles', {
        token: reporterToken,
        body: { title: 'כתבת בדיקה', summary: 'תקציר', content: '<p>תוכן</p>', category: 'טכנולוגיה', ...overrides }
    });
    return res.body.article._id;
};

test.before(async () => {
    await connectTestDb();
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });

    editor = await createEditor('gap_editor', 'עורך ראשי');
    const reporter = await createReporter('gap_reporter', 'כתב בדיקות');
    reporterToken = reporter.token;
    reporterId = reporter.user.id;
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectTestDb();
});

test('An article waiting for the editor is locked for editing on the server', async (t) => {
    const id = await newArticle();

    await t.test('draft can be edited', async () => {
        const res = await api('PUT', `/api/articles/${id}/autosave`, { token: reporterToken, body: { title: 'כותרת חדשה' } });
        assert.equal(res.status, 200);
    });

    await t.test('after submitting, edits are rejected', async () => {
        await api('POST', `/api/articles/${id}/submit`, { token: reporterToken });
        const res = await api('PUT', `/api/articles/${id}/autosave`, { token: reporterToken, body: { title: 'שינוי אחרי הגשה' } });
        assert.equal(res.status, 409);
        assert.equal((await Article.findById(id)).title, 'כותרת חדשה');
    });

    await t.test('returned for revisions, it is editable again', async () => {
        await api('POST', `/api/articles/${id}/reject`, { token: editor.token, body: { feedback: 'נא לתקן' } });
        const res = await api('PUT', `/api/articles/${id}/autosave`, { token: reporterToken, body: { title: 'אחרי תיקון' } });
        assert.equal(res.status, 200);
    });

    await t.test('an update to a published article is locked while it waits for approval', async () => {
        await api('POST', `/api/articles/${id}/submit`, { token: reporterToken });
        await api('POST', `/api/articles/${id}/approve`, { token: editor.token });

        assert.equal((await api('PUT', `/api/articles/${id}/autosave`, { token: reporterToken, body: { title: 'עדכון ראשון' } })).status, 200);
        await api('POST', `/api/articles/${id}/submit`, { token: reporterToken });
        assert.equal((await api('PUT', `/api/articles/${id}/autosave`, { token: reporterToken, body: { title: 'עדכון נסתר' } })).status, 409);

        const stored = await Article.findById(id);
        assert.equal(stored.draftVersion.title, 'עדכון ראשון');
    });
});

test('Impact analytics: one publish milestone, marked positions, continuous time axis', async (t) => {
    const id = await newArticle({ title: 'כתבה לאנליטיקה' });
    await api('POST', `/api/articles/${id}/submit`, { token: reporterToken });
    await api('POST', `/api/articles/${id}/approve`, { token: editor.token });

    await t.test('a normally published article has a single milestone and nothing to compare', async () => {
        const res = await api('GET', `/api/analytics/article/${id}`);
        assert.deepEqual(res.body.milestones.map((m) => m.type), ['INITIAL_PUBLISH']);
        assert.equal(res.body.impactAnalysis, null);
    });

    await t.test('an approved update becomes a second milestone placed on the graph', async () => {
        // make the history realistic: published 10 hours ago, updated 4 hours ago, with views around both
        const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000);
        const publishedAt = hoursAgo(10);
        await Article.updateOne({ _id: id }, {
            publishedAt,
            revisionsHistory: [
                { approvedAt: publishedAt, approvedBy: editor.user.id, changesSummary: 'פרסום ראשוני' },
                { approvedAt: hoursAgo(4), approvedBy: editor.user.id, changesSummary: 'עדכון' }
            ]
        });
        // 10 views per hour before the update, none in the 2 hours after it, 100 views in the last hour
        for (const [h, views] of [[9, 10], [8, 10], [7, 10], [6, 10], [5, 10], [1, 100]]) {
            await ViewStat.create({ article: id, timeBucket: getTimeBucketKey(hoursAgo(h)), viewedAt: hoursAgo(h), viewCount: views });
        }

        const res = await api('GET', `/api/analytics/article/${id}`);
        const { milestones, timeline, impactAnalysis } = res.body;

        assert.deepEqual(milestones.map((m) => m.type), ['INITIAL_PUBLISH', 'REVISION_UPDATE']);
        assert.equal(milestones[1].title, 'עדכון גרסה #1');

        // continuous hourly axis: about 10 hours, the hours without views show as 0
        assert.equal(timeline.granularity, 'hour');
        assert.ok(timeline.labels.length >= 10 && timeline.labels.length <= 12);
        assert.equal(timeline.labels.length, timeline.views.length);
        assert.ok(timeline.views.filter((v) => v === 0).length >= 3);

        // the markers point at the right place on that axis
        const updateIndex = milestones[1].pointIndex;
        assert.ok(updateIndex > milestones[0].pointIndex && updateIndex < timeline.labels.length);
        const updateTime = timeline.timestamps[updateIndex];
        assert.ok(Math.abs(updateTime - new Date(milestones[1].timestamp).getTime()) < 3600 * 1000);

        // before: 50 views over ~6 hours, after: 100 views over ~4 hours (hours without views count too)
        assert.equal(impactAnalysis.viewsBeforeUpdate, 50);
        assert.equal(impactAnalysis.viewsAfterUpdate, 100);
        assert.ok(impactAnalysis.avgHourlyAfter > impactAnalysis.avgHourlyBefore);
        assert.equal(impactAnalysis.isPositiveImpact, true);
    });
});

test('Search finds partial words', async () => {
    const reporter = await User.findById(reporterId);
    await Article.create({
        title: 'הבורסה רשמה עליות חדות היום',
        summary: 'מדד ת"א 35 עלה',
        content: '<p>טקסט</p>',
        category: 'כלכלה',
        author: reporter._id,
        status: ARTICLE_STATUS.PUBLISHED,
        publishedAt: new Date()
    });

    for (const term of ['הבורסה', 'בורס', 'עליו', 'ת"א', 'חדות']) {
        const res = await api('GET', `/api/articles/public?search=${encodeURIComponent(term)}`);
        assert.equal(res.body.articles.length, 1, `"${term}" should find the article`);
    }
    const none = await api('GET', `/api/articles/public?search=${encodeURIComponent('לא קיים')}`);
    assert.equal(none.body.articles.length, 0);

    // characters with a special meaning in regular expressions are treated as plain text
    const special = await api('GET', `/api/articles/public?search=${encodeURIComponent('.*')}`);
    assert.equal(special.status, 200);
    assert.equal(special.body.articles.length, 0);
});

test('Users: full CRUD and search for editors', async (t) => {
    let userId;

    await t.test('only editors can manage users', async () => {
        assert.equal((await api('GET', '/api/users')).status, 401);
        assert.equal((await api('GET', '/api/users', { token: reporterToken })).status, 403);
    });

    await t.test('create', async () => {
        const res = await api('POST', '/api/users', {
            token: editor.token,
            body: { username: 'dana_levi', password: 'secret123', fullName: 'דנה לוי', role: 'reporter' }
        });
        assert.equal(res.status, 201);
        userId = res.body.user.id;
        assert.equal('password' in res.body.user, false);

        const duplicate = await api('POST', '/api/users', {
            token: editor.token,
            body: { username: 'dana_levi', password: 'secret123', fullName: 'אחרת' }
        });
        assert.equal(duplicate.status, 400);
    });

    await t.test('list and search by part of the name or username', async () => {
        const all = await api('GET', '/api/users', { token: editor.token });
        assert.ok(all.body.users.length >= 3);
        assert.equal(all.body.users.some((u) => 'password' in u), false);

        const byName = await api('GET', `/api/users?search=${encodeURIComponent('דנ')}`, { token: editor.token });
        assert.deepEqual(byName.body.users.map((u) => u.username), ['dana_levi']);

        const byUsername = await api('GET', '/api/users?search=LEVI', { token: editor.token });
        assert.equal(byUsername.body.users.length, 1);

        const editors = await api('GET', '/api/users?role=editor', { token: editor.token });
        assert.ok(editors.body.users.every((u) => u.role === 'editor'));
    });

    await t.test('read one', async () => {
        const res = await api('GET', `/api/users/${userId}`, { token: editor.token });
        assert.equal(res.status, 200);
        assert.equal(res.body.user.fullName, 'דנה לוי');
        assert.equal((await api('GET', '/api/users/507f1f77bcf86cd799439011', { token: editor.token })).status, 404);
    });

    await t.test('update name, role and password (new password works, old one does not)', async () => {
        const res = await api('PUT', `/api/users/${userId}`, {
            token: editor.token,
            body: { fullName: 'דנה כהן', role: 'editor', password: 'newsecret456' }
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.user.role, 'editor');

        const oldLogin = await api('POST', '/api/auth/login', { body: { username: 'dana_levi', password: 'secret123' } });
        assert.equal(oldLogin.status, 401);
        const newLogin = await api('POST', '/api/auth/login', { body: { username: 'dana_levi', password: 'newsecret456' } });
        assert.equal(newLogin.status, 200);

        const invalid = await api('PUT', `/api/users/${userId}`, { token: editor.token, body: { role: 'guest' } });
        assert.equal(invalid.status, 400);
    });

    await t.test('a deactivated user can no longer log in', async () => {
        await api('PUT', `/api/users/${userId}`, { token: editor.token, body: { isActive: false } });
        const login = await api('POST', '/api/auth/login', { body: { username: 'dana_levi', password: 'newsecret456' } });
        assert.equal(login.status, 401);
    });

    await t.test('the last active editor cannot be removed, demoted or deactivated', async () => {
        await api('PUT', `/api/users/${userId}`, { token: editor.token, body: { role: 'reporter' } }); // dana is no longer an editor
        const demote = await api('PUT', `/api/users/${editor.user.id}`, { token: editor.token, body: { role: 'reporter' } });
        assert.equal(demote.status, 400);
        const deactivate = await api('PUT', `/api/users/${editor.user.id}`, { token: editor.token, body: { isActive: false } });
        assert.equal(deactivate.status, 400);
        const deleteSelf = await api('DELETE', `/api/users/${editor.user.id}`, { token: editor.token });
        assert.equal(deleteSelf.status, 400);
    });

    await t.test('delete: blocked when the user wrote articles, allowed otherwise', async () => {
        const withArticles = await api('DELETE', `/api/users/${reporterId}`, { token: editor.token });
        assert.equal(withArticles.status, 409);

        const res = await api('DELETE', `/api/users/${userId}`, { token: editor.token });
        assert.equal(res.status, 200);
        assert.equal((await api('GET', `/api/users/${userId}`, { token: editor.token })).status, 404);
    });
});
