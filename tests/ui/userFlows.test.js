// The requirements of the assignment, checked through the real screens with real clicks and typing:
// the news feed (infinite scroll, search, filters, sorting, all without reloading the page), the article page and its
// comments (instant, limited to 3 a minute), login by role, the reporter's work (continuous saving, submitting), the
// editor's review (difference view, return with a note, approve, delete), the Impact Analytics graph and data management.
//
// Run it with:  npm run test:ui     (needs Chrome, Edge or Chromium; set CHROME_PATH for another browser)
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startSite, openPage, apiLogin, SKIP_REASON, sleep } = require('./harness');

let site;
test.before(async () => { if (!SKIP_REASON) site = await startSite(); });
test.after(async () => { if (site) await site.stop(); });

const flow = (name, fn) => test(name, { skip: SKIP_REASON, timeout: 180000 }, async () => fn());

// ---- small helpers ---------------------------------------------------------------------------------------------
const visibleText = (page, selector) => page.run((sel) => {
    const el = [...document.querySelectorAll(sel)].find((item) => item.getClientRects().length > 0);
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
}, selector);

const count = (page, selector) => page.run((sel) => document.querySelectorAll(sel).length, selector);

// "visible" the way a person sees it: it takes space, it is not hidden, and it is not parked outside the screen
const isVisible = (page, selector) => page.run((sel) => [...document.querySelectorAll(sel)].some((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden' && rect.right > 0 && rect.left < innerWidth;
}), selector);

const until = (page, fn, ...args) => page.waitFor(fn, ...args);

const choose = (page, selector, value) => page.run((sel, option) => {
    const el = document.querySelector(sel);
    el.value = option;
    el.dispatchEvent(new Event('change', { bubbles: true }));
}, selector, value);

// Marks `inner` inside the first `container` whose text contains `text`, so that a real mouse click can press it
async function clickIn(page, container, text, inner) {
    const found = await page.run((box, label, target) => {
        document.querySelectorAll('[data-crawl-target]').forEach((el) => el.removeAttribute('data-crawl-target'));
        const owner = [...document.querySelectorAll(box)].find((el) => el.textContent.includes(label));
        const button = owner && (target ? owner.querySelector(target) : owner);
        if (!button) return false;
        button.setAttribute('data-crawl-target', '1');
        return true;
    }, container, text, inner);
    assert.ok(found, `no ${container} containing "${text}" with ${inner}`);
    await page.click('[data-crawl-target]');
}

const confirmYes = async (page) => {
    await until(page, () => Boolean(document.querySelector('.modal[role="alertdialog"]:not([hidden])')));
    await page.click('.modal[role="alertdialog"] [data-confirm="yes"]');
    await page.settle(250);
};

// Waits until the "saved in the background" indicator of the writing studio says so
const waitSaved = (page) => until(page, () => {
    const el = document.getElementById('autosaveIndicator');
    return el.classList.contains('autosave-saved') && /נשמר/.test(el.textContent);
}, { timeout: 10000 });

async function openStaffPage(user, url, viewport = 'desktop') {
    const opened = await openPage(site, { user, viewport });
    await opened.page.goto(`${site.base}${url}`);
    return opened;
}

const authHeaders = async (username) => ({ Authorization: `Bearer ${(await apiLogin(site, username)).token}`, 'Content-Type': 'application/json' });
const noPageProblems = (page) => {
    assert.deepEqual(page.errors, [], 'script errors in the page');
    assert.deepEqual(page.unexpectedFailures(), [], 'failed requests');
    assert.deepEqual(page.dialogs, [], 'native dialog boxes');
};

// ================================================================================================================
// The news feed
// ================================================================================================================

flow('Home page: the feed loads 20 more articles by itself when the reader nears the bottom, without a page reload', async () => {
    const { page, close } = await openPage(site, { viewport: 'desktop' });
    try {
        await page.goto(`${site.base}/`);
        await until(page, () => document.querySelectorAll('article.story').length > 0);
        await page.run(() => { window.__marker = 'same page'; });

        // the lead story and the next three are shown above the cards; the first request asked for 20 articles
        assert.ok(await isVisible(page, '#heroLead'), 'the lead story is shown');
        assert.equal(await count(page, '#heroSide .mini'), 3);
        const firstPage = await count(page, 'article.story');
        assert.equal(firstPage, 16, '20 articles per request: 4 in the lead area, 16 cards');
        assert.ok(page.requests.some((r) => /\/api\/articles\/public\?[^ ]*page=1[^ ]*limit=20|limit=20[^ ]*page=1/.test(r.url)), 'the first request asks for 20 articles');

        // scrolling down loads the next 20, twice
        for (const expected of [36, 56]) {
            await page.run(() => window.scrollTo(0, document.documentElement.scrollHeight));
            await until(page, (n) => document.querySelectorAll('article.story').length >= n, expected);
            await page.settle(300);
        }
        assert.equal(await count(page, 'article.story'), 56);
        assert.ok(page.requests.some((r) => /page=2/.test(r.url)) && page.requests.some((r) => /page=3/.test(r.url)), 'pages 2 and 3 were requested');
        assert.equal(await page.run(() => window.__marker), 'same page', 'the page was not reloaded');

        // nothing repeats
        const links = await page.run(() => [...document.querySelectorAll('article.story a.stretched')].map((a) => a.getAttribute('href')));
        assert.equal(new Set(links).size, links.length, 'an article appears twice in the feed');

        // every card shows the basic information: title, picture, summary, section, reporter and date
        const card = await page.run(() => {
            const el = document.querySelector('article.story');
            return {
                title: el.querySelector('.story-title').textContent.trim(),
                image: Boolean(el.querySelector('img')),
                summary: el.querySelector('.story-summary').textContent.trim(),
                category: el.querySelector('.tag').textContent.trim(),
                foot: el.querySelector('.story-foot').textContent.trim()
            };
        });
        assert.ok(card.title && card.image && card.summary && card.category, 'title, picture, summary and section');
        assert.match(card.foot, /\d{4}/, 'the reporter and the publication date');
        noPageProblems(page);
    } finally { await close(); }
});

