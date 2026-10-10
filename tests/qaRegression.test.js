const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const Article = require('../src/models/Article');
const Comment = require('../src/models/Comment');
const ViewStat = require('../src/models/ViewStat');
const { ARTICLE_STATUS } = require('../src/constants/articleConstants');
const { resetLoginAttempts } = require('../src/middleware/loginRateLimiter');
const { connectTestDb, disconnectTestDb, createEditor, createReporter } = require('./helpers/testEnv');

let server;
let baseUrl;
let editor;
let reporter;

const api = async (method, path, { body, cookie, headers } = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(cookie ? { Cookie: cookie } : {}),
            ...headers
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (err) { /* a page, not json */ }
    return { status: res.status, body: json, text, headers: res.headers };
};

const publish = (title, extra = {}) => Article.create({
    title,
    content: '<p>x</p>',
    category: 'חדשות',
    author: reporter.user.id,
    status: ARTICLE_STATUS.PUBLISHED,
    publishedAt: new Date(),
    ...extra
});

test.before(async () => {
    await connectTestDb();
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
    editor = await createEditor('qa_editor', 'עורך QA');
    reporter = await createReporter('qa_reporter', 'כתב QA');
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectTestDb();
});

// ---------------------------------------------------------------------------------------------
test('QA 1: dashboards get exact counts and can page through every article (nothing is cut off)', async (t) => {
    const make = (status, count, extra = {}) => Article.insertMany(Array.from({ length: count }, (_, i) => ({
        title: `${status} ${i}`, content: 'x', category: 'חדשות', author: reporter.user.id, status,
        publishedAt: status === ARTICLE_STATUS.PUBLISHED ? new Date(Date.now() - i * 1000) : null, ...extra
    })));
    // more than the old 500 article cap
    await make(ARTICLE_STATUS.PUBLISHED, 520);
    await make(ARTICLE_STATUS.DRAFT, 9);
    await make(ARTICLE_STATUS.PENDING_APPROVAL, 4);
    await make(ARTICLE_STATUS.REVISION_REQUESTED, 3);
    await Article.updateMany({ title: /^published 0$/ }, { draftVersion: { title: 'עדכון', status: ARTICLE_STATUS.PENDING_APPROVAL } });

    await t.test('editor counters match the database, however many articles there are', async () => {
        const res = await api('GET', '/api/articles/editor/stats', { cookie: editor.cookie });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.stats, {
            total: 536, published: 520, draft: 9, pending_approval: 4, revision_requested: 3, pendingUpdates: 1, revisionUpdates: 0
        });
    });

    await t.test('the editor list can be paged to the very last article', async () => {
        const seen = new Set();
        let page = 1;
        let totalPages = 1;
        do {
            const res = await api('GET', `/api/articles/editor/all?limit=100&page=${page}`, { cookie: editor.cookie });
            res.body.articles.forEach((a) => seen.add(a._id));
            totalPages = res.body.pagination.totalPages;
            page += 1;
        } while (page <= totalPages);
        assert.equal(seen.size, 536);
    });

    await t.test('status filters count correctly on the server', async () => {
        const drafts = await api('GET', '/api/articles/editor/all?status=draft&limit=1', { cookie: editor.cookie });
        assert.equal(drafts.body.pagination.totalCount, 9);
        const updates = await api('GET', '/api/articles/editor/all?status=pending_update&limit=1', { cookie: editor.cookie });
        assert.equal(updates.body.pagination.totalCount, 1);
    });

    await t.test('"waiting for review" covers new submissions and updates to published articles, with search on top', async () => {
        const all = await api('GET', '/api/articles/editor/all?status=needs_review&limit=100', { cookie: editor.cookie });
        assert.equal(all.body.pagination.totalCount, 5, '4 submissions + 1 update to a published article');
        const searched = await api('GET', `/api/articles/editor/all?status=needs_review&search=${encodeURIComponent('pending_approval 1')}`, { cookie: editor.cookie });
        assert.equal(searched.body.pagination.totalCount, 1);
    });

    await t.test('reporter counters only count their own articles', async () => {
        const other = await createReporter('qa_other', 'כתב אחר');
        await Article.create({ title: 'של אחר', content: 'x', category: 'חדשות', author: other.user.id, status: ARTICLE_STATUS.DRAFT });
        const res = await api('GET', '/api/articles/my-stats', { cookie: reporter.cookie });
        assert.equal(res.body.stats.total, 536);
        assert.equal(res.body.stats.draft, 9);
        assert.equal((await api('GET', '/api/articles/my-stats', { cookie: other.cookie })).body.stats.total, 1);
        assert.equal((await api('GET', '/api/articles/my-stats')).status, 401);
        assert.equal((await api('GET', '/api/articles/editor/stats', { cookie: reporter.cookie })).status, 403);
    });
});

