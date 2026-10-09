// Page frames. Include this script right after <body> and say which frame the page wants:
//   <body data-shell="public">  site header with the sections, footer     (readers)
//   <body data-shell="staff">   workspace sidebar + mobile top bar         (reporters and editors)
//   <body data-shell="bare">    nothing around the page (login)
// Optional: data-page="reporter" marks the current item in the menu, data-section="ספורט" the current section.
// Needs theme.js, icons.js, common.js and ui.js in <head>.

(function () {
    const body = document.body;
    const kind = body.dataset.shell;
    if (!kind) return;

    if (window.mountIcons) window.mountIcons();

    // Keep in sync with ARTICLE_CATEGORIES in src/constants/articleConstants.js (a test checks it)
    const CATEGORIES = ['חדשות', 'פוליטיקה', 'כלכלה', 'טכנולוגיה', 'ספורט', 'תרבות', 'בריאות', 'דעות'];
    const PAGE = body.dataset.page || '';
    const LOGIN_URL = '/login.html';

    const themeButton = (extraClass) => `
        <button type="button" class="btn btn-ghost btn-icon ${extraClass || ''}" data-action="toggle-theme" aria-label="החלפה בין מצב בהיר למצב כהה" title="מצב בהיר / כהה">
            <span class="theme-moon">${icon('moon')}</span><span class="theme-sun">${icon('sun')}</span>
        </button>`;

    const skipLink = '<a class="skip-link" href="#main">דלגו לתוכן הראשי</a>';

    // -----------------------------------------------------------------------------------------
    // Public frame
    // -----------------------------------------------------------------------------------------

    function categoryFromPage() {
        if (body.dataset.section) return body.dataset.section;
        if (PAGE === 'home') return new URLSearchParams(window.location.search).get('category') || '';
        return '';
    }

    function navPills(activeCategory) {
        const isHome = PAGE === 'home';
        const pill = (label, href, category, active) =>
            `<a class="nav-pill${active ? ' is-active' : ''}" href="${href}" data-category="${escapeHtml(category)}"${active ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a>`;
        return pill('ראשי', '/', '', isHome && !activeCategory) +
            CATEGORIES.map((name) => pill(name, `/?category=${encodeURIComponent(name)}`, name, name === activeCategory)).join('');
    }

    function publicHeader() {
        return `
        ${skipLink}
        <header class="site-header" id="siteHeader">
            <div class="container site-header-row">
                <a class="brand" href="/" aria-label="The Daily Web – לעמוד הראשי">
                    <span class="brand-mark" aria-hidden="true">D</span>
                    <span class="brand-name">The Daily Web</span>
                </a>
                <form class="site-search" id="siteSearch" role="search" action="/" method="get">
                    <label class="input-icon">
                        ${icon('search')}
                        <input class="input" type="search" name="q" id="siteSearchInput" placeholder="חיפוש כתבות..." aria-label="חיפוש כתבות" autocomplete="off" data-search-input>
                        <span class="kbd" aria-hidden="true">/</span>
                    </label>
                </form>
                <div class="site-tools">
                    <button type="button" class="btn btn-ghost btn-icon show-sm" data-action="toggle-search" aria-label="חיפוש" aria-expanded="false">${icon('search')}</button>
                    ${themeButton()}
                    <div id="siteAuth" class="dropdown"></div>
                </div>
            </div>
            <nav class="site-nav" aria-label="מדורי העיתון">
                <div class="container site-nav-scroll" id="siteNav">${navPills(categoryFromPage())}</div>
            </nav>
        </header>`;
    }

    function publicFooter() {
        const sections = CATEGORIES.slice(0, 5).map((name) => `<li><a href="/?category=${encodeURIComponent(name)}">${escapeHtml(name)}</a></li>`).join('');
        return `
        <footer class="site-footer">
            <div class="container footer-grid">
                <div>
                    <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">D</span><span class="brand-name">The Daily Web</span></a>
                    <p>חדשות, פרשנות ותוכן דיגיטלי. מעודכן כל היום, נכתב ונערך על ידי צוות המערכת.</p>
                </div>
                <div>
                    <h2>מדורים</h2>
                    <ul>${sections}</ul>
                </div>
                <div>
                    <h2>לצוות המערכת</h2>
                    <ul>
                        <li><a href="/login.html">כניסת צוות</a></li>
                        <li><a href="/portal.html">סביבת העבודה</a></li>
                    </ul>
                </div>
            </div>
            <div class="container footer-bottom">
                <span>© ${new Date().getFullYear()} The Daily Web. כל הזכויות שמורות.</span>
                <span>נבנה עם Node.js, Express ו-MongoDB</span>
            </div>
        </footer>`;
    }

    function publicAuthHtml(user) {
        if (!user) {
            return `<a class="btn btn-secondary btn-sm" href="${LOGIN_URL}" aria-label="כניסת צוות">${icon('lock')}<span class="hide-xs">כניסת צוות</span></a>`;
        }
        const name = personName(user);
        const deskLinks = user.role === 'editor'
            ? `<a class="menu-item" role="menuitem" href="/editor.html">${icon('shield-check')} דסק עורכים</a>`
            : `<a class="menu-item" role="menuitem" href="/reporter.html">${icon('square-pen')} דסק כתבים</a>`;
        return `
            <button type="button" class="user-chip" data-action="toggle-menu" data-menu="userMenu" aria-haspopup="menu" aria-expanded="false" aria-label="תפריט המשתמש">
                <span class="avatar">${escapeHtml(initialOf(name))}</span>
                <span class="name hide-sm">${escapeHtml(name)}</span>
                ${icon('chevron-down')}
            </button>
            <div class="menu menu-start" id="userMenu" role="menu" hidden>
                <div class="menu-label"><strong>${escapeHtml(name)}</strong><br>${escapeHtml(roleLabel(user))}</div>
                <a class="menu-item" role="menuitem" href="/portal.html">${icon('layout-grid')} סביבת העבודה</a>
                ${deskLinks}
                <div class="menu-sep"></div>
                <button type="button" class="menu-item is-danger" role="menuitem" data-action="logout">${icon('log-out')} התנתקות</button>
            </div>`;
    }

    async function startPublic() {
        body.insertAdjacentHTML('afterbegin', publicHeader());
        document.addEventListener('DOMContentLoaded', () => {
            body.insertAdjacentHTML('beforeend', publicFooter());
        });

        const authHost = document.getElementById('siteAuth');
        const paint = (user) => { authHost.innerHTML = publicAuthHtml(user); Shell.user = user; };
        const cached = getAuthToken() ? getCachedUser() : null;
        paint(cached);

        if (getAuthToken()) {
            try {
                const data = await api('GET', '/api/auth/me', null, { keepSession: true });
                const user = data.user || data;
                try { localStorage.setItem('user', JSON.stringify(user)); } catch (e) { /* cache only */ }
                paint(user);
            } catch (err) {
                if (!err.network) {
                    clearLocalLogin();
                    paint(null);
                }
            }
        }
    }

    UI.on('toggle-search', (button) => {
        const header = document.getElementById('siteHeader');
        const open = header.classList.toggle('search-open');
        button.setAttribute('aria-expanded', String(open));
        if (open) document.getElementById('siteSearchInput').focus();
    });

    // -----------------------------------------------------------------------------------------
    // Staff frame
    // -----------------------------------------------------------------------------------------

    const STAFF_NAV = [
        { id: 'portal', href: '/portal.html', label: 'סקירה כללית', icon: 'layout-grid' },
        { group: 'עבודה' },
        { id: 'reporter', href: '/reporter.html', label: 'דסק כתבים', icon: 'square-pen', reporterOnly: true, badge: 'reporter' },
        { id: 'editor', href: '/editor.html', label: 'דסק עורכים', icon: 'shield-check', editorOnly: true, badge: 'editor' },
        { group: 'תובנות וניהול', editorOnly: true },
        { id: 'analytics', href: '/analytics.html', label: 'Impact Analytics', icon: 'chart-column', editorOnly: true },
        { id: 'admin', href: '/admin.html', label: 'ניהול נתונים', icon: 'database', editorOnly: true }
    ];

    function sideNavHtml() {
        return STAFF_NAV.map((item) => {
            const editorOnly = item.editorOnly ? ' data-editor-only hidden' : '';
            const reporterOnly = item.reporterOnly ? ' data-reporter-only hidden' : '';
            const roleAttrs = editorOnly || reporterOnly;
            if (item.group) return `<div class="side-group"${roleAttrs}>${escapeHtml(item.group)}</div>`;
            const current = item.id === PAGE ? ' aria-current="page"' : '';
            const badge = item.badge ? `<span class="badge badge-accent" data-badge="${item.badge}" hidden></span>` : '';
            return `<a class="side-link" href="${item.href}"${current}${roleAttrs}>${icon(item.icon)}<span>${escapeHtml(item.label)}</span>${badge}</a>`;
        }).join('');
    }

    function sidebarHtml() {
        return `
        ${skipLink}
        <aside class="sidebar" id="sidebar" aria-label="ניווט בסביבת העבודה">
            <div class="sidebar-top">
                <a class="brand" href="/portal.html" aria-label="The Daily Web – סביבת העבודה">
                    <span class="brand-mark" aria-hidden="true">D</span>
                    <span class="brand-name">The Daily Web</span>
                </a>
                <button type="button" class="btn btn-ghost btn-icon btn-sm show-md-down" data-action="close-nav" aria-label="סגירת התפריט">${icon('x')}</button>
            </div>
            <div class="sidebar-tag">סביבת עבודה</div>
            <nav class="side-nav" id="sideNav">${sideNavHtml()}</nav>
            <div class="sidebar-foot">
                <a class="side-link" href="/">${icon('newspaper')}<span>לאתר הציבורי</span>${icon('external-link', 'ext')}</a>
                <div class="user-card">
                    <span class="avatar" id="sideAvatar">?</span>
                    <span class="user-card-text">
                        <span class="user-card-name" id="sideName">טוען...</span>
                        <span class="user-card-role" id="sideRole">&nbsp;</span>
                    </span>
                    ${themeButton('btn-sm')}
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-action="logout" aria-label="התנתקות" title="התנתקות">${icon('log-out')}</button>
                </div>
            </div>
        </aside>
        <div class="sidebar-backdrop" data-action="close-nav"></div>
        <header class="staff-topbar">
            <button type="button" class="btn btn-secondary btn-icon btn-sm" data-action="open-nav" aria-label="פתיחת התפריט" aria-expanded="false" aria-controls="sidebar">${icon('menu')}</button>
            <a class="brand" href="/portal.html"><span class="brand-mark" aria-hidden="true">D</span><span class="brand-name">The Daily Web</span></a>
            ${themeButton('ms-auto')}
        </header>`;
    }

    // verified = the user came from the server. The copy cached in the browser may fill in a name, nothing more.
    function paintStaff(user, verified) {
        if (!user) return;
        const name = personName(user);
        document.getElementById('sideName').textContent = name;
        document.getElementById('sideAvatar').textContent = initialOf(name);
        if (!verified) return;
        Shell.user = user;
        document.getElementById('sideRole').textContent = roleLabel(user);
        applyRoleVisibility(user);
    }

    async function refreshBadges() {
        const user = Shell.user;
        if (!user) return;
        const setBadge = (key, count) => {
            const badge = document.querySelector(`[data-badge="${key}"]`);
            if (!badge) return;
            badge.textContent = count;
            badge.hidden = !count;
        };
        if (user.role === 'reporter') {
            try {
                const mine = await api('GET', '/api/articles/my-stats');
                setBadge('reporter', (mine.stats.revision_requested || 0) + (mine.stats.revisionUpdates || 0));
            } catch (err) { /* the badge is a nicety */ }
        }
        if (user.role === 'editor') {
            try {
                const all = await api('GET', '/api/articles/editor/stats');
                setBadge('editor', (all.stats.pending_approval || 0) + (all.stats.pendingUpdates || 0));
            } catch (err) { /* the badge is a nicety */ }
        }
    }

    function setNav(open) {
        body.classList.toggle('nav-open', open);
        const opener = document.querySelector('[data-action="open-nav"]');
        if (opener) opener.setAttribute('aria-expanded', String(open));
        if (open) {
            const current = document.querySelector('#sideNav .side-link[aria-current="page"]') || document.querySelector('#sideNav .side-link');
            if (current) current.focus({ preventScroll: true });
        } else if (opener && opener.getClientRects().length) {
            opener.focus({ preventScroll: true });
        }
    }

    function startStaff() {
        if (!getAuthToken()) {
            redirectToLogin();
            return;
        }
        body.insertAdjacentHTML('afterbegin', sidebarHtml());
        UI.on('open-nav', () => setNav(true));
        UI.on('close-nav', () => setNav(false));
        // choosing a destination closes the drawer on small screens
        document.getElementById('sideNav').addEventListener('click', (event) => {
            if (event.target.closest('a')) body.classList.remove('nav-open');
        });

        paintStaff(getCachedUser(), false);
        requireAuth().then((user) => {
            paintStaff(user, true);
            refreshBadges();
        });
    }

    // -----------------------------------------------------------------------------------------

    window.Shell = {
        user: null,
        refreshBadges,
        // the home page filters in place: it tells the header which section is open
        setActiveCategory(category) {
            document.querySelectorAll('#siteNav .nav-pill').forEach((pill) => {
                const active = pill.dataset.category === (category || '');
                pill.classList.toggle('is-active', active);
                if (active) pill.setAttribute('aria-current', 'page');
                else pill.removeAttribute('aria-current');
            });
        }
    };

    UI.on('logout', () => logout());

    if (kind === 'public') startPublic();
    else if (kind === 'staff') startStaff();
})();
