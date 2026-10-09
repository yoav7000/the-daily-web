const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const Article = require('../src/models/Article');
const User = require('../src/models/User');
const ViewStat = require('../src/models/ViewStat');
const { ARTICLE_STATUS } = require('../src/constants/articleConstants');
const { connectTestDb, disconnectTestDb, createEditor, createReporter } = require('./helpers/testEnv');

let server;
let baseUrl;
let editorToken;
let reporterToken;
let articleId;

const api = (method, path, { body, token } = {}) => fetch(`${baseUrl}${path}`, {
    method,
    headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
});

test.before(async () => {
    await connectTestDb();
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });

    editorToken = (await createEditor('sec_editor')).token;

    const reporter = (await createReporter('sec_reporter', 'כתב')).user;
    reporterToken = (await createReporter('sec_reporter2', 'כתב נוסף')).token;
    const article = await Article.create({
        title: 'כתבה לבדיקות אבטחה',
        content: '<p>תוכן</p>',
        category: 'טכנולוגיה',
        author: reporter.id,
        status: ARTICLE_STATUS.PUBLISHED,
        publishedAt: new Date()
    });
    articleId = article._id.toString();
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectTestDb();
});

test('There is no public sign-up: accounts are only created by editors', async () => {
    const res = await api('POST', '/api/auth/register', {
        body: { username: 'sneaky', password: 'password123', fullName: 'Sneaky', role: 'editor' }
    });
    assert.equal(res.status, 404);
    assert.equal(await User.exists({ username: 'sneaky' }), null);
});

test('Only an editor can create accounts with a role', async () => {
    const asReporter = await api('POST', '/api/users', {
        token: reporterToken,
        body: { username: 'x1', password: 'password123', fullName: 'X', role: 'editor' }
    });
    assert.equal(asReporter.status, 403);

    const asGuest = await api('POST', '/api/users', {
        body: { username: 'x2', password: 'password123', fullName: 'X', role: 'editor' }
    });
    assert.equal(asGuest.status, 401);

    const asEditor = await api('POST', '/api/users', {
        token: editorToken,
        body: { username: 'new_editor', password: 'password123', fullName: 'New Editor', role: 'editor' }
    });
    assert.equal(asEditor.status, 201);
    assert.equal((await asEditor.json()).user.role, 'editor');
});

test('Login rejects non-string credentials instead of crashing', async () => {
    const res = await api('POST', '/api/auth/login', { body: { username: { $ne: '' }, password: { $ne: '' } } });
    assert.equal(res.status, 400);
});

test('Comments never expose the commenter IP, and the full list is editor only', async () => {
    const created = await api('POST', `/api/articles/${articleId}/comments`, {
        body: { authorName: 'אורח', content: 'תגובה' }
    });
    assert.equal(created.status, 201);
    assert.equal('clientIp' in (await created.json()).comment, false);

    const list = await api('GET', `/api/articles/${articleId}/comments`);
    const { comments } = await list.json();
    assert.equal(comments.length, 1);
    assert.equal('clientIp' in comments[0], false);

    assert.equal((await api('GET', '/api/comments')).status, 401);
    assert.equal((await api('GET', '/api/comments', { token: editorToken })).status, 200);
});

test('Query operators in filters are ignored and bad input gives 400, not 500', async () => {
    const injected = await api('GET', '/api/articles/public?category[$ne]=none');
    assert.equal(injected.status, 200);
    assert.equal((await injected.json()).articles.length, 0);

    const badTitle = await api('POST', '/api/articles', {
        token: reporterToken,
        body: { title: 123, content: 'x', category: 'טכנולוגיה' }
    });
    assert.equal(badTitle.status, 400);
});

test('Page size is capped', async () => {
    const res = await api('GET', '/api/articles/public?limit=100000');
    assert.equal((await res.json()).pagination.totalPages, 1);
});

test('Top articles only lists published articles', async () => {
    const reporter = await User.findOne({ username: 'sec_reporter' });
    const draft = await Article.create({
        title: 'טיוטה סודית',
        content: 'x',
        category: 'טכנולוגיה',
        author: reporter._id,
        status: ARTICLE_STATUS.DRAFT
    });
    await ViewStat.create({ article: draft._id, timeBucket: '2026-01-01-10', viewCount: 999 });
    await ViewStat.create({ article: articleId, timeBucket: '2026-01-01-10', viewCount: 5 });

    const res = await api('GET', '/api/analytics/overview/top');
    const { topArticles } = await res.json();
    assert.deepEqual(topArticles.map((a) => a._id), [articleId]);
});

test('Role segregation: an editor cannot create articles or access the reporter desk API', async () => {
    const resCreate = await api('POST', '/api/articles', {
        token: editorToken,
        body: { title: 'כתבה מעורך', content: '<p>תוכן</p>', category: 'טכנולוגיה' }
    });
    assert.equal(resCreate.status, 403);

    const resMine = await api('GET', '/api/articles/my-articles', {
        token: editorToken
    });
    assert.equal(resMine.status, 403);
});
