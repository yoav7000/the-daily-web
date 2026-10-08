const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = require('../src/app');
const Article = require('../src/models/Article');
const { ARTICLE_STATUS, ARTICLE_CATEGORIES } = require('../src/constants/articleConstants');
const { connectTestDb, disconnectTestDb, createEditor, createReporter } = require('./helpers/testEnv');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const JS_DIR = path.join(PUBLIC_DIR, 'js');
const VIEWS_DIR = path.join(__dirname, '..', 'src', 'views');

const PAGES = fs.readdirSync(PUBLIC_DIR).filter((file) => file.endsWith('.html')).sort();
const VIEWS = fs.readdirSync(VIEWS_DIR).filter((file) => file.endsWith('.ejs')).sort();
const PAGE_FILES = [
    ...PAGES.map((page) => ({ name: page, file: path.join(PUBLIC_DIR, page) })),
    ...VIEWS.map((view) => ({ name: view, file: path.join(VIEWS_DIR, view) }))
];
const SCRIPT_FILES = fs.readdirSync(JS_DIR).filter((file) => file.endsWith('.js')).sort();

// Helpers that live in the shared scripts: a page that calls them must include the script that defines them
const SHARED_HELPERS = {
    escapeHtml: '/js/common.js',
    getAuthToken: '/js/common.js',
    clearLocalLogin: '/js/common.js',
    logout: '/js/common.js',
    requireAuth: '/js/common.js',
    applyRoleVisibility: '/js/common.js',
    api: '/js/common.js',
    debounce: '/js/common.js',
    formatDate: '/js/common.js',
    formatDateTime: '/js/common.js',
    loadWeather: '/js/common.js',
    icon: '/js/icons.js',
    renderCommentList: '/js/comments.js',
    addCommentToList: '/js/comments.js',
    createCommentElement: '/js/comments.js'
};

// The one design system every page is built from, in the order the pages load it
const DESIGN_ASSETS = [
    '<link rel="stylesheet" href="/css/base.css">',
    '<link rel="stylesheet" href="/css/components.css">',
    '<link rel="stylesheet" href="/css/layout.css">',
    '<link rel="stylesheet" href="/css/pages.css">',
    '<script src="/js/theme.js"></script>',
    '<script src="/js/icons.js"></script>',
    '<script src="/js/common.js"></script>',
    '<script src="/js/ui.js"></script>'
];

