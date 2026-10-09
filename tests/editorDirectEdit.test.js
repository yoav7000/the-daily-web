const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const Article = require('../src/models/Article');
const { ARTICLE_STATUS } = require('../src/constants/articleConstants');
const { connectTestDb, disconnectTestDb, createEditor, createReporter } = require('./helpers/testEnv');

let server;
let baseUrl;
let editor;
let reporter;

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

const publishedArticle = (overrides = {}) => Article.create({
    title: 'הכותרת המפורסמת',
    summary: 'תקציר',
    content: '<p>התוכן המפורסם</p>',
    category: 'חדשות',
    author: reporter.user.id,
    status: ARTICLE_STATUS.PUBLISHED,
    publishedAt: new Date(),
    ...overrides
});

test.before(async () => {
    await connectTestDb();
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
    editor = await createEditor('direct_editor');
    reporter = await createReporter('direct_reporter');
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectTestDb();
});

test('editor editing a pending update changes the update, not what readers see', async () => {
    const article = await publishedArticle();

    await api('PUT', `/api/articles/${article._id}/autosave`, { token: reporter.token, body: { title: 'עדכון של הכתב' } });
    await api('POST', `/api/articles/${article._id}/submit`, { token: reporter.token });

    const res = await api('PUT', `/api/articles/editor/${article._id}`, {
        token: editor.token,
        body: { title: 'עדכון של הכתב, בעריכת העורך', content: '<p>תוכן מתוקן</p>' }
    });
    assert.equal(res.status, 200);

    const publicView = await api('GET', `/api/articles/public/${article._id}`);
    assert.equal(publicView.body.article.title, 'הכותרת המפורסמת', 'readers still see the approved version');
    assert.equal(publicView.body.article.content, '<p>התוכן המפורסם</p>');

    const saved = await Article.findById(article._id);
    assert.equal(saved.draftVersion.title, 'עדכון של הכתב, בעריכת העורך');
    assert.equal(saved.draftVersion.status, ARTICLE_STATUS.PENDING_APPROVAL, 'still waits for approval');

    // approving makes the editor's version public
    await api('POST', `/api/articles/${article._id}/approve`, { token: editor.token });
    const afterApprove = await api('GET', `/api/articles/public/${article._id}`);
    assert.equal(afterApprove.body.article.title, 'עדכון של הכתב, בעריכת העורך');
});

test('editor editing a live article without a pending update records an update marker', async () => {
    const article = await publishedArticle();

    const res = await api('PUT', `/api/articles/editor/${article._id}`, { token: editor.token, body: { title: 'תיקון של העורך' } });
    assert.equal(res.status, 200);

    const saved = await Article.findById(article._id);
    assert.equal(saved.title, 'תיקון של העורך');
    assert.equal(saved.draftVersion, null);
    assert.equal(saved.revisionsHistory.length, 1, 'the change appears on the Impact Analytics graph');
});

test('editor editing an unpublished article changes it directly', async () => {
    const article = await publishedArticle({ status: ARTICLE_STATUS.PENDING_APPROVAL, publishedAt: null });

    await api('PUT', `/api/articles/editor/${article._id}`, { token: editor.token, body: { title: 'כותרת מתוקנת' } });

    const saved = await Article.findById(article._id);
    assert.equal(saved.title, 'כותרת מתוקנת');
    assert.equal(saved.status, ARTICLE_STATUS.PENDING_APPROVAL);
    assert.equal(saved.revisionsHistory.length, 0);
});

test('editor edit with a category that does not exist is refused and changes nothing', async () => {
    const article = await publishedArticle({ title: 'כתבה עם קטגוריה' });

    const res = await api('PUT', `/api/articles/editor/${article._id}`, { token: editor.token, body: { title: 'כותרת חדשה', category: 'NOPE' } });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /קטגוריה לא תקינה/);
    const stored = await Article.findById(article._id);
    assert.equal(stored.category, 'חדשות');
    assert.equal(stored.title, 'כתבה עם קטגוריה', 'nothing is saved when the request is refused');
});

test('Impact Analytics data is for editors only', async () => {
    const article = await publishedArticle();
    const path = `/api/analytics/article/${article._id}`;

    assert.equal((await api('GET', path)).status, 401, 'a guest is refused');
    assert.equal((await api('GET', path, { token: reporter.token })).status, 403, 'a reporter is refused');
    assert.equal((await api('GET', path, { token: editor.token })).status, 200, 'an editor gets the graph data');
});
