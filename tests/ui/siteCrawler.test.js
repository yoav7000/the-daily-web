// The "button checker": opens every page of the site in a real browser, at the size of a computer, a tablet and a phone,
// and presses every button it finds. After each press it checks that the site did not break: no script error, no failed
// request, no native pop-up, the dialog that opened fits the screen and closes again with Escape, nothing is cut off,
// nothing lies on top of a button so that a click would miss it.
//
// Run it with:  npm run test:ui     (needs Chrome, Edge or Chromium; set CHROME_PATH for another browser)
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startSite, openPage, inParallel, SKIP_REASON, sleep } = require('./harness');
const audit = require('./audit');

let site;
test.before(async () => { if (!SKIP_REASON) site = await startSite(); });
test.after(async () => { if (site) await site.stop(); });

const PAGES = () => [
    { name: 'home page', url: '/', ready: 'article.story', minActions: 3 },
    { name: 'article page', url: `/article/${site.sampleId}`, ready: '.comment, .comment-empty', minActions: 3 },
    { name: 'login', url: '/login.html', ready: '#loginForm', minActions: 2 },
    { name: 'page not found', url: '/there-is-no-such-page', ready: '.error-card', status: 404 },
    { name: 'portal (editor)', url: '/portal.html', user: 'sarah_editor', ready: '#portalStats .stat-value', minActions: 2 },
    { name: 'portal (reporter)', url: '/portal.html', user: 'dan_reporter', ready: '#portalStats .stat-value', minActions: 2 },
    { name: 'reporter desk', url: '/reporter.html', user: 'dan_reporter', ready: '.work-card', minActions: 12 },
    { name: 'editor desk', url: '/editor.html', user: 'sarah_editor', ready: '#articlesTableBody .btn', minActions: 15 },
    { name: 'analytics', url: '/analytics.html', user: 'sarah_editor', ready: '#milestonesTimeline .timeline-item', minActions: 1 },
    { name: 'data management', url: '/admin.html', user: 'sarah_editor', ready: '#usersBody .btn', minActions: 12 }
];

const PRESS_LIMIT = 80; // controls pressed per page (each kind of control once)

// Closes whatever the last press opened (a dialog, a menu, the menu drawer) the way a person would, with Escape
async function closeNewestOverlay(page, note, who) {
    const before = await page.run(() => document.querySelectorAll('.modal:not([hidden])').length);
    await page.press('Escape');
    await sleep(120);
    const after = await page.run(() => ({
        modals: document.querySelectorAll('.modal:not([hidden])').length,
        menu: Boolean(document.querySelector('.menu:not([hidden])')),
        drawer: document.body.classList.contains('nav-open')
    }));
    if (after.modals >= before && before > 0) note('overlay', [`${who}: Escape did not close the dialog`]);
    if (after.menu) note('overlay', [`${who}: Escape did not close the menu`]);
    if (after.drawer) note('overlay', [`${who}: Escape did not close the menu drawer`]);
}

async function pressEverything(page, note) {
    const done = {};
    const pressed = [];
    const startPath = await page.run(() => location.pathname);

    for (let step = 0; step < PRESS_LIMIT; step++) {
        const target = await page.run(audit.pickNextControl, done, 1);
        if (!target) {
            // nothing left to press inside the open dialog: close it and continue with the page
            const open = await page.run(() => document.querySelectorAll('.modal:not([hidden])').length);
            if (open === 0) break;
            await closeNewestOverlay(page, note, 'leaving the dialog');
            continue;
        }
        done[target.kind] = (done[target.kind] || 0) + 1;
        pressed.push(target.description);

        try {
            await page.click('[data-crawl-target]');
        } catch (err) {
            note('click', [`${target.description}: ${err.message}`]);
            continue;
        }
        await sleep(100);
        await page.settle(150, 6000);

        const pathNow = await page.run(() => location.pathname);
        if (pathNow !== startPath) {
            // pressing it took us to another page (a link in the site frame): that is fine, come back and go on
            await page.goto(`${site.base}${startPath}`);
            continue;
        }

        // a dialog slides in over about 0.3s: measure it once it stands still (a busy machine needs longer)
        if (await page.run(() => Boolean(document.querySelector('.modal:not([hidden])')))) await sleep(500);
        const overlay = await page.run(audit.overlayAudit);
        note('overlay', overlay.problems.map((problem) => `after pressing ${target.description}: ${problem}`));
        // a dialog stays open: its own buttons are pressed next. A menu or the drawer is closed again right away.
        const menuOpen = await page.run(() => Boolean(document.querySelector('.menu:not([hidden])')));
        const drawerOpen = await page.run(() => document.body.classList.contains('nav-open'));
        if (menuOpen || drawerOpen) await closeNewestOverlay(page, note, `after pressing ${target.description}`);
        note('layout', (await page.run(audit.layoutAudit)).map((problem) => `after pressing ${target.description}: ${problem}`));
    }
    return pressed;
}

