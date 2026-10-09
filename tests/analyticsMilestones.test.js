const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const Article = require('../src/models/Article');
const ViewStat = require('../src/models/ViewStat');
const { recordViewInternal, getViewBucket } = require('../src/controllers/analyticsController');
const { connectTestDb, disconnectTestDb, createEditor, createReporter } = require('./helpers/testEnv');

let server;
let baseUrl;
let editor;
let reporter;

const MINUTE = 60 * 1000;
const ISRAEL_SUMMER = -180; // Date#getTimezoneOffset of a browser in Israel (UTC+3)

const api = async (method, path, { body, token } = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
};

const analytics = async (id, tzOffset = ISRAEL_SUMMER) => (await api('GET', `/api/analytics/article/${id}?tzOffset=${tzOffset}`, { token: editor.token })).body;

// The reporter writes and submits, the editor approves: the article is live
const publishNewArticle = async (title) => {
    const created = await api('POST', '/api/articles/autosave', { token: reporter.token, body: { title, content: '<p>גוף הכתבה</p>', category: 'חדשות' } });
    await api('POST', `/api/articles/${created.body.articleId}/submit`, { token: reporter.token });
    assert.equal((await api('POST', `/api/articles/${created.body.articleId}/approve`, { token: editor.token })).status, 200);
    return created.body.articleId;
};

test.before(async () => {
    await connectTestDb();
    await new Promise((resolve) => { server = app.listen(0, () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); }); });
    editor = await createEditor('milestone_editor', 'עורכת אבני דרך');
    reporter = await createReporter('milestone_reporter', 'כתב אבני דרך');
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectTestDb();
});

test('a reporter edit of a published article is not an approved update until an editor approves it', async (t) => {
    const id = await publishNewArticle('כתבה שהכתב עורך אחרי הפרסום');
    for (let i = 0; i < 3; i++) await recordViewInternal(id);

    await t.test('editing (autosave only): no update milestone, nothing to compare, the edit is listed as pending', async () => {
        assert.equal((await api('PUT', `/api/articles/${id}/autosave`, { token: reporter.token, body: { title: 'כותרת חדשה שלא אושרה' } })).status, 200);
        const data = await analytics(id);
        assert.deepEqual(data.milestones.map((m) => m.type), ['INITIAL_PUBLISH']);
        assert.equal(data.impactAnalysis, null);
        assert.equal(data.pendingUpdate.status, 'draft');
    });

    await t.test('submitted for approval: still no update milestone', async () => {
        assert.equal((await api('POST', `/api/articles/${id}/submit`, { token: reporter.token })).status, 200);
        const data = await analytics(id);
        assert.deepEqual(data.milestones.map((m) => m.type), ['INITIAL_PUBLISH']);
        assert.equal(data.impactAnalysis, null);
        assert.equal(data.pendingUpdate.status, 'pending_approval');
    });

    await t.test('returned for revisions: still no update milestone', async () => {
        assert.equal((await api('POST', `/api/articles/${id}/reject`, { token: editor.token, body: { feedback: 'נא להוסיף מקור' } })).status, 200);
        const data = await analytics(id);
        assert.deepEqual(data.milestones.map((m) => m.type), ['INITIAL_PUBLISH']);
        assert.equal(data.pendingUpdate.status, 'revision_requested');
    });

    await t.test('only the editor approval creates the update milestone, at the moment of the approval', async () => {
        await api('POST', `/api/articles/${id}/submit`, { token: reporter.token });
        const before = Date.now();
        assert.equal((await api('POST', `/api/articles/${id}/approve`, { token: editor.token })).status, 200);
        const data = await analytics(id);
        assert.deepEqual(data.milestones.map((m) => m.type), ['INITIAL_PUBLISH', 'REVISION_UPDATE']);
        assert.ok(Math.abs(new Date(data.milestones[1].timestamp).getTime() - before) < 5000);
        assert.equal(data.milestones[1].editorName, 'עורכת אבני דרך');
        assert.equal(data.pendingUpdate, null);
        assert.ok(data.impactAnalysis);
    });

    await t.test('the analytics answer never exposes the unapproved text', async () => {
        await api('PUT', `/api/articles/${id}/autosave`, { token: reporter.token, body: { title: 'טיוטה סודית' } });
        const data = await analytics(id);
        assert.doesNotMatch(JSON.stringify(data), /טיוטה סודית/);
    });
});

