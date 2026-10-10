// Helpers shared by every page: text safety, login state, talking to the server, formatting.
// Pages never call fetch() for the API directly: they use the api() helper below.

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------------------------
// Login state
// ---------------------------------------------------------------------------------------------

// The login itself lives in an httpOnly session cookie that scripts cannot read; the server is the only
// authority on who is logged in. The browser keeps a copy of the user's name and role only to paint the
// header quickly, and never trusts it for permissions.
function getCachedUser() {
    try { return JSON.parse(localStorage.getItem('user')); } catch (e) { return null; }
}

function cacheUser(user) {
    try { localStorage.setItem('user', JSON.stringify(user)); } catch (e) { /* cache only */ }
}

function clearLocalLogin() {
    try { localStorage.removeItem('user'); } catch (e) { /* nothing to clear */ }
}

function redirectToLogin() {
    window.location.replace('/login.html?redirect=' + encodeURIComponent(window.location.pathname));
}

// Ends the server session (so the cookie stops working) and clears the saved login
async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
        console.error('Logout request failed:', err);
    }
    clearLocalLogin();
    window.location.href = '/login.html';
}

/**
 * Talks to the server. Resolves with the parsed JSON, or throws an Error whose message is the
 * server's own (Hebrew) explanation, with .status and .data attached. A network failure throws too.
 * An expired login (401) sends the person to the login page, unless { keepSession: true } is passed
 * (used for the login form itself and for the "who am I" check).
 */
async function api(method, url, body, options) {
    const keepSession = Boolean(options && options.keepSession);
    // keepalive: the request is completed even if the page is closed or refreshed meanwhile
    const keepalive = Boolean(options && options.keepalive);
    const headers = {};
    const hasBody = body !== undefined && body !== null;
    if (hasBody) headers['Content-Type'] = 'application/json';

    let res;
    try {
        res = await fetch(url, { method, headers, body: hasBody ? JSON.stringify(body) : undefined, keepalive });
    } catch (networkError) {
        const err = new Error('אין תקשורת עם השרת. בדקו את החיבור ונסו שוב.');
        err.network = true;
        throw err;
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 401 && !keepSession) {
        clearLocalLogin();
        redirectToLogin();
    }

    if (!res.ok || data.success === false) {
        const details = Array.isArray(data.errors) && data.errors.length ? ` (${data.errors.join(', ')})` : '';
        const err = new Error((data.message || 'הפעולה נכשלה. נסו שוב.') + details);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

let authCheck = null;

/**
 * Auth guard for staff pages. Resolves with the user as the SERVER knows them (never the copy kept in the
 * browser), or null (after sending the person to the login page). With { role: 'editor' } other roles are sent back to the portal with a short explanation.
 * The check runs once per page, however many scripts ask for it.
 */
function requireAuth(options) {
    if (!authCheck) {
        authCheck = (async () => {
            try {
                const { user } = await api('GET', '/api/auth/me', null, { keepSession: true });
                if (!user) {
                    clearLocalLogin();
                    redirectToLogin();
                    return null;
                }
                cacheUser(user);
                return user;
            } catch (err) {
                if (err.network) {
                    // The server cannot be reached, so nobody can be verified. The saved copy of the user is only a
                    // convenience for showing a name: it is never trusted for permissions, because anyone can edit it.
                    if (window.UI) UI.toast(err.message, 'error');
                    return null;
                }
                clearLocalLogin();
                redirectToLogin();
                return null;
            }
        })();
    }
    return authCheck.then((user) => {
        if (user && options && options.role && user.role !== options.role) {
            // the portal tells them which role the page is for
            window.location.replace(`/portal.html?denied=${encodeURIComponent(options.role)}`);
            return null;
        }
        return user;
    });
}

// Hides links that only editors or reporters can use. This only keeps the menu honest: every permission is checked again
// by the server on each request, hiding a link is never the protection itself.
function applyRoleVisibility(user) {
    const isEditor = Boolean(user) && user.role === 'editor';
    const isReporter = Boolean(user) && user.role === 'reporter';
    document.querySelectorAll('[data-editor-only]').forEach((el) => {
        el.hidden = !isEditor;
    });
    document.querySelectorAll('[data-reporter-only]').forEach((el) => {
        el.hidden = !isReporter;
    });
}

const ROLE_LABELS = { editor: 'עורך ראשי', reporter: 'כתב' };

// Where each role starts after logging in: the reporter in the reporter desk, the editor in the editor desk
function homeFor(user) {
    return user && user.role === 'editor' ? '/editor.html' : '/reporter.html';
}

function roleLabel(user) {
    return (user && ROLE_LABELS[user.role]) || 'צוות';
}

function personName(user) {
    return (user && (user.fullName || user.username)) || '';
}

function initialOf(name) {
    return (String(name || '').trim().charAt(0) || 'U').toUpperCase();
}

// ---------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------

const DATE_SHORT = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : DATE_SHORT.format(date);
}

function formatDateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : DATE_TIME.format(date);
}

// "just now / 5 minutes ago / yesterday" for lists where freshness matters
function timeAgo(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return 'הרגע';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes === 1 ? 'לפני דקה' : `לפני ${minutes} דקות`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return hours === 1 ? 'לפני שעה' : `לפני ${hours} שעות`;
    const days = Math.round(hours / 24);
    if (days === 1) return 'אתמול';
    if (days < 7) return `לפני ${days} ימים`;
    return formatDate(date);
}

// "Wednesday, 7 October 2026 · 26 Tishrei 5787" (the Hebrew date is skipped when the browser cannot make it)
function formatToday() {
    const now = new Date();
    const gregorian = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
    try {
        const hebrew = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).format(now);
        return `${gregorian} · ${hebrew}`;
    } catch (e) {
        return gregorian;
    }
}

function readingMinutes(html) {
    const text = String(html || '').replace(/<[^>]*>/g, ' ');
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
}

function stripHtmlTags(html) {
    // DOMParser never runs scripts or loads images, unlike assigning innerHTML to a detached element
    return new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent || '';
}

function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms === undefined ? 300 : ms);
    };
}

// ---------------------------------------------------------------------------------------------
// Weather (the server caches the answer for 15 minutes)
// ---------------------------------------------------------------------------------------------

const WEATHER_ICONS = {
    'bi-sun': 'sun',
    'bi-cloud-sun': 'cloud-sun',
    'bi-cloud': 'cloud',
    'bi-clouds': 'cloud',
    'bi-cloud-drizzle': 'cloud-drizzle',
    'bi-cloud-rain': 'cloud-rain',
    'bi-cloud-lightning-rain': 'cloud-lightning',
    'bi-snow': 'snowflake',
    'bi-cloud-fog': 'cloud-fog'
};

function weatherIconName(serverIcon) {
    return WEATHER_ICONS[serverIcon] || 'cloud-sun';
}

// Resolves with { city, temp, condition, windSpeed, icon, isSample }, or null when the weather cannot be had
async function loadWeather() {
    try {
        const data = await api('GET', '/api/weather');
        if (!data.data) return null;
        const w = data.data;
        return {
            city: w.city,
            temp: w.temp,
            condition: data.fallback ? 'נתוני דוגמה (שירות מזג האוויר אינו זמין)' : w.condition,
            windSpeed: w.windSpeed,
            icon: weatherIconName(w.icon),
            isSample: Boolean(data.fallback)
        };
    } catch (err) {
        return null;
    }
}

// Pictures that fail to load are swapped for this placeholder (ui.js listens for the error)
const FALLBACK_IMAGE = '/images/default-article.svg';
