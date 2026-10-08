const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = require('../src/app');
const Article = require('../src/models/Article');
const { ARTICLE_STATUS, ARTICLE_CATEGORIES } = require('../src/constants/articleConstants');
const { connectTestDb, disconnectTestDb, createEditor, createReporter } = require('./helpers/testEnv');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PAGES = fs.readdirSync(PUBLIC_DIR).filter((file) => file.endsWith('.html')).sort();
const SHARED_SCRIPTS = { '/js/common.js': 'common.js', '/js/comments.js': 'comments.js' };

// Helpers that live in the shared scripts: a page that calls them must include the script that defines them
const SHARED_HELPERS = {
    escapeHtml: '/js/common.js',
    getAuthToken: '/js/common.js',
    clearLocalLogin: '/js/common.js',
    logout: '/js/common.js',
    requireAuth: '/js/common.js',
    applyRoleVisibility: '/js/common.js',
    renderCommentList: '/js/comments.js',
    addCommentToList: '/js/comments.js',
    createCommentElement: '/js/comments.js'
};

const read = (file) => fs.readFileSync(file, 'utf8');
const inlineScripts = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const includedScripts = (html) => [...html.matchAll(/<script src="(\/js\/[^"]+)"/g)].map((m) => m[1]);
const definedFunctions = (code) => new Set(
    [...code.matchAll(/(?:^|[\s;{}])(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1])
        .concat([...code.matchAll(/(?:^|[\s;{}])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g)].map((m) => m[1]))
        .concat([...code.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]))
);

const pageSources = (html) => {
    const scripts = inlineScripts(html);
    includedScripts(html).forEach((src) => scripts.push(read(path.join(PUBLIC_DIR, src))));
    return scripts.join('\n');
};