// ---------------------------------------------------------------------------------------------
test('QA 2: "viewed / not viewed" filters the whole archive, not just the loaded pages', async () => {
    await Article.deleteMany({});
    const articles = [];
    for (let i = 0; i < 45; i++) {
        articles.push(await publish(`כתבה ${i}`, { publishedAt: new Date(Date.now() - i * 60000) }));
    }
    const newest = articles[0]._id.toString();
    const oldest = articles[44]._id.toString(); // would be on page 3 of the feed
    const ids = `${newest},${oldest}`;

    const read = await api('GET', `/api/articles/public?viewed=read&viewedIds=${ids}&limit=20`);
    assert.deepEqual(read.body.articles.map((a) => a._id).sort(), [newest, oldest].sort(), 'the old viewed article must be found');
    assert.equal(read.body.pagination.totalCount, 2);

    const unread = await api('GET', `/api/articles/public?viewed=unread&viewedIds=${ids}&limit=20`);
    assert.equal(unread.body.pagination.totalCount, 43);
    assert.ok(unread.body.articles.every((a) => a._id !== newest && a._id !== oldest));

    // pagination still works inside the filter
    const unreadPage3 = await api('GET', `/api/articles/public?viewed=unread&viewedIds=${ids}&limit=20&page=3`);
    assert.equal(unreadPage3.body.articles.length, 3);

    // nothing viewed yet / junk in the list
    assert.equal((await api('GET', '/api/articles/public?viewed=read&limit=20')).body.pagination.totalCount, 0);
    assert.equal((await api('GET', '/api/articles/public?viewed=unread&limit=20')).body.pagination.totalCount, 45);
    const junk = await api('GET', `/api/articles/public?viewed=unread&viewedIds=${encodeURIComponent('abc,{"$ne":1},,' + newest)}&limit=1`);
    assert.equal(junk.status, 200);
    assert.equal(junk.body.pagination.totalCount, 44);
    assert.equal((await api('GET', '/api/articles/public?viewed[$ne]=x&limit=1')).status, 200);
});

// ---------------------------------------------------------------------------------------------
test('QA 3: deleting an article also removes its comments and view statistics', async () => {
    const article = await publish('כתבה למחיקה');
    const survivor = await publish('כתבה ששורדת');
    await Comment.create({ article: article._id, authorName: 'א', content: 'תגובה', clientIp: '1.1.1.1' });
    await Comment.create({ article: article._id, authorName: 'ב', content: 'עוד תגובה', clientIp: '1.1.1.2' });
    await Comment.create({ article: survivor._id, authorName: 'ג', content: 'נשארת', clientIp: '1.1.1.3' });
    await ViewStat.create({ article: article._id, timeBucket: '2026-10-07-10', viewCount: 5 });
    await ViewStat.create({ article: survivor._id, timeBucket: '2026-10-07-10', viewCount: 7 });

    const res = await api('DELETE', `/api/articles/${article._id}`, { cookie: editor.cookie });
    assert.equal(res.status, 200);

    assert.equal(await Comment.countDocuments({ article: article._id }), 0);
    assert.equal(await ViewStat.countDocuments({ article: article._id }), 0);
    assert.equal(await Comment.countDocuments({ article: survivor._id }), 1, 'other articles keep their comments');
    assert.equal(await ViewStat.countDocuments({ article: survivor._id }), 1);
});

// ---------------------------------------------------------------------------------------------
test('QA 4: broken links get a proper page, the favicon exists, and headers are tidy', async (t) => {
    await t.test('a mistyped article link is a styled 404 page, not JSON', async () => {
        const res = await api('GET', '/article/not-an-id');
        assert.equal(res.status, 404);
        assert.match(res.headers.get('content-type'), /text\/html/);
        assert.match(res.text, /The Daily Web/);
        assert.match(res.text, /<a class="btn btn-primary btn-lg" href="\/">/);
        assert.doesNotMatch(res.text, /"success"/);
    });

    await t.test('an article that does not exist or was deleted is a styled 404 page', async () => {
        const res = await api('GET', '/article/507f1f77bcf86cd799439011');
        assert.equal(res.status, 404);
        assert.match(res.headers.get('content-type'), /text\/html/);
        assert.match(res.text, /הכתבה לא נמצאה/);
    });

    await t.test('an unpublished article is not shown', async () => {
        const draft = await Article.create({ title: 'טיוטה', content: 'x', category: 'חדשות', author: reporter.user.id, status: ARTICLE_STATUS.DRAFT });
        assert.equal((await api('GET', `/article/${draft._id}`)).status, 404);
    });

    await t.test('any other unknown address is the same styled page (not the English Express page)', async () => {
        const res = await api('GET', '/this/page/does/not/exist');
        assert.equal(res.status, 404);
        assert.match(res.text, /העמוד לא נמצא/);
        assert.doesNotMatch(res.text, /Cannot GET/);
    });

    await t.test('API errors stay JSON', async () => {
        const res = await api('GET', '/api/nope');
        assert.equal(res.status, 404);
        assert.equal(res.body.success, false);
        assert.equal((await api('GET', '/api/articles/public/not-an-id')).status, 400);
    });

    await t.test('/favicon.ico answers with an icon', async () => {
        const res = await api('GET', '/favicon.ico');
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type'), /image\/svg\+xml/);
        assert.equal((await api('GET', '/favicon.svg')).status, 200);
    });

    await t.test('the framework is not advertised and basic protective headers are sent', async () => {
        const res = await api('GET', '/api/health');
        assert.equal(res.headers.get('x-powered-by'), null);
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    });
});