test('the graph shows the exact time of the publication and of the approval, in the viewer\'s clock', async (t) => {
    const id = await publishNewArticle('כתבה לבדיקת זמנים');

    // published 50 minutes ago, an update approved 23 minutes ago; live views every few minutes
    const now = Date.now();
    const publishedAt = new Date(now - 50 * MINUTE);
    const approvedAt = new Date(now - 23 * MINUTE);
    await Article.updateOne({ _id: id }, {
        publishedAt,
        revisionsHistory: [
            { approvedAt: publishedAt, approvedBy: editor.user.id, changesSummary: 'פרסום ראשוני' },
            { approvedAt, approvedBy: editor.user.id, changesSummary: 'עדכון' }
        ]
    });
    await ViewStat.deleteMany({ article: id });
    const viewTimes = [48, 44, 40, 35, 30, 26, 20, 15, 10, 4].map((m) => new Date(now - m * MINUTE));
    for (const when of viewTimes) await recordViewInternal(id, when);

    const data = await analytics(id);
    const { timeline, milestones, impactAnalysis } = data;

    await t.test('views are stored in 5-minute buckets, so an hour is not squeezed into one point', () => {
        assert.equal(timeline.stepMinutes, 5);
        assert.equal(timeline.granularity, 'minute');
        assert.ok(timeline.views.length >= 10 && timeline.views.length <= 12, `points: ${timeline.views.length}`);
        assert.equal(timeline.views.reduce((a, b) => a + b, 0), viewTimes.length);
    });

    await t.test('every milestone sits at its exact moment on the axis', () => {
        for (const m of milestones) {
            const exactMs = new Date(m.timestamp).getTime();
            const stepMs = timeline.stepMinutes * MINUTE;
            const drawnMs = timeline.timestamps[0] + m.position * stepMs;
            assert.ok(Math.abs(drawnMs - exactMs) < 1000, `${m.type} drawn ${(drawnMs - exactMs) / 1000}s off`);
            assert.equal(m.pointIndex, Math.floor(m.position));
        }
        assert.ok(milestones[1].position > milestones[0].position);
    });

    await t.test('labels are the viewer\'s local time (UTC+3 here), whatever the server time zone', () => {
        const first = new Date(timeline.timestamps[0] + 3 * 60 * MINUTE); // UTC+3, read through the UTC fields
        const expected = `${String(first.getUTCDate()).padStart(2, '0')}/${String(first.getUTCMonth() + 1).padStart(2, '0')} ${String(first.getUTCHours()).padStart(2, '0')}:${String(first.getUTCMinutes()).padStart(2, '0')}`;
        assert.equal(timeline.labels[0], expected);
        assert.equal(timeline.tzOffset, ISRAEL_SUMMER);
    });

    await t.test('before / after the update: the numbers match what the graph colours', () => {
        const approvedMs = approvedAt.getTime();
        const expectedAfter = viewTimes.filter((d) => getViewBucket(d).start.getTime() >= approvedMs).length;
        assert.equal(impactAnalysis.viewsAfterUpdate, expectedAfter);
        assert.equal(impactAnalysis.viewsBeforeUpdate, viewTimes.length - expectedAfter);

        const after = timeline.views.slice(impactAnalysis.firstPointAfterUpdate).reduce((a, b) => a + b, 0);
        assert.equal(after, impactAnalysis.viewsAfterUpdate, 'the orange part of the graph holds exactly the views counted "after"');
        assert.ok(impactAnalysis.firstPointAfterUpdate > milestones[1].pointIndex - 1);
    });
});

test('long periods are grouped into days that start at the viewer\'s midnight', async () => {
    const id = await publishNewArticle('כתבה ותיקה');
    const DAY = 24 * 60 * MINUTE;
    const publishedAt = new Date(Date.now() - 30 * DAY);
    await Article.updateOne({ _id: id }, { publishedAt, revisionsHistory: [{ approvedAt: publishedAt, approvedBy: editor.user.id }] });

    const data = await analytics(id, ISRAEL_SUMMER);
    assert.equal(data.timeline.granularity, 'day');
    for (const t of data.timeline.timestamps) {
        const local = new Date(t + 3 * 60 * MINUTE);
        assert.equal(local.getUTCHours() + local.getUTCMinutes(), 0, 'every day starts at 00:00 local time');
    }
    assert.ok(data.timeline.labels.every((label) => /^\d{2}\/\d{2}$/.test(label)));
});

test('a bad time zone value falls back to the server clock instead of failing', async () => {
    const id = await publishNewArticle('כתבה עם אזור זמן שגוי');
    const res = await api('GET', `/api/analytics/article/${id}?tzOffset=banana`, { token: editor.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.timeline.tzOffset, new Date().getTimezoneOffset());
});