// ---------------------------------------------------------------------------------------------
test('Every page: scripts parse, handlers exist, shared helpers are loaded', async (t) => {
    for (const page of PAGES) {
        await t.test(page, () => {
            const html = read(path.join(PUBLIC_DIR, page));

            // 1. all inline scripts are valid JavaScript
            inlineScripts(html).forEach((code, i) => {
                assert.doesNotThrow(() => new Function(code), `${page}: inline script #${i + 1} has a syntax error`);
            });

            const code = pageSources(html);
            const defined = definedFunctions(code);

            // 2. every function named in an onclick / onchange / oninput / onsubmit exists
            const missing = new Set();
            for (const [, attr] of html.matchAll(/\son(?:click|change|input|submit)="([^"]*)"/g)) {
                for (const [, name] of attr.matchAll(/(?:^|[;\s(!])([A-Za-z_$][\w$]*)\s*\(/g)) {
                    if (['if', 'confirm', 'alert', 'return', 'function'].includes(name)) continue;
                    if (!defined.has(name) && !['bootstrap'].includes(name)) missing.add(name);
                }
            }
            assert.deepEqual([...missing], [], `${page}: handlers without a function`);

            // 3. a page that uses a shared helper includes the script that defines it
            const included = new Set(includedScripts(html));
            for (const [helper, script] of Object.entries(SHARED_HELPERS)) {
                const usesHelper = new RegExp(`(?<![\\w$.])${helper}\\s*\\(`).test(html.replace(/function\s+\w+\s*\(/g, ''));
                const definesItself = inlineScripts(html).some((inline) => definedFunctions(inline).has(helper));
                if (usesHelper && !definesItself) {
                    assert.ok(included.has(script), `${page} calls ${helper}() but does not include ${script}`);
                }
            }

            // 4. every page has the favicon, so browsers never get a 404 for it
            assert.ok(/<link rel="icon" href="\/favicon\.svg"/.test(html), `${page}: favicon link missing`);

            // 5. no leftovers of the removed developer / demo tooling
            const has = (pattern) => pattern.test(html);
            assert.ok(!has(/<marquee/i), `${page}: obsolete <marquee> tag`);
            assert.ok(!has(/simulateViews|triggerSpamTest|quickLogin|fillDemoLogin|register-tab|regUsername/), `${page}: demo tooling is back`);
            assert.ok(!has(/\+1 צפיית|\+10 צפיות|Stress Test|\(AJAX\)/), `${page}: developer wording on screen`);
            assert.ok(!has(/href="\/test\.html"/), `${page}: link to the removed workbench`);
        });
    }
});

test('Every link to another page of the site points at something that exists', () => {
    const files = new Set(PAGES.map((page) => `/${page}`));
    files.add('/');
    for (const page of PAGES) {
        const html = read(path.join(PUBLIC_DIR, page));
        for (const [, href] of html.matchAll(/<a [^>]*href="(\/[^"#?]*)(?:\?[^"]*)?"/g)) {
            if (href.startsWith('/article/') || href.startsWith('/api/') || href.includes('${')) continue;
            assert.ok(files.has(href) || fs.existsSync(path.join(PUBLIC_DIR, href)), `${page} links to ${href}, which does not exist`);
        }
        for (const [, category] of html.matchAll(/href="\/\?category=([^"]+)"/g)) {
            assert.ok(ARTICLE_CATEGORIES.includes(decodeURIComponent(category)), `${page}: unknown category "${category}"`);
        }
    }
});

test('Reporters never see menu links to editor-only pages', () => {
    for (const page of ['portal.html', 'reporter.html']) {
        const html = read(path.join(PUBLIC_DIR, page));
        for (const target of ['/editor.html', '/analytics.html', '/admin.html']) {
            const links = [...html.matchAll(new RegExp(`<a href="${target}"[^>]*class="(?:portal-nav-link|category-link)"[^>]*>`, 'g'))];
            links.forEach(([tag]) => assert.match(tag, /data-editor-only/, `${page}: ${target} menu link is not hidden from reporters`));
        }
        assert.match(html, /applyRoleVisibility\(/, `${page} never hides the editor-only links`);
    }
});

// ---------------------------------------------------------------------------------------------
test('Every API address a page uses exists on the server', async (t) => {
    await connectTestDb();
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    t.after(async () => { await new Promise((resolve) => server.close(resolve)); await disconnectTestDb(); });
    const base = `http://127.0.0.1:${server.address().port}`;

    const editor = await createEditor('contract_editor');
    const reporter = await createReporter('contract_reporter');
    const article = await Article.create({
        title: 'חוזה', content: 'x', category: 'חדשות', author: reporter.user.id,
        status: ARTICLE_STATUS.PUBLISHED, publishedAt: new Date()
    });

    const calls = new Map();
    const sources = [...PAGES.map((page) => path.join(PUBLIC_DIR, page)), path.join(__dirname, '..', 'src', 'views', 'article.ejs'), path.join(PUBLIC_DIR, 'js', 'comments.js'), path.join(PUBLIC_DIR, 'js', 'common.js')];
    for (const file of sources) {
        const code = read(file);
        for (const match of code.matchAll(/fetch\(\s*[`'"](\/api\/[^`'"]*)[`'"]\s*(?:,\s*\{([\s\S]{0,700}?)\}\s*\))?/g)) {
            const method = ((match[2] || '').match(/method:\s*['"](\w+)['"]/) || [])[1] || 'GET';
            const url = match[1]
                .replace(/\$\{articleId\}|\$\{[^}]*[iI]d[^}]*\}/g, article._id.toString())
                .replace(/\$\{[^}]*\}/g, '1');
            calls.set(`${method} ${url}`, path.basename(file));
        }
    }
    assert.ok(calls.size >= 15, `expected to find the pages' API calls, found ${calls.size}`);
    for (const mustExist of ['GET /api/articles/editor/stats', 'GET /api/articles/my-stats', 'GET /api/weather', 'POST /api/auth/login']) {
        assert.ok([...calls.keys()].some((call) => call.startsWith(mustExist)), `the pages should call ${mustExist}`);
    }

    for (const [call, file] of calls) {
        const [method, url] = call.split(' ');
        const res = await fetch(`${base}${url}`, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editor.token}` },
            body: ['POST', 'PUT'].includes(method) ? '{}' : undefined
        });
        const text = await res.text();
        const routeMissing = res.status === 404 && /נתיב ה-API המבוקש לא קיים/.test(text);
        assert.ok(!routeMissing, `${file} calls ${call}, but the server has no such route`);
        assert.ok(res.status < 500, `${file} calls ${call} and the server crashed (${res.status})`);
    }
});

// ---------------------------------------------------------------------------------------------
test('The article page is rendered in the same site frame as the rest of the pages', async (t) => {
    await connectTestDb();
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    t.after(async () => { await new Promise((resolve) => server.close(resolve)); await disconnectTestDb(); });

    const reporter = await createReporter('page_reporter');
    const article = await Article.create({
        title: 'כותרת לבדיקת עמוד', summary: 'תקציר', content: '<p>תוכן מלא של הכתבה</p>', category: 'ספורט',
        author: reporter.user.id, status: ARTICLE_STATUS.PUBLISHED, publishedAt: new Date()
    });

    const res = await fetch(`http://127.0.0.1:${server.address().port}/article/${article._id}`);
    const html = await res.text();
    assert.equal(res.status, 200);

    // content is in the first HTML (search engines), with the site header, the sections and the footer
    assert.match(html, /תוכן מלא של הכתבה/);
    assert.match(html, /<link rel="icon" href="\/favicon\.svg"/);
    assert.match(html, /<nav class="container category-bar"/);
    for (const category of ARTICLE_CATEGORIES) {
        assert.ok(html.includes(`href="/?category=${encodeURIComponent(category)}"`), `section link for ${category}`);
    }
    assert.match(html, /<a href="\/\?category=%D7%A1%D7%A4%D7%95%D7%A8%D7%98" class="active"/, 'the article\'s own section is highlighted');
    assert.match(html, /id="weatherChip"/);
    assert.match(html, /<footer/);
    assert.match(html, /<script src="\/js\/comments\.js">/);
});
