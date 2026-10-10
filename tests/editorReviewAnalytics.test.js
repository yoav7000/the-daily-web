const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const Article = require('../src/models/Article');
const ViewStat = require('../src/models/ViewStat');
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
    const data = await res.json().catch(() => ({}));
    return { status: res.status, body: data };
};

test.before(async () => {
    await connectTestDb();
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
    editor = await createEditor('review_editor', 'עורך בדיקות');
    reporter = await createReporter('review_reporter', 'כתב בדיקות');
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectTestDb();
});

test('Category handling and filtering across roles', async (t) => {
    await t.test('Reporter creates and autosaves an article with non-default category (ספורט)', async () => {
        const createRes = await api('POST', '/api/articles/autosave', {
            cookie: reporter.cookie,
            body: {
                title: 'כתבת ספורט חדשה',
                category: '  ספורט  ',
                summary: 'תקציר ספורט',
                content: '<p>תוכן ספורט</p>'
            }
        });

        assert.equal(createRes.status, 200);
        assert.ok(createRes.body.articleId);

        const editRes = await api('GET', `/api/articles/${createRes.body.articleId}/edit`, {
            cookie: reporter.cookie
        });

        assert.equal(editRes.status, 200);
        assert.equal(editRes.body.article.category, 'ספורט');
    });

    await t.test('Filtering by category works across public, editor, and reporter endpoints', async () => {
        // Create 2 articles: one "ספורט" and one "טכנולוגיה"
        const art1 = await Article.create({
            title: 'משחק כדורגל מרתק',
            summary: 'תקציר',
            content: '<p>תוכן</p>',
            category: 'ספורט',
            author: reporter.user.id,
            status: ARTICLE_STATUS.PUBLISHED,
            publishedAt: new Date()
        });

        const art2 = await Article.create({
            title: 'חידושי בינה מלאכותית',
            summary: 'תקציר',
            content: '<p>תוכן</p>',
            category: 'טכנולוגיה',
            author: reporter.user.id,
            status: ARTICLE_STATUS.PUBLISHED,
            publishedAt: new Date()
        });

        // 1. Public filter
        const pubSport = await api('GET', `/api/articles/public?category=${encodeURIComponent('ספורט')}`);
        assert.equal(pubSport.status, 200);
        const hasSportOnly = pubSport.body.articles.every((a) => a.category === 'ספורט');
        assert.ok(hasSportOnly);

        // 2. Editor filter
        const edSport = await api('GET', `/api/articles/editor/all?category=${encodeURIComponent('ספורט')}`, {
            cookie: editor.cookie
        });
        assert.equal(edSport.status, 200);
        const edSportOnly = edSport.body.articles.every((a) => a.category === 'ספורט');
        assert.ok(edSportOnly);

        // 3. Reporter filter
        const repTech = await api('GET', `/api/articles/my-articles?category=${encodeURIComponent('טכנולוגיה')}`, {
            cookie: reporter.cookie
        });
        assert.equal(repTech.status, 200);
        const repTechOnly = repTech.body.articles.every((a) => a.category === 'טכנולוגיה');
        assert.ok(repTechOnly);
    });
});

test('Editor review endpoint and impact analytics with revisions', async (t) => {
    let articleId;

    await t.test('Publish article and then update it to create multiple revisions', async () => {
        const article = await Article.create({
            title: 'כתבת דגל לניתוח השפעה',
            summary: 'תקציר מקורי',
            content: '<p>תוכן מקורי</p>',
            category: 'כלכלה',
            author: reporter.user.id,
            status: ARTICLE_STATUS.PUBLISHED,
            publishedAt: new Date(Date.now() - 48 * 3600 * 1000),
            revisionsHistory: [{
                approvedAt: new Date(Date.now() - 48 * 3600 * 1000),
                approvedBy: editor.user.id,
                changesSummary: 'פרסום ראשוני'
            }]
        });
        articleId = article._id.toString();

        // Add historical views
        await ViewStat.create({
            article: article._id,
            timeBucket: '2026-10-01-10',
            viewedAt: new Date(Date.now() - 36 * 3600 * 1000),
            viewCount: 150
        });

        // Reporter submits an update
        await api('PUT', `/api/articles/${articleId}/autosave`, {
            cookie: reporter.cookie,
            body: {
                title: 'כתבת דגל מעודכנת עם גרסה חדשה',
                content: '<p>תוכן מעודכן ומשופר</p>'
            }
        });
        await api('POST', `/api/articles/${articleId}/submit`, { cookie: reporter.cookie });

        // Review endpoint returns current published and pending version of the same article
        const reviewRes = await api('GET', `/api/articles/editor/${articleId}/review`, {
            cookie: editor.cookie
        });
        assert.equal(reviewRes.status, 200);
        assert.equal(reviewRes.body.article.isPublishedUpdate, true);
        assert.equal(reviewRes.body.article.currentPublished.title, 'כתבת דגל לניתוח השפעה');
        assert.equal(reviewRes.body.article.pendingVersion.title, 'כתבת דגל מעודכנת עם גרסה חדשה');
        assert.ok(Array.isArray(reviewRes.body.article.revisionsHistory));

        // Editor approves update
        const approveRes = await api('POST', `/api/articles/${articleId}/approve`, {
            cookie: editor.cookie
        });
        assert.equal(approveRes.status, 200);

        // Add views after update
        await ViewStat.create({
            article: article._id,
            timeBucket: '2026-10-02-12',
            viewedAt: new Date(Date.now() - 2 * 3600 * 1000),
            viewCount: 300
        });
    });

    await t.test('Impact analytics returns milestones and before/after update stats', async () => {
        const analyticsRes = await api('GET', `/api/analytics/article/${articleId}`, {
            cookie: editor.cookie
        });
        assert.equal(analyticsRes.status, 200);
        assert.ok(analyticsRes.body.milestones.length >= 2);
        assert.equal(analyticsRes.body.milestones[0].type, 'INITIAL_PUBLISH');
        assert.equal(analyticsRes.body.milestones[1].type, 'REVISION_UPDATE');

        assert.ok(analyticsRes.body.impactAnalysis);
        assert.ok(typeof analyticsRes.body.impactAnalysis.viewsBeforeUpdate === 'number');
        assert.ok(typeof analyticsRes.body.impactAnalysis.viewsAfterUpdate === 'number');
        assert.ok(typeof analyticsRes.body.impactAnalysis.avgHourlyBefore === 'number');
        assert.ok(typeof analyticsRes.body.impactAnalysis.avgHourlyAfter === 'number');
    });

    await t.test('hasUpdates query filter successfully isolates updated articles', async () => {
        const filterRes = await api('GET', '/api/articles/public?hasUpdates=true&limit=10');
        assert.equal(filterRes.status, 200);
        assert.ok(filterRes.body.articles.length > 0);
        const matchFound = filterRes.body.articles.some((a) => a._id === articleId);
        assert.ok(matchFound);
    });
});
