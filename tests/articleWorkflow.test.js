const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const Article = require('../src/models/Article');
const User = require('../src/models/User');
const { ARTICLE_STATUS } = require('../src/constants/articleConstants');

let mongod;

test.before(async () => {
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 1500 });
    } catch (err) {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        mongod = await MongoMemoryServer.create();
        await mongoose.connect(mongod.getUri());
    }
    // Clean up test collections
    await Article.deleteMany({});
    await User.deleteMany({});
});

test.after(async () => {
    await Article.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.close();
    if (mongod) {
        await mongod.stop();
    }
});

test('Article Workflow & Auto-Save Test Suite', async (t) => {
    // Setup test users
    const reporter = await User.create({
        username: 'reporter_dan',
        password: 'password123',
        fullName: 'דן הכתב',
        role: 'reporter'
    });

    const editor = await User.create({
        username: 'editor_sarah',
        password: 'password123',
        fullName: 'שרה העורכת',
        role: 'editor'
    });

    let articleId = null;

    await t.test('1. Create new article - starts in "בהכנה" (DRAFT)', async () => {
        const article = await Article.create({
            title: 'פריצת דרך מדעית בתחום האנרגיה הירוקה',
            summary: 'מדענים פיתחו פאנל סולארי בעל נצילות כפולה',
            content: '<p>תוכן הכתבה המלא על האנרגיה הירוקה...</p>',
            category: 'טכנולוגיה',
            author: reporter._id,
            status: ARTICLE_STATUS.DRAFT
        });

        assert.ok(article._id);
        assert.equal(article.status, ARTICLE_STATUS.DRAFT);
        articleId = article._id;
    });

    await t.test('2. Auto-save while in draft preserves ongoing edits without loss', async () => {
        const article = await Article.findById(articleId);
        assert.ok(article);

        // Simulate auto-save updates
        article.content = '<p>תוכן הכתבה המעודכן שנשמר אוטומטית שורה אחר שורה...</p>';
        article.lastAutoSavedAt = new Date();
        await article.save();

        const reloaded = await Article.findById(articleId);
        assert.equal(reloaded.content, '<p>תוכן הכתבה המעודכן שנשמר אוטומטית שורה אחר שורה...</p>');
        assert.ok(reloaded.lastAutoSavedAt);
        assert.equal(reloaded.status, ARTICLE_STATUS.DRAFT);
    });

    await t.test('3. Reporter submits article for editor approval -> "ממתינה לאישור עורך"', async () => {
        const article = await Article.findById(articleId);
        article.status = ARTICLE_STATUS.PENDING_APPROVAL;
        await article.save();

        const reloaded = await Article.findById(articleId);
        assert.equal(reloaded.status, ARTICLE_STATUS.PENDING_APPROVAL);
    });

    await t.test('4. Editor returns article for revisions ("הוחזרה לתיקונים") with mandatory feedback', async () => {
        const article = await Article.findById(articleId);
        const feedbackComment = 'נא להוסיף מקורות מדעיים וציטוט מהחוקר הראשי';

        assert.ok(feedbackComment && feedbackComment.trim().length > 0, 'Feedback must be non-empty');
        article.status = ARTICLE_STATUS.REVISION_REQUESTED;
        article.editorFeedback = feedbackComment;
        await article.save();

        const reloaded = await Article.findById(articleId);
        assert.equal(reloaded.status, ARTICLE_STATUS.REVISION_REQUESTED);
        assert.equal(reloaded.editorFeedback, feedbackComment);
    });

    await t.test('5. Reporter corrects article and resubmits to editor -> "ממתינה לאישור עורך"', async () => {
        const article = await Article.findById(articleId);
        assert.equal(article.status, ARTICLE_STATUS.REVISION_REQUESTED);

        article.content += '<p>מקורות מדעיים נוספו בהתאם להערות העורכת.</p>';
        article.status = ARTICLE_STATUS.PENDING_APPROVAL;
        await article.save();

        const reloaded = await Article.findById(articleId);
        assert.equal(reloaded.status, ARTICLE_STATUS.PENDING_APPROVAL);
    });

    await t.test('6. Editor approves and publishes -> "פורסמה" and records publication timestamp', async () => {
        const article = await Article.findById(articleId);
        const now = new Date();

        article.status = ARTICLE_STATUS.PUBLISHED;
        article.publishedAt = now;
        article.editorFeedback = null;
        article.revisionsHistory.push({
            approvedAt: now,
            approvedBy: editor._id,
            changesSummary: 'פרסום ראשוני של הכתבה'
        });
        await article.save();

        const reloaded = await Article.findById(articleId);
        assert.equal(reloaded.status, ARTICLE_STATUS.PUBLISHED);
        assert.ok(reloaded.publishedAt);
        assert.equal(reloaded.revisionsHistory.length, 1);
    });

    await t.test('7. Complex Logic: Editing a published article preserves public content while saving draft', async () => {
        const article = await Article.findById(articleId);
        const originalPublishedContent = article.content;
        const originalPublishedTitle = article.title;

        // Reporter starts editing: saves to draftVersion
        article.draftVersion = {
            title: 'פריצת דרך מדעית - עדכון דחוף!',
            summary: 'מידע חדש ומעודכן על תוצאות הניסוי',
            content: '<p>תוכן מעודכן לחלוטין שממתין לאישור עורך...</p>',
            category: 'טכנולוגיה',
            mainImage: article.mainImage,
            status: ARTICLE_STATUS.DRAFT,
            updatedAt: new Date()
        };
        await article.save();

        // Verify public readers still see the approved content
        const publicView = await Article.findOne({ _id: articleId, status: ARTICLE_STATUS.PUBLISHED });
        assert.equal(publicView.title, originalPublishedTitle, 'Public title must remain unchanged');
        assert.equal(publicView.content, originalPublishedContent, 'Public content must remain unchanged');

        // Reporter submits the draft update for review
        article.draftVersion.status = ARTICLE_STATUS.PENDING_APPROVAL;
        await article.save();

        // Public readers STILL see original content
        const publicViewAfterSubmit = await Article.findOne({ _id: articleId, status: ARTICLE_STATUS.PUBLISHED });
        assert.equal(publicViewAfterSubmit.title, originalPublishedTitle);
        assert.equal(publicViewAfterSubmit.content, originalPublishedContent);

        // Editor reviews: both versions are distinct and accessible
        assert.equal(article.title, originalPublishedTitle);
        assert.equal(article.draftVersion.title, 'פריצת דרך מדעית - עדכון דחוף!');

        // Editor approves update: draft content replaces live content and logs point in history
        const updateTime = new Date();
        article.title = article.draftVersion.title;
        article.summary = article.draftVersion.summary;
        article.content = article.draftVersion.content;
        article.revisionsHistory.push({
            approvedAt: updateTime,
            approvedBy: editor._id,
            changesSummary: 'עדכון תוכן אושר ופורסם'
        });
        article.draftVersion = null;
        await article.save();

        // Now public sees the approved updated content
        const publicViewAfterApproval = await Article.findOne({ _id: articleId, status: ARTICLE_STATUS.PUBLISHED });
        assert.equal(publicViewAfterApproval.title, 'פריצת דרך מדעית - עדכון דחוף!');
        assert.equal(publicViewAfterApproval.revisionsHistory.length, 2, 'History must contain 2 approval events for Impact Analytics');
    });
});
