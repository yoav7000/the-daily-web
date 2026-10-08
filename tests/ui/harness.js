// Shared set-up of the browser tests: the real app on a random port, filled with the demo data, plus a real browser.
'use strict';

const { connectTestDb, disconnectTestDb } = require('../helpers/testEnv');
const seedDatabase = require('../../src/scripts/seed');
const app = require('../../src/app');
const Article = require('../../src/models/Article');
const { launch, findBrowser, sleep } = require('./browser');

const VIEWPORTS = {
    desktop: [1440, 900],
    tablet: [820, 1180],
    mobile: [390, 844],
    small: [320, 640]
};

// The browser tests need Chrome, Edge or Chromium. Without one they are skipped, with the reason shown.
const SKIP_REASON = findBrowser() ? false : 'no Chrome / Edge / Chromium found on this machine (install one or set CHROME_PATH)';

async function startSite() {
    await connectTestDb();
    await seedDatabase({ connect: false });
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await launch();

    const newest = await Article.findOne({ status: 'published' }).sort({ publishedAt: -1 }).lean();
    // an article that was updated several times after publication: the analytics page has a lot to show for it
    const updated = await Article.findOne({ status: 'published', 'revisionsHistory.1': { $exists: true } }).lean();

    return {
        base,
        browser,
        sampleId: String(newest._id),
        updatedId: String(updated._id),
        async stop() {
            await browser.close();
            await new Promise((resolve) => server.close(resolve));
            await disconnectTestDb();
        }
    };
}

async function apiLogin(site, username, password = 'password123') {
    const res = await fetch(`${site.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    return res.json();
}

// Puts the login where the site keeps it, as a real login does
async function signIn(page, site, username) {
    const login = await apiLogin(site, username);
    await page.goto(`${site.base}/api/health`); // any page of the site, so its storage can be written
    await page.run((token, user) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
    }, login.token, login.user);
    return login;
}

/**
 * A private browser window of the given size, optionally already logged in.
 * options: { user, viewport: 'desktop' | 'tablet' | 'mobile' | 'small', theme: 'light' | 'dark' }
 */
async function openPage(site, options = {}) {
    const context = await site.browser.newContext();
    const page = await context.newPage();
    page.origin = site.base;
    const [width, height] = VIEWPORTS[options.viewport || 'desktop'];
    await page.setViewport(width, height);
    if (options.user) await signIn(page, site, options.user);
    if (options.theme) {
        await page.goto(`${site.base}/api/health`);
        await page.run((theme) => localStorage.setItem('tdw_theme', theme), options.theme);
    }
    return { page, close: () => context.close() };
}

// Runs jobs with at most `limit` of them at the same time
async function inParallel(jobs, limit, run) {
    const results = new Array(jobs.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
        while (next < jobs.length) {
            const index = next++;
            results[index] = await run(jobs[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}

module.exports = { startSite, openPage, signIn, apiLogin, inParallel, VIEWPORTS, SKIP_REASON, sleep };