// ---------------------------------------------------------------------------------------------
test('QA 5: repeated wrong passwords are throttled', async (t) => {
    process.env.LOGIN_MAX_ATTEMPTS = '3';
    resetLoginAttempts();
    t.after(() => { delete process.env.LOGIN_MAX_ATTEMPTS; resetLoginAttempts(); });

    const login = (username, password) => api('POST', '/api/auth/login', { body: { username, password } });

    for (let i = 0; i < 3; i++) {
        assert.equal((await login('qa_reporter', `wrong-${i}`)).status, 401);
    }

    const locked = await login('qa_reporter', 'password123'); // even the right password waits
    assert.equal(locked.status, 429);
    assert.ok(Number(locked.headers.get('retry-after')) > 0);
    assert.ok(locked.body.retryAfterSeconds > 0);

    // other accounts from the same address are still allowed to try
    assert.equal((await login('qa_editor', 'password123')).status, 200);

    // the window passing lifts the lock (simulated by clearing the counters)
    resetLoginAttempts();
    assert.equal((await login('qa_reporter', 'password123')).status, 200);

    // a successful login resets the count for that user
    await login('qa_reporter', 'wrong-a');
    await login('qa_reporter', 'wrong-b');
    assert.equal((await login('qa_reporter', 'password123')).status, 200);
    await login('qa_reporter', 'wrong-c');
    await login('qa_reporter', 'wrong-d');
    assert.equal((await login('qa_reporter', 'password123')).status, 200, 'the count started again after the success');
});

// ---------------------------------------------------------------------------------------------
test('QA 6: the public feed never repeats or skips an article while scrolling, in every sort order', async () => {
    await Article.deleteMany({});
    await ViewStat.deleteMany({});
    const sameMoment = new Date('2026-10-01T10:00:00Z'); // 120 articles published at exactly the same time
    const docs = await Article.insertMany(Array.from({ length: 120 }, (_, i) => ({
        title: `זהה ${i}`, content: 'x', category: 'חדשות', author: reporter.user.id,
        status: ARTICLE_STATUS.PUBLISHED, publishedAt: sameMoment
    })));
    // article 7 is the most viewed, article 3 the second
    await ViewStat.create({ article: docs[7]._id, timeBucket: '2026-10-01-10', viewCount: 900 });
    await ViewStat.create({ article: docs[3]._id, timeBucket: '2026-10-01-10', viewCount: 400 });
    await ViewStat.create({ article: docs[3]._id, timeBucket: '2026-10-01-11', viewCount: 300 }); // 700 in total

    const scrollThrough = async (query) => {
        const ids = [];
        for (let page = 1; page <= 6; page++) {
            const res = await api('GET', `/api/articles/public?limit=20&page=${page}&${query}`);
            ids.push(...res.body.articles.map((a) => a._id));
        }
        return ids;
    };

    for (const sort of ['newest', 'oldest', 'popular']) {
        const ids = await scrollThrough(`sort=${sort}`);
        assert.equal(ids.length, 120, `${sort}: 6 pages of 20`);
        assert.equal(new Set(ids).size, 120, `${sort}: no article twice and none missing`);
    }

    const popular = await scrollThrough('sort=popular');
    assert.equal(popular[0], docs[7]._id.toString(), 'most viewed first');
    assert.equal(popular[1], docs[3]._id.toString(), 'views of all hours are added up');

    // popularity together with the viewed filter and a search
    const viewed = `${docs[7]._id},${docs[50]._id}`;
    const popularRead = await api('GET', `/api/articles/public?sort=popular&viewed=read&viewedIds=${viewed}`);
    assert.deepEqual(popularRead.body.articles.map((a) => a._id), [docs[7]._id.toString(), docs[50]._id.toString()]);
    assert.equal(popularRead.body.articles[0].author.fullName, 'כתב QA', 'the author name is still included');
    const popularSearch = await api('GET', `/api/articles/public?sort=popular&search=${encodeURIComponent('זהה 11')}`);
    assert.ok(popularSearch.body.articles.length >= 1 && popularSearch.body.articles.every((a) => /זהה 11/.test(a.title)));
});