const EDITOR_ONLY_PAGES = ['/editor.html', '/analytics.html', '/admin.html'];

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
test('Every page: scripts parse, every button has a handler, shared helpers are loaded', async (t) => {
    for (const { name, file } of PAGE_FILES) {
        await t.test(name, () => {
            const html = read(file);

            // 1. all inline scripts are valid JavaScript
            inlineScripts(html).forEach((code, i) => {
                assert.doesNotThrow(() => new Function(code), `${name}: inline script #${i + 1} has a syntax error`);
            });

            const code = pageSources(html);
            const defined = definedFunctions(code);

            // 2. every function named in an onclick / onchange / oninput / onsubmit exists
            const missing = new Set();
            for (const [, attr] of html.matchAll(/\son(?:click|change|input|submit)="([^"]*)"/g)) {
                for (const [, fn] of attr.matchAll(/(?:^|[;\s(!])([A-Za-z_$][\w$]*)\s*\(/g)) {
                    if (['if', 'confirm', 'alert', 'return', 'function'].includes(fn)) continue;
                    if (!defined.has(fn)) missing.add(fn);
                }
            }
            assert.deepEqual([...missing], [], `${name}: handlers without a function`);

            // 3. every data-action in the page (and in the markup its scripts build) has a handler registered with UI.on()
            // (inside ui.js the same function is simply called on())
            const registered = new Set([...code.matchAll(/(?:UI\.|(?<![\w$.]))on\(\s*'([\w-]+)'/g)].map((m) => m[1]));
            const used = new Set([
                ...[...html.matchAll(/data-action="([\w-]+)"/g)].map((m) => m[1]),
                ...[...code.matchAll(/data-action="([\w-]+)"/g)].map((m) => m[1]),
                ...[...code.matchAll(/action:\s*\{\s*name:\s*'([\w-]+)'/g)].map((m) => m[1]),
                ...[...code.matchAll(/errorRow\([^)]*,\s*'([\w-]+)'\)/g)].map((m) => m[1])
            ]);
            const dead = [...used].filter((action) => !registered.has(action));
            assert.deepEqual(dead, [], `${name}: buttons whose data-action nobody handles`);

            // 4. a page that uses a shared helper includes the script that defines it
            const included = new Set(includedScripts(html));
            for (const [helper, script] of Object.entries(SHARED_HELPERS)) {
                const usesHelper = new RegExp(`(?<![\\w$.])${helper}\\s*\\(`).test(html.replace(/function\s+\w+\s*\(/g, ''));
                const definesItself = inlineScripts(html).some((inline) => definedFunctions(inline).has(helper));
                if (usesHelper && !definesItself) {
                    assert.ok(included.has(script), `${name} calls ${helper}() but does not include ${script}`);
                }
            }

            // 5. every page has the favicon, so browsers never get a 404 for it
            assert.ok(/<link rel="icon" href="\/favicon\.svg"/.test(html), `${name}: favicon link missing`);

            // 6. one design system for all pages: the same stylesheets and scripts, in the same order
            let cursor = -1;
            for (const asset of DESIGN_ASSETS) {
                const position = html.indexOf(asset);
                assert.ok(position > cursor, `${name}: ${asset} is missing or out of order`);
                cursor = position;
            }
            assert.match(html, /<body data-shell="(?:public|staff|bare)"/, `${name}: body must say which frame it uses (data-shell)`);
            assert.match(html, /<script src="\/js\/shell\.js"><\/script>/, `${name}: the frame script is missing`);
            assert.match(html, /<html lang="he" dir="rtl">/, `${name}: the page must be Hebrew, right to left`);
            assert.match(html, /name="viewport"/, `${name}: no viewport meta (responsive layout)`);
            assert.match(html, /<main[^>]*id="main"/, `${name}: no <main id="main"> landmark for the skip link`);

            // 7. no leftovers of the removed developer / demo tooling
            const has = (pattern) => pattern.test(html);
            assert.ok(!has(/<marquee/i), `${name}: obsolete <marquee> tag`);
            assert.ok(!has(/simulateViews|triggerSpamTest|quickLogin|fillDemoLogin|register-tab|regUsername/), `${name}: demo tooling is back`);
            assert.ok(!has(/\+1 צפיית|\+10 צפיות|Stress Test|\(AJAX\)/), `${name}: developer wording on screen`);
            assert.ok(!has(/href="\/test\.html"/), `${name}: link to the removed workbench`);

            // 8. the browser's own pop-ups are replaced by the site's dialogs and toasts
            assert.ok(!/(?<![\w.$])(?:alert|confirm|prompt)\(/.test(inlineScripts(html).join('\n')), `${name}: uses a native alert/confirm/prompt dialog`);
        });
    }
});

test('Every link to another page of the site points at something that exists', () => {
    const files = new Set(PAGES.map((page) => `/${page}`));
    files.add('/');
    const exists = (href) => files.has(href) || fs.existsSync(path.join(PUBLIC_DIR, href));

    const sources = [
        ...PAGE_FILES.map(({ name, file }) => ({ name, text: read(file) })),
        ...SCRIPT_FILES.map((script) => ({ name: `js/${script}`, text: read(path.join(JS_DIR, script)) }))
    ];
    for (const { name, text } of sources) {
        for (const [, href] of text.matchAll(/<a [^>]*href="(\/[^"#?]*)(?:\?[^"]*)?"/g)) {
            if (href.startsWith('/article/') || href.startsWith('/api/') || href.includes('${') || href.includes('<%')) continue;
            assert.ok(exists(href), `${name} links to ${href}, which does not exist`);
        }
        for (const [, category] of text.matchAll(/href="\/\?category=([^"$<]+)"/g)) {
            assert.ok(ARTICLE_CATEGORIES.includes(decodeURIComponent(category)), `${name}: unknown category "${category}"`);
        }
        // pages the scripts send the browser to
        for (const [, target] of text.matchAll(/'(\/[a-z]+\.html)(?:\?[^']*)?'/g)) {
            assert.ok(exists(target), `${name} sends the browser to ${target}, which does not exist`);
        }
    }
});

test('The header lists exactly the sections the server knows', () => {
    const shell = read(path.join(JS_DIR, 'shell.js'));
    const listed = shell.match(/const CATEGORIES = (\[[^\]]*\])/);
    assert.ok(listed, 'shell.js should define CATEGORIES');
    assert.deepEqual(JSON.parse(listed[1].replace(/'/g, '"')), ARTICLE_CATEGORIES);
});

test('Editor-only pages are never offered to reporters, and guard themselves', () => {
    const shell = read(path.join(JS_DIR, 'shell.js'));
    for (const target of EDITOR_ONLY_PAGES) {
        // the workspace menu entry is marked editor-only (and starts hidden)
        const entry = shell.match(new RegExp(`\\{[^{}]*href: '${target}'[^{}]*\\}`));
        assert.ok(entry, `shell.js has no menu entry for ${target}`);
        assert.match(entry[0], /editorOnly: true/, `shell.js: the ${target} menu entry is not hidden from reporters`);
    }
    assert.match(shell, /user\.role === 'editor'/, 'the public header should offer the editor desk to editors only');

    // the desk cards of the portal
    const portal = read(path.join(PUBLIC_DIR, 'portal.html'));
    for (const target of EDITOR_ONLY_PAGES) {
        const [tag] = portal.match(new RegExp(`<a [^>]*href="${target}"[^>]*>`));
        assert.match(tag, /data-editor-only/, `portal.html: the ${target} card is not hidden from reporters`);
    }
    assert.match(portal, /applyRoleVisibility\(/);

    // the pages themselves send everybody else back
    for (const page of ['editor.html', 'analytics.html', 'admin.html']) {
        assert.match(read(path.join(PUBLIC_DIR, page)), /requireAuth\(\{ role: 'editor' \}\)/, `${page} does not check the role`);
    }
    for (const page of ['portal.html', 'reporter.html', 'editor.html', 'analytics.html', 'admin.html']) {
        assert.match(read(path.join(PUBLIC_DIR, page)), /<body data-shell="staff"/, `${page} should use the staff frame`);
    }
});

test('Permissions never rest on data the visitor can edit in the browser', () => {
    const common = read(path.join(JS_DIR, 'common.js'));
    const body = common.slice(common.indexOf('function requireAuth'), common.indexOf('// Hides links that only editors can use'));
    assert.ok(body.includes("api('GET', '/api/auth/me'"), 'requireAuth should ask the server who the user is');
    assert.ok(!body.includes('getCachedUser'), 'requireAuth must not trust the user copy cached in the browser');

    // the cached copy may only fill in a name: the role-based menu waits for the server's answer
    const shell = read(path.join(JS_DIR, 'shell.js'));
    assert.match(shell, /paintStaff\(getCachedUser\(\), false\)/);
    assert.match(shell, /paintStaff\(user, true\)/);
});

test('Only the technologies of the course are used: no external UI framework or library', () => {
    // allowed: Google Fonts (stylesheet only) and Chart.js for the graph (explicitly allowed by the assignment)
    const ALLOWED = [
        /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/?/,
        /^https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@[\d.]+\/dist\/chart\.umd\.min\.js$/,
        /^https:\/\/images\.unsplash\.com\//
    ];
    const FORBIDDEN = /bootstrap|jquery|\breact\b|angular|\bvue\b|tailwind|bulma|foundation|materialize|alpine|svelte/i;

    const sources = [
        ...PAGE_FILES.map(({ name, file }) => ({ name, text: read(file) })),
        ...SCRIPT_FILES.map((script) => ({ name: `js/${script}`, text: read(path.join(JS_DIR, script)) })),
        ...fs.readdirSync(path.join(PUBLIC_DIR, 'css')).map((css) => ({ name: `css/${css}`, text: read(path.join(PUBLIC_DIR, 'css', css)) }))
    ];
    for (const { name, text } of sources) {
        for (const [, url] of text.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) {
            assert.ok(ALLOWED.some((pattern) => pattern.test(url)), `${name} loads ${url}, which is not an allowed external resource`);
            assert.ok(!FORBIDDEN.test(url), `${name} loads an external UI framework: ${url}`);
        }
        const withoutUrls = text.replace(/https?:\/\/[^\s"')]+/g, '');
        assert.ok(!FORBIDDEN.test(withoutUrls.replace(/data-bs-/g, '')) || /sources|icons/.test(name), `${name} mentions an external UI framework`);
        assert.ok(!/@import\s+url\(\s*['"]?https?:/.test(text), `${name} imports a remote stylesheet`);
    }
});

test('Every icon the pages use exists in the icon set', () => {
    const icons = read(path.join(JS_DIR, 'icons.js'));
    const available = new Set(JSON.parse(icons.match(/window\.ICON_NAMES = (\[.*?\]);/)[1]));
    assert.ok(available.size > 40, 'the icon set should not be empty');

    const sources = [
        ...PAGE_FILES.map(({ name, file }) => ({ name, text: read(file) })),
        ...SCRIPT_FILES.filter((script) => script !== 'icons.js').map((script) => ({ name: `js/${script}`, text: read(path.join(JS_DIR, script)) }))
    ];
    for (const { name, text } of sources) {
        const wanted = new Set();
        for (const [, id] of text.matchAll(/#i-([a-z0-9-]+)/g)) wanted.add(id);
        for (const [, call] of text.matchAll(/(?<![\w$])icon\(([^)]*)\)/g)) {
            // icon('name', 'extra-class') or icon(cond ? 'a' : 'b'): the first quoted names are icons
            const firstArgument = call.split(/,(?=\s*')/)[0];
            for (const [, id] of firstArgument.matchAll(/'([a-z0-9-]+)'/g)) wanted.add(id);
        }
        for (const [, id] of text.matchAll(/(?:icon|iconName):\s*'([a-z0-9-]+)'/g)) wanted.add(id);
        const unknown = [...wanted].filter((id) => !available.has(id));
        assert.deepEqual(unknown, [], `${name} uses icons that are not in public/js/icons.js`);
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
    const sources = [
        ...PAGE_FILES.map(({ file }) => file),
        ...SCRIPT_FILES.map((script) => path.join(JS_DIR, script))
    ];
    const toUrl = (raw) => raw
        .replace(/\$\{articleId\}|\$\{[^}]*[iI]d[^}]*\}/g, article._id.toString())
        .replace(/\$\{[^}]*\}/g, '1');
    for (const file of sources) {
        const code = read(file);
        // every page talks to the server through the api('METHOD', '/api/...') helper of common.js
        for (const match of code.matchAll(/(?<![\w$.])api\(\s*['"](GET|POST|PUT|DELETE)['"]\s*,\s*[`'"](\/api\/[^`'"]*)[`'"]/g)) {
            calls.set(`${match[1]} ${toUrl(match[2])}`, path.basename(file));
        }
        for (const match of code.matchAll(/fetch\(\s*[`'"](\/api\/[^`'"]*)[`'"]\s*(?:,\s*\{([\s\S]{0,700}?)\}\s*\))?/g)) {
            const method = ((match[2] || '').match(/method:\s*['"](\w+)['"]/) || [])[1] || 'GET';
            calls.set(`${method} ${toUrl(match[1])}`, path.basename(file));
        }
    }
    assert.ok([...calls.values()].includes('admin.html'), 'the management page API calls should be found');
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
test('The article page and the error page are rendered in the same site frame as the other pages', async (t) => {
    await connectTestDb();
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    t.after(async () => { await new Promise((resolve) => server.close(resolve)); await disconnectTestDb(); });
    const base = `http://127.0.0.1:${server.address().port}`;

    const reporter = await createReporter('page_reporter');
    const article = await Article.create({
        title: 'כותרת לבדיקת עמוד', summary: 'תקציר', content: '<p>תוכן מלא של הכתבה</p>', category: 'ספורט',
        author: reporter.user.id, status: ARTICLE_STATUS.PUBLISHED, publishedAt: new Date()
    });

    const res = await fetch(`${base}/article/${article._id}`);
    const html = await res.text();
    assert.equal(res.status, 200);

    // the full content is in the first HTML, so search engines do not need to run any script
    assert.match(html, /<h1[^>]*>כותרת לבדיקת עמוד<\/h1>/);
    assert.match(html, /תוכן מלא של הכתבה/);
    assert.match(html, /<article>/);
    assert.match(html, /<time datetime="/);
    assert.match(html, /<meta property="og:title" content="כותרת לבדיקת עמוד">/);

    // the same frame as the rest of the site: public header with the sections, the article's own section marked
    assert.match(html, /<link rel="icon" href="\/favicon\.svg"/);
    assert.match(html, /<body data-shell="public"[^>]*data-section="ספורט"/);
    assert.match(html, /<script src="\/js\/shell\.js">/);
    assert.match(html, /href="\/css\/base\.css"/);
    assert.match(html, /id="weatherChip"/);

    // comments: the list and the form to add one
    assert.match(html, /id="commentsList"/);
    assert.match(html, /id="commentForm"/);
    assert.match(html, /<script src="\/js\/comments\.js">/);

    // an unknown address gets the same frame, with a clear message
    const missing = await fetch(`${base}/article/000000000000000000000000`);
    const missingHtml = await missing.text();
    assert.equal(missing.status, 404);
    assert.match(missingHtml, /<body data-shell="public"/);
    assert.match(missingHtml, /הכתבה לא נמצאה/);
    assert.match(missingHtml, /href="\/"[^>]*>חזרה לעמוד הראשי/);
});