// Uses every text field, drop-down and radio button of the page the way a visitor would
async function useEveryField(page, note) {
    const fields = await page.run(audit.listFields);
    let used = 0;
    for (const field of fields) {
        const selector = `[data-crawl-field="${field.index}"]`;
        try {
            if (field.kind === 'text') {
                await page.fill(selector, 'א');
                await page.settle(300, 6000);
                await page.fill(selector, '');
                await page.settle(300, 6000);
            } else if (field.kind === 'select') {
                for (const value of field.options.slice(0, 8)) {
                    await page.run((sel, option) => {
                        const el = document.querySelector(sel);
                        el.value = option;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }, selector, value);
                    await page.settle(250, 6000);
                }
            } else {
                await page.click(`label:has(${selector})`);
                await page.settle(250, 6000);
            }
            used += 1;
        } catch (err) {
            note('field', [`${field.kind} "${field.name}": ${err.message}`]);
        }
    }
    return used;
}

// Presses every link of the page with a real click and checks that the page it leads to loads without a problem
async function clickEveryLink(page, note, job, viewport) {
    const startUrl = await page.run(() => location.pathname + location.search);
    const links = (await page.run(audit.listLinks)).filter(([href]) => !/logout/.test(href));
    let clicked = 0;
    for (const [href, label] of links.slice(0, 18)) {
        let found = await page.run(audit.markLink, href);
        if (!found) {
            // on a small screen the workspace menu is a drawer: open it first
            const opened = await page.run(() => {
                const opener = document.querySelector('[data-action="open-nav"]');
                if (!opener || !opener.getClientRects().length) return false;
                opener.click();
                return true;
            });
            if (opened) {
                // wait until the drawer has stopped sliding in (it takes longer on a busy machine)
                await page.waitFor(() => {
                    const box = document.querySelector('.sidebar').getBoundingClientRect();
                    return box.left >= -1 && box.right <= innerWidth + 1;
                });
                found = await page.run(audit.markLink, href);
                if (!found) {
                    // the link is not in the drawer either (hidden for this role): close it again, or it covers the next link
                    await page.run(() => document.querySelector('.sidebar [data-action="close-nav"]').click());
                    await page.waitFor(() => getComputedStyle(document.querySelector('.sidebar')).visibility === 'hidden');
                }
            }
        }
        if (!found) continue;
        page.resetRecords();
        try {
            await page.click('[data-crawl-link]');
        } catch (err) {
            note('link', [`"${label}" (${href}) cannot be clicked: ${err.message}`]);
            await page.goto(`${site.base}${startUrl}`);
            continue;
        }
        await sleep(200);
        await page.settle(250, 8000);
        clicked += 1;

        const wanted = new URL(href, site.base);
        const arrived = await page.run(() => location.pathname + location.search);
        const staysOnPage = wanted.pathname === new URL(startUrl, site.base).pathname; // e.g. a section filters the home page in place
        if (!staysOnPage && !arrived.startsWith(wanted.pathname) && !(wanted.pathname === '/portal.html' && /denied|login/.test(arrived))) {
            note('link', [`"${label}" should lead to ${href} but we ended up at ${arrived}`]);
        }
        const rendered = await page.run(() => Boolean(document.querySelector('main')) && document.body.innerText.trim().length > 20);
        if (!rendered) note('link', [`"${label}" (${href}) leads to an empty page`]);
        note('link', page.errors.map((error) => `"${label}" (${href}) caused ${error.kind}: ${error.text}`));
        note('link', page.unexpectedFailures().filter((text) => !text.endsWith('-> 404') || !arrived.includes('no-such')).map((text) => `"${label}" (${href}) caused ${text}`));

        await page.goto(`${site.base}${startUrl}`);
        await page.waitFor((selector) => Boolean(document.querySelector(selector)), job.ready, { timeout: 15000 });
    }
    page.resetRecords();
    return clicked;
}

