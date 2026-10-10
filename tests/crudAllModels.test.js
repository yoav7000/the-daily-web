const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const Article = require('../src/models/Article');
const Comment = require('../src/models/Comment');
const ViewStat = require('../src/models/ViewStat');
const User = require('../src/models/User');
const { ARTICLE_STATUS } = require('../src/constants/articleConstants');
const { connectTestDb, disconnectTestDb, createEditor, createReporter } = require('./helpers/testEnv');

let server;
let baseUrl;
let editor;
let reporter;

const api = async (method, path, { body, cookie } = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(cookie ? { Cookie: cookie } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch (err) { /* empty body */ }
    return { status: res.status, body: json };
};

test.before(async () => {
    await connectTestDb();
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
    editor = await createEditor('crud_editor', 'עורך הבדיקות');
    reporter = await createReporter('crud_reporter', 'כתב הבדיקות');
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectTestDb();
});

// Every model supports Create, Read (list + one), Update, Delete and a search on at least one main field.

test('Article: create, list/search, read, update, delete', async (t) => {
    let id;

    await t.test('create (reporter)', async () => {
        const res = await api('POST', '/api/articles', {
            cookie: reporter.cookie,
            body: { title: 'מחקר חדש על מדוזות', summary: 'תקציר', content: '<p>תוכן</p>', category: 'בריאות' }
        });
        assert.equal(res.status, 201);
        id = res.body.article._id;
        assert.equal(res.body.article.status, ARTICLE_STATUS.DRAFT);
    });

    await t.test('list and search (reporter sees own, finds by part of the title)', async () => {
        const mine = await api('GET', '/api/articles/my-articles?search=מדוז', { cookie: reporter.cookie });
        assert.equal(mine.body.articles.length, 1);
        const none = await api('GET', '/api/articles/my-articles?search=לא-קיים', { cookie: reporter.cookie });
        assert.equal(none.body.articles.length, 0);
        const all = await api('GET', '/api/articles/editor/all?search=מדוז', { cookie: editor.cookie });
        assert.equal(all.body.articles.length, 1);
    });

    await t.test('read one', async () => {
        const res = await api('GET', `/api/articles/${id}/edit`, { cookie: reporter.cookie });
        assert.equal(res.status, 200);
        assert.equal(res.body.article.title, 'מחקר חדש על מדוזות');
    });

    await t.test('update (reporter edits the draft, editor edits directly)', async () => {
        const byReporter = await api('PUT', `/api/articles/${id}/autosave`, { cookie: reporter.cookie, body: { title: 'מחקר מעודכן על מדוזות' } });
        assert.equal(byReporter.status, 200);
        const byEditor = await api('PUT', `/api/articles/editor/${id}`, { cookie: editor.cookie, body: { summary: 'תקציר שעודכן' } });
        assert.equal(byEditor.status, 200);
        const stored = await Article.findById(id);
        assert.equal(stored.title, 'מחקר מעודכן על מדוזות');
        assert.equal(stored.summary, 'תקציר שעודכן');
    });

    await t.test('delete (editor only)', async () => {
        assert.equal((await api('DELETE', `/api/articles/${id}`, { cookie: reporter.cookie })).status, 403);
        assert.equal((await api('DELETE', `/api/articles/${id}`, { cookie: editor.cookie })).status, 200);
        assert.equal(await Article.exists({ _id: id }), null);
    });
});

test('Comment: create, list/search, read, update, delete', async (t) => {
    const article = await Article.create({
        title: 'כתבה לתגובות', content: 'x', category: 'חדשות', author: reporter.user.id,
        status: ARTICLE_STATUS.PUBLISHED, publishedAt: new Date()
    });
    let id;

    await t.test('create (anyone, within the rate limit)', async () => {
        const res = await api('POST', `/api/articles/${article._id}/comments`, { body: { authorName: 'קורא סקרן', content: 'תגובה על מדוזות' } });
        assert.equal(res.status, 201);
        id = res.body.comment._id;
    });

    await t.test('list and search by part of the text or name', async () => {
        const onArticle = await api('GET', `/api/articles/${article._id}/comments?search=מדוז`);
        assert.equal(onArticle.body.comments.length, 1);
        const everything = await api('GET', '/api/comments?search=סקרן', { cookie: editor.cookie });
        assert.equal(everything.body.comments.length, 1);
        assert.equal(everything.body.comments[0].article.title, 'כתבה לתגובות');
    });

    await t.test('read one', async () => {
        const res = await api('GET', `/api/comments/${id}`);
        assert.equal(res.status, 200);
        assert.equal(res.body.comment.authorName, 'קורא סקרן');
    });

    await t.test('update (editor only)', async () => {
        assert.equal((await api('PUT', `/api/comments/${id}`, { body: { content: 'x' } })).status, 401);
        const res = await api('PUT', `/api/comments/${id}`, { cookie: editor.cookie, body: { content: 'תגובה מתוקנת', authorName: 'קורא מתוקן' } });
        assert.equal(res.status, 200);
        const stored = await Comment.findById(id);
        assert.equal(stored.content, 'תגובה מתוקנת');
        assert.equal(stored.authorName, 'קורא מתוקן');
    });

    await t.test('delete (editor only)', async () => {
        assert.equal((await api('DELETE', `/api/comments/${id}`, { cookie: reporter.cookie })).status, 403);
        assert.equal((await api('DELETE', `/api/comments/${id}`, { cookie: editor.cookie })).status, 200);
        assert.equal((await api('GET', `/api/comments/${id}`)).status, 404);
    });
});

test('ViewStat: create, list/search, read, update, delete', async (t) => {
    const article = await Article.create({
        title: 'כתבה לנתוני צפייה', content: 'x', category: 'חדשות', author: reporter.user.id,
        status: ARTICLE_STATUS.PUBLISHED, publishedAt: new Date()
    });
    let id;

    await t.test('create validates the hour and the article, and plots at the hour it belongs to', async () => {
        const body = (extra) => ({ cookie: editor.cookie, body: { articleId: article._id, viewCount: 25, ...extra } });

        assert.equal((await api('POST', '/api/analytics', body({ timeBucket: 'yesterday' }))).status, 400);
        assert.equal((await api('POST', '/api/analytics', body({ timeBucket: '2026-13-40-99' }))).status, 400);
        assert.equal((await api('POST', '/api/analytics', body({ timeBucket: '2026-10-07-14', viewCount: -3 }))).status, 400);
        assert.equal((await api('POST', '/api/analytics', body({ timeBucket: '2026-10-07-14', articleId: '507f1f77bcf86cd799439011' }))).status, 404);
        assert.equal((await api('POST', '/api/analytics', { body: { articleId: article._id, viewCount: 1 } })).status, 401);

        const res = await api('POST', '/api/analytics', body({ timeBucket: '2026-10-07-14', notes: 'ספירה ידנית' }));
        assert.equal(res.status, 201);
        id = res.body.stat._id;

        const stored = await ViewStat.findById(id);
        assert.equal(stored.viewedAt.getFullYear(), 2026);
        assert.equal(stored.viewedAt.getHours(), 14);
        assert.equal(stored.viewedAt.getMinutes(), 0);
    });

    await t.test('list and search by hour or note', async () => {
        const byNote = await api('GET', '/api/analytics?search=ידנית', { cookie: editor.cookie });
        assert.equal(byNote.body.stats.length, 1);
        const byHour = await api('GET', '/api/analytics?search=2026-10-07', { cookie: editor.cookie });
        assert.equal(byHour.body.stats.length, 1);
        assert.equal(byHour.body.stats[0].article.title, 'כתבה לנתוני צפייה');
    });

    await t.test('read one', async () => {
        const res = await api('GET', `/api/analytics/${id}`, { cookie: editor.cookie });
        assert.equal(res.status, 200);
        assert.equal(res.body.stat.viewCount, 25);
    });

    await t.test('update', async () => {
        const res = await api('PUT', `/api/analytics/${id}`, { cookie: editor.cookie, body: { viewCount: 40, notes: 'תוקן' } });
        assert.equal(res.status, 200);
        assert.equal((await ViewStat.findById(id)).viewCount, 40);
        assert.equal((await api('PUT', `/api/analytics/${id}`, { cookie: editor.cookie, body: { viewCount: 'הרבה' } })).status, 400);
    });

    await t.test('delete', async () => {
        assert.equal((await api('DELETE', `/api/analytics/${id}`, { cookie: reporter.cookie })).status, 403);
        assert.equal((await api('DELETE', `/api/analytics/${id}`, { cookie: editor.cookie })).status, 200);
        assert.equal(await ViewStat.exists({ _id: id }), null);
    });
});

test('User: create, list/search, read, update, delete (editor only)', async () => {
    const created = await api('POST', '/api/users', {
        cookie: editor.cookie,
        body: { username: 'crud_new', password: 'secret-pass-1', fullName: 'נועה חדשה', role: 'reporter' }
    });
    assert.equal(created.status, 201);
    const id = created.body.user.id;

    assert.equal((await api('GET', '/api/users?search=נוע', { cookie: editor.cookie })).body.users.length, 1);
    assert.equal((await api('GET', `/api/users/${id}`, { cookie: editor.cookie })).body.user.username, 'crud_new');
    assert.equal((await api('PUT', `/api/users/${id}`, { cookie: editor.cookie, body: { fullName: 'נועה מעודכנת' } })).status, 200);
    assert.equal((await User.findById(id)).fullName, 'נועה מעודכנת');
    assert.equal((await api('DELETE', `/api/users/${id}`, { cookie: reporter.cookie })).status, 403);
    assert.equal((await api('DELETE', `/api/users/${id}`, { cookie: editor.cookie })).status, 200);
    assert.equal(await User.exists({ _id: id }), null);
});