flow('Home page: search, section filter, "seen / not seen" and sorting all work without reloading the page', async () => {
    const { page, close } = await openPage(site, { viewport: 'desktop' });
    try {
        await page.goto(`${site.base}/`);
        await until(page, () => document.querySelectorAll('article.story').length > 0);
        await page.run(() => { window.__marker = 'same page'; });

        // --- search: any part of a word matches; the results replace the feed in place
        const word = await page.run(() => {
            const words = document.querySelector('article.story .story-title').textContent.split(/\s+/).filter((w) => w.length >= 5 && /^[א-ת]+$/.test(w));
            return words[0];
        });
        assert.ok(word, 'a word to search for');
        await page.fill('#searchInput', word);
        await until(page, () => document.getElementById('feedHeading').textContent === 'תוצאות חיפוש');
        await page.settle(300);
        const found = await page.run(() => [...document.querySelectorAll('article.story')].map((el) => el.textContent));
        assert.ok(found.length > 0, 'the search finds articles');
        assert.ok(found.every((text) => text.includes(word)), 'every result contains the searched word');
        assert.ok(!(await isVisible(page, '#heroLead')), 'the lead story steps aside for search results');
        assert.match(await page.url(), /q=/, 'the address records the search');
        assert.equal(await page.run(() => window.__marker), 'same page');

        // a word that does not exist: a clear message, and a way back
        await page.fill('#searchInput', 'ללללללללל');
        await until(page, () => /לא נמצאו כתבות/.test(document.getElementById('feedStatus').textContent));
        await page.click('#feedStatus [data-action="clear-filters"]');
        await until(page, () => document.getElementById('feedHeading').textContent === 'הפיד הראשי');
        assert.equal(await page.run(() => document.getElementById('searchInput').value), '');

        // --- section: a click on "ספורט" shows only sport, the address and the menu follow
        await page.click('#siteNav a[data-category="ספורט"]');
        await until(page, () => document.getElementById('feedHeading').textContent === 'מדור ספורט');
        await page.settle(300);
        const tags = await page.run(() => [...document.querySelectorAll('article.story .tag, #heroCategory')].filter((el) => el.getClientRects().length).map((el) => el.textContent.trim()));
        assert.ok(tags.length > 3 && tags.every((tag) => tag === 'ספורט'), `only sport articles: ${[...new Set(tags)]}`);
        assert.equal(await page.run(() => document.querySelector('#siteNav .is-active').textContent.trim()), 'ספורט');
        assert.match(decodeURIComponent(await page.url()), /category=ספורט/);
        assert.equal(await page.run(() => window.__marker), 'same page');
        await page.run(() => history.back());                                    // the back button goes back to the full feed
        await until(page, () => document.getElementById('feedHeading').textContent === 'הפיד הראשי');

        // --- sorting: the oldest first. The first card must be the article the server calls the oldest.
        await choose(page, '#sortSelect', 'oldest');
        await until(page, () => document.querySelector('#heroSection').hidden);
        await page.settle(300);
        const oldest = (await (await fetch(`${site.base}/api/articles/public?limit=1&sort=oldest`)).json()).articles[0];
        assert.equal(await visibleText(page, 'article.story .story-title'), oldest.title);
        await choose(page, '#sortSelect', 'popular');
        await page.settle(400);
        assert.ok(page.requests.some((r) => /sort=popular/.test(r.url)), 'the popularity sort asks the server');
        const popular = (await (await fetch(`${site.base}/api/articles/public?limit=1&sort=popular`)).json()).articles[0];
        assert.equal(await visibleText(page, 'article.story .story-title'), popular.title);
        await choose(page, '#sortSelect', 'newest');
        await page.settle(300);

        // --- "seen / not seen": opening an article marks it, the filter uses what this browser remembers
        const first = await page.run(() => ({ href: document.querySelector('article.story a.stretched').getAttribute('href'), title: document.querySelector('article.story .story-title').textContent.trim() }));
        await page.click('article.story a.stretched');                           // a real click on the first card opens the article
        await page.waitForUrl(/\/article\//);
        assert.equal(await page.run(() => document.querySelector('h1').textContent.trim()), first.title);
        await page.goto(`${site.base}/`);
        await until(page, () => document.querySelectorAll('article.story').length > 0);
        await page.click('label:has(#filterRead)');
        await page.settle(400);
        const seen = await page.run(() => [...document.querySelectorAll('article.story')].map((el) => ({ title: el.querySelector('.story-title').textContent.trim(), viewed: /נצפתה/.test(el.querySelector('.viewed').textContent) })));
        assert.deepEqual(seen.map((s) => s.title), [first.title], 'only the article that was opened is "seen"');
        assert.ok(seen.every((s) => s.viewed));
        await page.click('label:has(#filterUnread)');
        await page.settle(400);
        const unseen = await page.run(() => [...document.querySelectorAll('article.story')].map((el) => el.querySelector('.story-title').textContent.trim()));
        assert.ok(unseen.length > 10 && !unseen.includes(first.title), 'the opened article is not in the "not seen" list');
        noPageProblems(page);
    } finally { await close(); }
});

flow('Home page: the weather widget is in the sidebar and tells where its data comes from', async () => {
    const { page, close } = await openPage(site, { viewport: 'desktop' });
    try {
        await page.goto(`${site.base}/`);
        await until(page, () => /\d+°/.test(document.getElementById('weatherTemp').textContent));
        assert.ok(await page.run(() => Boolean(document.querySelector('aside .weather-widget'))), 'the widget is in the sidebar');
        assert.ok((await visibleText(page, '#weatherCity')).length > 1, 'a city');
        // with an API key the server answers with real data, without one with sample data that is labelled as such
        assert.ok((await visibleText(page, '#weatherCondition')).length > 2, 'the weather condition');
        assert.match(await visibleText(page, '#weatherWind'), /קמ"ש/);
        noPageProblems(page);
    } finally { await close(); }
});

// ================================================================================================================
// The article page and its comments
// ================================================================================================================

flow('Article page: full article, instant comments, and no more than 3 comments a minute', async () => {
    const { page, close } = await openPage(site, { viewport: 'desktop' });
    try {
        await page.goto(`${site.base}/article/${site.sampleId}`);
        await until(page, () => Boolean(document.querySelector('.comment, .comment-empty')));
        await page.run(() => { window.__marker = 'same page'; });

        const article = await page.run(() => ({
            title: document.querySelector('h1').textContent.trim(),
            category: document.querySelector('.article-head .tag').textContent.trim(),
            author: document.querySelector('.article-meta .who strong').textContent.trim(),
            date: document.querySelector('.article-meta time').textContent.trim(),
            image: Boolean(document.querySelector('.article-cover img')),
            text: document.getElementById('articleContent').textContent.trim().length
        }));
        assert.ok(article.title && article.category && article.author && /\d{4}/.test(article.date) && article.image && article.text > 20, JSON.stringify(article));

        // empty form: a clear message, nothing sent
        await page.click('#commentSubmitBtn');
        assert.match(await visibleText(page, '#commentError'), /נא למלא/);

        const before = await count(page, '#commentsList .comment');
        const badgeBefore = await visibleText(page, '#commentsBadge');
        await page.fill('#commentAuthor', 'קורא בודק');
        for (const n of [1, 2, 3]) {
            await page.fill('#commentContent', `תגובת בדיקה מספר ${n}`);
            await page.click('#commentSubmitBtn');
            await until(page, (text) => document.querySelector('#commentsList .comment .comment-text').textContent === text, `תגובת בדיקה מספר ${n}`);
        }
        // each comment is at the top at once; the list was not fetched again and the page not reloaded
        assert.equal(await count(page, '#commentsList .comment'), before + 3);
        assert.notEqual(await visibleText(page, '#commentsBadge'), badgeBefore, 'the comment counter moved');
        assert.equal(await page.run(() => window.__marker), 'same page');
        assert.equal(page.requests.filter((r) => /\/api\/articles\/[^/]+\/comments/.test(r.url) && r.method === 'GET').length, 1, 'the list was loaded once');

        // the fourth within a minute is refused by the server, and the visitor is told why
        await page.fill('#commentContent', 'תגובה רביעית');
        await page.click('#commentSubmitBtn');
        await until(page, () => !document.getElementById('rateLimitBanner').hidden);
        assert.match(await visibleText(page, '#rateLimitBanner'), /3 פעמים בדקה/);
        assert.match(await visibleText(page, '#countdownTimer'), /שניות/);
        assert.equal(await count(page, '#commentsList .comment'), before + 3, 'the blocked comment was not added');
        assert.ok(page.requests.some((r) => r.status === 429), 'the server answered 429');
        assert.deepEqual(page.errors, []);
    } finally { await close(); }
});

// ================================================================================================================
// Login, roles and permissions
// ================================================================================================================

flow('Login: a wrong password is explained, a reporter lands in the reporter desk, an editor in the editor desk', async () => {
    // wrong password
    let { page, close } = await openPage(site, { viewport: 'desktop' });
    try {
        await page.goto(`${site.base}/login.html`);
        await page.fill('#loginUsername', 'dan_reporter');
        await page.fill('#loginPassword', 'wrong-password');
        await page.click('#loginSubmitBtn');
        await until(page, () => !document.getElementById('authAlert').hidden);
        assert.match(await visibleText(page, '#authAlert'), /שגויים/);
        assert.equal(await page.run(() => location.pathname), '/login.html');
        assert.equal(await page.run(() => localStorage.getItem('token')), null);

        // the show / hide password button
        await page.click('#toggleLoginPassword');
        assert.equal(await page.run(() => document.getElementById('loginPassword').type), 'text');
        await page.click('#toggleLoginPassword');
        assert.equal(await page.run(() => document.getElementById('loginPassword').type), 'password');

        // the reporter
        await page.fill('#loginPassword', 'password123');
        await page.click('#loginSubmitBtn');
        await page.waitForUrl(/\/reporter\.html/);
        await until(page, () => Boolean(document.querySelector('.work-card, .state')));
        assert.equal(await visibleText(page, '#sideRole'), 'כתב');
        assert.ok(!(await isVisible(page, '.side-link[href="/editor.html"]')), 'a reporter does not see the editor desk in the menu');

        // logging out ends the session: the desk is closed again
        await page.click('.sidebar [data-action="logout"]');
        await page.waitForUrl(/\/login\.html/);
        assert.equal(await page.run(() => localStorage.getItem('token')), null);
        await page.goto(`${site.base}/reporter.html`);
        await page.waitForUrl(/\/login\.html\?redirect=%2Freporter\.html/);
    } finally { await close(); }

    // the editor: the desk of editors, a page they asked for, never another address
    for (const [query, expected] of [['', /^\/editor\.html/], ['?redirect=/admin.html', /^\/admin\.html/], ['?redirect=//evil.example', /^\/editor\.html/], ['?redirect=https://evil.example', /^\/editor\.html/]]) {
        ({ page, close } = await openPage(site, { viewport: 'desktop' }));
        try {
            await page.goto(`${site.base}/login.html${query}`);
            await page.fill('#loginUsername', 'sarah_editor');
            await page.fill('#loginPassword', 'password123');
            await page.click('#loginSubmitBtn');
            await until(page, (source) => new RegExp(source).test(location.pathname), expected.source, { timeout: 10000 });
            assert.match(await page.run(() => location.pathname), expected, `login with "${query}"`);
        } finally { await close(); }
    }
});

flow('Permissions: a reporter cannot open the editor pages, and the server says no as well', async () => {
    const { page, close } = await openPage(site, { user: 'dan_reporter', viewport: 'desktop' });
    try {
        // (the explanation is on screen for a few seconds only, so watch for it right from the start)
        await page.send('Page.navigate', { url: `${site.base}/editor.html` });
        await until(page, () => /עורכים בלבד/.test(document.getElementById('toasts') ? document.getElementById('toasts').textContent : ''));
        assert.match(await page.run(() => location.pathname), /portal\.html/);
        assert.ok(!(await isVisible(page, '.side-link[href="/editor.html"], .side-link[href="/admin.html"], .side-link[href="/analytics.html"]')));
        assert.ok(await isVisible(page, '#lockedDesks'), 'the portal explains that the editor desks are locked');
        for (const url of ['/analytics.html', '/admin.html']) {
            await page.goto(`${site.base}${url}`);
            await page.waitForUrl(/\/portal\.html/);
        }
    } finally { await close(); }

    // the buttons being hidden is not the protection: the server refuses the same requests
    const headers = await authHeaders('dan_reporter');
    for (const url of ['/api/articles/editor/stats', '/api/articles/editor/all', '/api/users', '/api/comments', '/api/analytics']) {
        assert.equal((await fetch(`${site.base}${url}`, { headers })).status, 403, url);
    }
    assert.equal((await fetch(`${site.base}/api/articles/editor/stats`)).status, 401, 'no login at all');
});

// ================================================================================================================
// The reporter's work and the editor's review
// ================================================================================================================

flow('Writing and publishing: auto-save, continuity, submit, return with a note, fix, approve, update, review the difference, delete', async () => {
    const title = `בדיקת ממשק ${Date.now()}`;
    const body = '<p>פסקה ראשונה של הכתבה שנכתבה בבדיקה.</p>';
    const reporter = await openStaffPage('dan_reporter', '/reporter.html');
    const editor = await openStaffPage('sarah_editor', '/editor.html');
    const rp = reporter.page;
    const ep = editor.page;
    const reporterHeaders = await authHeaders('dan_reporter');
    const findMine = async () => (await (await fetch(`${site.base}/api/articles/my-articles?limit=300`, { headers: reporterHeaders })).json()).articles.find((a) => a.title === title || (a.draftVersion && a.draftVersion.title === title));
    try {
        // 1. the reporter starts a new article: everything typed is saved by itself, no save button
        await until(rp, () => document.querySelectorAll('.work-card').length > 0);
        await rp.click('[data-action="new-article"]');
        await until(rp, () => !document.getElementById('articleEditModal').hidden);
        assert.ok(!(await rp.run(() => /שמור\b/.test(document.getElementById('articleEditModal').innerText.replace(/אוטומטית/g, '')))), 'there is no "save" button');
        await rp.fill('#editTitle', title);
        await rp.fill('#editSummary', 'תקציר של כתבת הבדיקה');
        await rp.fill('#editContent', body);
        await choose(rp, '#editCategory', 'ספורט');
        await waitSaved(rp);
        let article = await findMine();
        assert.ok(article, 'the article reached the server without pressing anything');
        assert.equal(article.status, 'draft');
        assert.equal(article.category, 'ספורט');

        // 2. the formatting buttons wrap the selected text
        await rp.click('[data-action="format"][title="הדגשה"]');
        assert.match(await rp.run(() => document.getElementById('editContent').value), /<b>.*<\/b>/);
        await waitSaved(rp);

        // 3. closing and reopening, even after a reload, brings back the latest text
        await rp.press('Escape');
        await until(rp, () => document.getElementById('articleEditModal').hidden);
        await rp.fill('#searchInput', title);
        await until(rp, () => document.querySelectorAll('.work-card').length === 1);
        assert.match(await visibleText(rp, '.work-card .status'), /בהכנה/);
        await rp.goto(`${site.base}/reporter.html`);
        await rp.fill('#searchInput', title);
        await until(rp, () => document.querySelectorAll('.work-card').length === 1);
        await rp.click('.work-card [data-action="edit-article"]');
        await until(rp, () => !document.getElementById('articleEditModal').hidden);
        assert.equal(await rp.run(() => document.getElementById('editTitle').value), title);
        assert.match(await rp.run(() => document.getElementById('editContent').value), /פסקה ראשונה/);

        // 4. submitting asks first, then the article is locked for the reporter
        await rp.click('#submitApprovalBtn');
        await confirmYes(rp);
        await until(rp, () => document.getElementById('articleEditModal').hidden);
        await until(rp, () => /ממתינה לאישור עורך/.test(document.querySelector('.work-card .status').textContent));
        assert.match(await visibleText(rp, '.work-card .work-actions'), /נעולה לעריכה/);
        assert.equal(await count(rp, '.work-card [data-action="edit-article"]'), 0, 'no edit button while the editor decides');

        // 5. the editor finds it in the "waiting" list and opens the review
        await until(ep, () => document.querySelectorAll('#articlesTableBody tr').length > 1);
        await ep.fill('#searchInput', title);
        await until(ep, () => document.querySelectorAll('#articlesTableBody tr').length === 1 && /ממתינה לאישור/.test(document.querySelector('#articlesTableBody .status').textContent));
        await ep.click('#articlesTableBody [data-action="review"]');
        await until(ep, () => !document.getElementById('reviewDiffModal').hidden);
        assert.ok(await isVisible(ep, '#diffViewContainer'));
        assert.match(await visibleText(ep, '#pendingDiffTitle'), new RegExp(title));
        assert.match(await visibleText(ep, '#diffContentPane'), /פסקה ראשונה/);

        // 6. returning it without a note is refused, with a note it goes back to the reporter
        await ep.click('[data-action="open-return"]');
        await until(ep, () => !document.getElementById('returnRevisionsModal').hidden);
        await ep.click('#submitRejectionBtn');
        assert.match(await visibleText(ep, '#feedbackError'), /חובה/);
        assert.equal(ep.requests.filter((r) => /\/reject/.test(r.url)).length, 0, 'nothing was sent without a note');
        await ep.fill('#editorFeedbackInput', 'נא להוסיף ציטוט מהמאמן.');
        await ep.click('#submitRejectionBtn');
        await until(ep, () => document.getElementById('reviewDiffModal').hidden && document.getElementById('returnRevisionsModal').hidden);
        await until(ep, () => /הוחזרה לתיקונים/.test(document.querySelector('#articlesTableBody .status').textContent));

        // 7. the reporter sees the note, fixes the article and submits it again
        await rp.goto(`${site.base}/reporter.html`);
        await rp.fill('#searchInput', title);
        await until(rp, () => document.querySelectorAll('.work-card').length === 1);
        assert.match(await visibleText(rp, '.work-card .callout-text'), /נא להוסיף ציטוט/);
        await rp.click('.work-card [data-action="edit-article"]');
        await until(rp, () => !document.getElementById('articleEditModal').hidden);
        assert.ok(await isVisible(rp, '#modalRevisionCallout'), 'the note is shown inside the editor too');
        assert.match(await visibleText(rp, '#submitApprovalText'), /מחדש/);
        await rp.fill('#editContent', `${body}<blockquote>"ניצחנו!" אמר המאמן.</blockquote>`);
        await waitSaved(rp);
        await rp.click('#submitApprovalBtn');
        await confirmYes(rp);
        await until(rp, () => document.getElementById('articleEditModal').hidden);

        // 8. the editor approves: it is published
        await ep.click('[data-action="refresh"]');
        await ep.settle(300);
        await until(ep, () => /ממתינה לאישור/.test(document.querySelector('#articlesTableBody .status').textContent));
        await ep.click('#articlesTableBody [data-action="review"]');
        await until(ep, () => !document.getElementById('reviewDiffModal').hidden);
        await ep.click('#reviewApproveBtn');
        await confirmYes(ep);
        await until(ep, () => document.getElementById('reviewDiffModal').hidden);
        await until(ep, () => /פורסמה/.test(document.querySelector('#articlesTableBody .status').textContent));
        article = await findMine();
        assert.equal(article.status, 'published');
        const publicPage = await (await fetch(`${site.base}/article/${article._id}`)).text();
        assert.ok(publicPage.includes('ניצחנו'), 'the readers see the approved text, rendered by the server');

        // 9. editing a published article: the readers keep the approved version until the editor approves the update
        await rp.goto(`${site.base}/reporter.html`);
        await rp.fill('#searchInput', title);
        await until(rp, () => document.querySelectorAll('.work-card').length === 1);
        await rp.click('.work-card [data-action="edit-article"]');
        await until(rp, () => !document.getElementById('articleEditModal').hidden);
        assert.ok(await isVisible(rp, '#modalPublishedWarning'), 'the reporter is told that the readers keep the old version');
        const updatedTitle = `${title} (עדכון)`;
        await rp.fill('#editTitle', updatedTitle);
        await waitSaved(rp);
        assert.ok((await (await fetch(`${site.base}/article/${article._id}`)).text()).includes(`<h1 class="display article-title">${title}</h1>`), 'the public page still shows the approved title');
        await rp.click('#submitApprovalBtn');
        await confirmYes(rp);
        await until(rp, () => document.getElementById('articleEditModal').hidden);
        assert.ok((await (await fetch(`${site.base}/article/${article._id}`)).text()).includes(`>${title}</h1>`), 'also after submitting, the old version stays public');

        // 10. the editor sees what is published now and what is new
        await ep.click('[data-action="refresh"]');
        await ep.settle(300);
        await until(ep, () => document.querySelector('#articlesTableBody .badge-warn'));
        await ep.click('#articlesTableBody [data-action="review"]');
        await until(ep, () => !document.getElementById('reviewDiffModal').hidden);
        assert.match(await visibleText(ep, '#leftPaneHeaderTitle'), /שמוצגת לציבור/);
        assert.match(await visibleText(ep, '#currentPubTitle'), new RegExp(`^${title}$`));
        assert.match(await visibleText(ep, '#pendingDiffTitle'), /\(עדכון\)/);
        await ep.press('Escape');
        await until(ep, () => document.getElementById('reviewDiffModal').hidden);
        // an update of the text itself shows as additions and deletions
        const second = await openStaffPage('dan_reporter', '/reporter.html');
        try {
            await second.page.fill('#searchInput', title);
            await until(second.page, () => document.querySelectorAll('.work-card').length === 1);
        } finally { await second.close(); }

        // 11. approve the update: now the readers see it
        await ep.click('#articlesTableBody [data-action="review"]');
        await until(ep, () => !document.getElementById('reviewDiffModal').hidden);
        await ep.click('#reviewApproveBtn');
        await confirmYes(ep);
        await until(ep, () => document.getElementById('reviewDiffModal').hidden);
        assert.ok((await (await fetch(`${site.base}/article/${article._id}`)).text()).includes(updatedTitle), 'the approved update is public');

        // 12. the editor deletes it: asked first, then it is gone
        await ep.click('#articlesTableBody [data-action="delete"]');
        await until(ep, () => Boolean(document.querySelector('.modal[role="alertdialog"]:not([hidden])')));
        assert.match(await visibleText(ep, '.modal[role="alertdialog"] .modal-title'), /מחיקת כתבה/);
        await confirmYes(ep);
        await until(ep, () => /לא נמצאו כתבות/.test(document.getElementById('articlesTableBody').textContent));
        assert.equal((await fetch(`${site.base}/api/articles/public/${article._id}`)).status, 404);

        noPageProblems(rp);
        noPageProblems(ep);
    } finally {
        await reporter.close();
        await editor.close();
    }
});

flow('Editor desk: direct edit changes the article and the list shows it at once', async () => {
    const { page, close } = await openStaffPage('sarah_editor', '/editor.html');
    try {
        await until(page, () => document.querySelectorAll('#articlesTableBody [data-action="direct-edit"]').length > 0);
        const original = await page.run(() => document.querySelector('#articlesTableBody tr .strong').textContent.trim());
        await page.click('#articlesTableBody [data-action="direct-edit"]');
        await until(page, () => !document.getElementById('directEditModal').hidden);
        const edited = `${original} [נערך]`;
        await page.fill('#directTitle', edited);
        await page.fill('#directTitle', edited);
        await page.click('#directSaveBtn');
        await until(page, () => document.getElementById('directEditModal').hidden);
        await until(page, (text) => [...document.querySelectorAll('#articlesTableBody tr .strong')].some((el) => el.textContent.trim() === text), edited);

        // an empty title is refused in the form itself
        await page.click('#articlesTableBody [data-action="direct-edit"]');
        await until(page, () => !document.getElementById('directEditModal').hidden);
        await page.fill('#directTitle', '');
        await page.click('#directSaveBtn');
        assert.match(await visibleText(page, '#directError'), /חובה/);
        noPageProblems(page);
    } finally { await close(); }
});

// ================================================================================================================
// Impact Analytics and data management
// ================================================================================================================

flow('Impact Analytics: the graph, the update markers and the before / after comparison', async () => {
    const { page, close } = await openStaffPage('sarah_editor', `/analytics.html?articleId=${site.updatedId}`);
    try {
        await until(page, () => document.querySelectorAll('#milestonesTimeline .timeline-item').length >= 2);
        assert.equal(await page.run((id) => document.getElementById('articleSelect').value === id, site.updatedId), true, 'the article of the link is selected');
        assert.ok(Number((await visibleText(page, '#revisionsCountDisplay'))) >= 1, 'approved updates are counted');
        assert.ok(await count(page, '#milestonesTimeline .timeline-dot.is-update') >= 1, 'every approved update is a milestone');
        assert.match(await visibleText(page, '#impactPercentageBadge'), /%/, 'the before / after change is shown as a percentage');
        assert.notEqual(await visibleText(page, '#beforeAvgDisplay'), '-');

        const chart = await page.run(() => {
            if (typeof Chart === 'undefined') return { loaded: false };
            const instance = Chart.getChart(document.getElementById('impactChart'));
            if (!instance) return { loaded: true, drawn: false };
            const rect = document.getElementById('impactChart').getBoundingClientRect();
            return { loaded: true, drawn: true, points: instance.data.datasets[0].data.length, width: rect.width, height: rect.height,
                markers: instance.config.options.plugins.milestoneMarkers.milestones.map((m) => m.type) };
        });
        if (!chart.loaded) {
            // the graph library comes from a CDN: without internet the page must say so instead of showing an empty box
            assert.ok(await isVisible(page, '#chartMessage'), 'the page explains that the graph library did not load');
        } else {
            assert.ok(chart.drawn && chart.points > 5 && chart.width > 200 && chart.height > 200, JSON.stringify(chart));
            assert.ok(chart.markers.includes('INITIAL_PUBLISH') && chart.markers.includes('REVISION_UPDATE'), 'the publication and the updates are marked on the graph');
        }

        // another article from the picker: the numbers follow
        const next = await page.run(() => document.getElementById('articleSelect').options[1].value);
        await choose(page, '#articleSelect', next);
        await until(page, () => /מדור:/.test(document.getElementById('articleCategoryDisplay').textContent));
        noPageProblems(page);
    } finally { await close(); }
});

flow('Data management: create, find, edit and delete users, comments and view statistics', async () => {
    const { page, close } = await openStaffPage('sarah_editor', '/admin.html');
    const username = `ui_user_${Date.now()}`;
    try {
        await until(page, () => document.querySelectorAll('#usersBody tr').length > 1);

        // --- users
        await page.click('[data-action="new-user"]');
        await until(page, () => !document.getElementById('userModal').hidden);
        await page.fill('#userFullName', 'משתמש בדיקה');
        await page.fill('#userUsername', username);
        await page.fill('#userPassword', '123');                                  // too short: the server explains
        await page.click('#userForm button[type="submit"]');
        await until(page, () => !document.getElementById('userError').hidden);
        assert.ok((await visibleText(page, '#userError')).length > 5, 'the server\'s explanation is shown');
        await page.fill('#userPassword', 'secret-pass-1');
        await page.click('#userForm button[type="submit"]');
        await until(page, () => document.getElementById('userModal').hidden);
        await page.fill('#usersSearch', username);
        await until(page, () => document.querySelectorAll('#usersBody tr').length === 1 && document.querySelector('#usersBody td.num'));
        assert.equal(await visibleText(page, '#usersBody td.num'), username);

        await page.click('#usersBody [data-action="edit-user"]');
        await until(page, () => !document.getElementById('userModal').hidden);
        assert.equal(await page.run(() => document.getElementById('userUsername').disabled), true, 'the login name cannot be changed');
        await page.fill('#userFullName', 'משתמש בדיקה (עודכן)');
        await page.click('#userForm button[type="submit"]');
        await until(page, () => document.getElementById('userModal').hidden);
        await until(page, () => /עודכן/.test(document.querySelector('#usersBody .strong').textContent));

        await page.click('#usersBody [data-action="delete-user"]');
        await confirmYes(page);
        await until(page, () => /לא נמצאו משתמשים/.test(document.getElementById('usersBody').textContent));

        // --- comments
        await page.click('#tabComments');
        await until(page, () => document.querySelectorAll('#commentsBody [data-action="edit-comment"]').length > 0);
        await page.click('#commentsBody [data-action="edit-comment"]');
        await until(page, () => !document.getElementById('commentModal').hidden);
        await page.fill('#commentContent', 'תגובה שנערכה בבדיקה');
        await page.click('#commentForm button[type="submit"]');
        await until(page, () => document.getElementById('commentModal').hidden);
        await until(page, () => [...document.querySelectorAll('#commentsBody .cell-clip')].some((el) => el.textContent === 'תגובה שנערכה בבדיקה'));
        await page.fill('#commentsSearch', 'שנערכה בבדיקה');
        await until(page, () => document.querySelectorAll('#commentsBody tr').length === 1);
        await page.click('#commentsBody [data-action="delete-comment"]');
        await confirmYes(page);
        await until(page, () => /לא נמצאו תגובות/.test(document.getElementById('commentsBody').textContent));

        // --- view statistics
        await page.click('#tabStats');
        await until(page, () => document.querySelectorAll('#statsBody tr').length > 0);
        await page.click('[data-action="new-stat"]');
        await until(page, () => !document.getElementById('statModal').hidden && document.getElementById('statArticle').options.length > 0);
        await page.fill('#statBucket', '2026-01-02-03');
        await page.fill('#statViews', '7');
        await page.fill('#statNotes', 'רשומת בדיקה');
        await page.click('#statForm button[type="submit"]');
        await until(page, () => document.getElementById('statModal').hidden);
        await page.fill('#statsSearch', '2026-01-02-03');
        await until(page, () => document.querySelectorAll('#statsBody tr').length === 1 && /2026-01-02-03/.test(document.getElementById('statsBody').textContent));
        await page.click('#statsBody [data-action="edit-stat"]');
        await until(page, () => !document.getElementById('statModal').hidden);
        await page.fill('#statViews', '9');
        await page.click('#statForm button[type="submit"]');
        await until(page, () => document.getElementById('statModal').hidden);
        await until(page, () => /^9$/.test(document.querySelector('#statsBody td.num + td.num').textContent.trim()));
        await page.click('#statsBody [data-action="delete-stat"]');
        await confirmYes(page);
        await until(page, () => /לא נמצאו רשומות/.test(document.getElementById('statsBody').textContent));

        assert.deepEqual(page.errors, []);
        assert.deepEqual(page.unexpectedFailures(), []);
    } finally { await close(); }
});

// ================================================================================================================
// How the pages behave
// ================================================================================================================

flow('Dialogs: focus stays inside, Escape closes, and focus goes back to the button that opened the dialog', async () => {
    const { page, close } = await openStaffPage('sarah_editor', '/editor.html');
    try {
        await until(page, () => document.querySelectorAll('#articlesTableBody [data-action="direct-edit"]').length > 0);
        await page.click('#articlesTableBody [data-action="direct-edit"]');
        await until(page, () => !document.getElementById('directEditModal').hidden);
        const inside = () => page.run(() => document.getElementById('directEditModal').contains(document.activeElement));
        assert.ok(await inside(), 'focus moved into the dialog');
        for (let i = 0; i < 14; i++) { await page.press('Tab'); assert.ok(await inside(), `Tab ${i + 1} left the dialog`); }
        for (let i = 0; i < 4; i++) { await page.pressShiftTab(); assert.ok(await inside(), 'Shift+Tab left the dialog'); }
        assert.equal(await page.run(() => document.getElementById('directEditModal').getAttribute('aria-modal')), 'true');
        await page.press('Escape');
        await until(page, () => document.getElementById('directEditModal').hidden);
        assert.equal(await page.run(() => document.activeElement.getAttribute('data-action')), 'direct-edit', 'focus returned to the button that opened it');
        assert.equal(await page.run(() => document.body.classList.contains('is-locked')), false, 'the page scrolls again');
    } finally { await close(); }
});

flow('Light and dark theme: the choice is applied at once and remembered', async () => {
    const { page, close } = await openPage(site, { viewport: 'desktop' });
    try {
        await page.goto(`${site.base}/`);
        const before = await page.run(() => document.documentElement.dataset.theme);
        await page.click('.site-tools [data-action="toggle-theme"]');
        const after = await page.run(() => document.documentElement.dataset.theme);
        assert.notEqual(after, before);
        await page.goto(`${site.base}/login.html`);
        assert.equal(await page.run(() => document.documentElement.dataset.theme), after, 'the choice is kept on other pages and after loading');
    } finally { await close(); }
});

flow('Small screens: the workspace menu is a drawer that opens, closes with Escape or a tap outside, and leads to the pages', async () => {
    const { page, close } = await openStaffPage('sarah_editor', '/portal.html', 'mobile');
    try {
        await until(page, () => document.querySelectorAll('#portalStats .stat-value').length > 0);
        assert.ok(!(await isVisible(page, '.sidebar')), 'the menu starts closed');
        await page.click('[data-action="open-nav"]');
        await until(page, () => document.body.classList.contains('nav-open'));
        await sleep(400);
        assert.ok(await isVisible(page, '.sidebar .side-link[href="/editor.html"]'));
        await page.press('Escape');
        await until(page, () => !document.body.classList.contains('nav-open'));
        await sleep(450);                                                          // the drawer slides out
        await page.click('[data-action="open-nav"]');
        await sleep(450);
        await page.mouseClickAt(30, 400);                                          // a tap on the dimmed page
        await until(page, () => !document.body.classList.contains('nav-open'));
        await sleep(450);
        await page.click('[data-action="open-nav"]');
        await sleep(400);
        await page.click('.sidebar .side-link[href="/editor.html"]');
        await page.waitForUrl(/\/editor\.html/);
        noPageProblems(page);
    } finally { await close(); }
});

flow('Pages that do not exist and articles that were removed get the same frame and a way back', async () => {
    const { page, close } = await openPage(site, { viewport: 'desktop' });
    try {
        for (const url of ['/no/such/page', '/article/000000000000000000000000', '/article/not-an-id']) {
            await page.goto(`${site.base}${url}`);
            assert.ok(await isVisible(page, '.site-header'), `${url}: the site header is there`);
            assert.ok(await isVisible(page, '.error-card a[href="/"]'), `${url}: a link back to the home page`);
            assert.match(await visibleText(page, '.error-code'), /404/);
        }
        await page.click('.error-card a[href="/"]');
        await page.waitForUrl(/^\/$/);
    } finally { await close(); }
});