async function crawl(job, viewport, theme) {
    const { page, close } = await openPage(site, { user: job.user, viewport, theme });
    const problems = [];
    const note = (kind, list) => list.forEach((problem) => problems.push(`[${kind}] ${problem}`));
    try {
        await page.goto(`${site.base}${job.url}`);
        await page.waitFor((selector) => Boolean(document.querySelector(selector)), job.ready, { timeout: 15000 });
        await sleep(300);

        note('layout', await page.run(audit.layoutAudit));
        note('click', await page.run(audit.clickAudit, 3));
        note('access', await page.run(audit.accessibilityAudit));

        if (!theme) {
            // every link of the page leads somewhere that exists
            for (const [href, label] of await page.run(audit.listLinks)) {
                const status = await page.run(async (target) => (await fetch(target)).status, href);
                if (status >= 400) note('link', [`"${label}" leads to ${href}, which answers ${status}`]);
            }
            const used = await useEveryField(page, note);
            const pressed = await pressEverything(page, note);
            const clicked = viewport === 'tablet' ? 0 : await clickEveryLink(page, note, job, viewport);
            if (process.env.SHOW_PRESSED) console.error(`
${job.name} (${viewport}): ${used} fields used, ${pressed.length} buttons pressed, ${clicked} links clicked`);
            if (process.env.SHOW_PRESSED) console.error(`
${job.name} (${viewport}) pressed ${pressed.length}: ${pressed.join(' | ')}`);
            if (pressed.length + clicked < (job.minActions || 0)) note('crawler', [`only ${pressed.length} buttons were pressed and ${clicked} links clicked (expected at least ${job.minActions} together): the page did not show its controls`]);
        }

        note('browser', page.errors.map((error) => `${error.kind}: ${error.text}`));
        // (the page itself may answer with the status the job expects, like the 404 of the error page)
        note('network', page.unexpectedFailures().filter((text) => !(job.status && text.endsWith(`${job.url} -> ${job.status}`))));
        note('dialog', page.dialogs.map((dialog) => `the site opened a native ${dialog.type} box ("${dialog.message}")`));
    } catch (err) {
        problems.push(`[crawler] ${err.message}`);
    } finally {
        await close();
    }
    return problems;
}

function report(results, labels) {
    const lines = [];
    results.forEach((problems, index) => {
        if (problems.length) lines.push(`\n${labels[index]}:\n  - ${[...new Set(problems)].slice(0, 25).join('\n  - ')}`);
    });
    return lines.join('\n');
}

for (const viewport of ['desktop', 'tablet', 'mobile']) {
    test(`Every page works at the size of a ${viewport} screen: no broken layout, every button can be pressed`, { skip: SKIP_REASON, timeout: 600000 }, async () => {
        const jobs = PAGES();
        const results = await inParallel(jobs, 4, (job) => crawl(job, viewport));
        const message = report(results, jobs.map((job) => `${job.name} (${viewport})`));
        assert.equal(message, '', message);
    });
}

test('Dark theme and the smallest phone screen: nothing is cut off', { skip: SKIP_REASON, timeout: 300000 }, async () => {
    const jobs = [];
    PAGES().forEach((job) => {
        jobs.push({ job, viewport: 'desktop', theme: 'dark' });
        jobs.push({ job, viewport: 'small', theme: 'dark' });
    });
    const results = await inParallel(jobs, 4, ({ job, viewport, theme }) => crawl(job, viewport, theme));
    const message = report(results, jobs.map(({ job, viewport, theme }) => `${job.name} (${viewport}, ${theme})`));
    assert.equal(message, '', message);
});
