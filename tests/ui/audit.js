// Checks that run INSIDE the page (they are sent to the browser as source text, so each function must stand alone).
// Every function returns a list of problems in plain words; an empty list means the page is fine.
'use strict';

/**
 * Is anything cut off, sticking out of the screen, or broken?
 *  - the page must not scroll sideways
 *  - no visible element may stick out of the window (unless it lives in a scroller made for that, like the section bar)
 *  - text must not be cut off (a deliberate "..." or a line clamp is fine)
 *  - pictures must have loaded
 */
function layoutAudit() {
    const problems = [];
    const viewportWidth = document.documentElement.clientWidth;
    const describe = (el) => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30);
        const cls = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : '';
        return `<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}>${text ? ` "${text}"` : ''}`;
    };
    const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const insideScroller = (el) => {
        for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            if (/(auto|scroll|hidden|clip)/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth) return true;
        }
        return false;
    };
    const inClosedDrawer = (el) => Boolean(el.closest('.sidebar')) && !document.body.classList.contains('nav-open') && viewportWidth < 1024;

    if (document.documentElement.scrollWidth > viewportWidth + 1) {
        problems.push(`the page scrolls sideways (content is ${document.documentElement.scrollWidth}px wide, the window ${viewportWidth}px)`);
    }

    document.querySelectorAll('body *').forEach((el) => {
        if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') return;
        if (!visible(el) || inClosedDrawer(el) || el.closest('.sr-only')) return; // (.sr-only text is hidden from the eye on purpose)
        const rect = el.getBoundingClientRect();

        if ((rect.right > viewportWidth + 1 || rect.left < -1) && !insideScroller(el) && !el.closest('.toasts')) {
            problems.push(`sticks out of the screen: ${describe(el)} spans ${Math.round(rect.left)}..${Math.round(rect.right)} in a ${viewportWidth}px window`);
        }

        const style = getComputedStyle(el);
        const clamps = style.webkitLineClamp && style.webkitLineClamp !== 'none';
        const ellipsis = style.textOverflow === 'ellipsis';
        if (!ellipsis && !clamps && /(hidden|clip)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1 && el.children.length === 0 && el.textContent.trim()) {
            problems.push(`text is cut off horizontally: ${describe(el)}`);
        }
        if (!clamps && /(hidden|clip)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 2 && el.children.length === 0 && el.textContent.trim() && !el.closest('canvas')) {
            problems.push(`text is cut off vertically: ${describe(el)}`);
        }
    });

    document.querySelectorAll('img').forEach((img) => {
        if (visible(img) && img.complete && img.naturalWidth === 0) problems.push(`picture did not load: ${img.getAttribute('src')}`);
    });
    return problems;
}

/**
 * Can every visible control actually be clicked? The element in the middle of each button/link/field must be that
 * element itself (not something lying on top of it), and it must be big enough for a finger.
 */
function clickAudit(limitPerKind) {
    const problems = [];
    const describe = (el) => {
        const text = (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30);
        return `<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.dataset && el.dataset.action ? ' data-action=' + el.dataset.action : ''}> "${text}"`;
    };
    const kinds = new Map();
    const selector = 'a[href], button, [data-action], [role="tab"], input:not([type="hidden"]), select, textarea, summary';
    const touch = window.matchMedia('(pointer: coarse)').matches || document.documentElement.clientWidth < 600;

    document.querySelectorAll(selector).forEach((el) => {
        if (el.disabled || el.closest('[hidden], [inert]') || el.classList.contains('skip-link') || el.closest('.sr-only')) return;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none' || style.opacity === '0') {
            if (!el.matches('.segmented input')) return; // (the real radio buttons of a segmented control are see-through on purpose)
        }
        const isSegmentedInput = el.matches('.segmented input');
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (el.closest('.sidebar') && !document.body.classList.contains('nav-open') && document.documentElement.clientWidth < 1024) return;

        // lists repeat the same buttons; looking at a few of each kind is enough
        const kind = `${el.tagName}|${el.dataset.action || ''}|${(el.textContent || '').trim().slice(0, 12)}|${el.getAttribute('aria-label') || ''}`;
        const seen = kinds.get(kind) || 0;
        if (seen >= (limitPerKind || 3)) return;
        kinds.set(kind, seen + 1);

        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        const box = el.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return; // could not be scrolled into view: a scroller handles it
        const top = document.elementFromPoint(x, y);
        const label = el.closest('label');
        const reachable = top && (top === el || el.contains(top) || (isSegmentedInput && label && label.contains(top)) || (label && label.contains(top) && el.matches('input')));
        if (!reachable) {
            const cover = top ? `<${top.tagName.toLowerCase()}${top.className && typeof top.className === 'string' ? '.' + top.className.split(' ')[0] : ''}>` : 'nothing';
            problems.push(`${describe(el)} is covered by ${cover}, a click would not reach it`);
        }

        // WCAG 2.2: a target should be at least 24x24px. Fields inside a text block (inline links) are exempt.
        const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
        if (!inline && !isSegmentedInput && (box.width < 24 || box.height < 24) && !el.matches('input[type="checkbox"], input[type="radio"]')) {
            problems.push(`${describe(el)} is only ${Math.round(box.width)}x${Math.round(box.height)}px, too small to press`);
        }
        if (touch && !inline && !isSegmentedInput && box.height < 32 && !el.matches('input[type="checkbox"], input[type="radio"]')) {
            problems.push(`${describe(el)} is only ${Math.round(box.height)}px high on a touch screen`);
        }
    });
    window.scrollTo(0, 0);
    return problems;
}

/** Can a screen reader or keyboard user tell what each control is? */
function accessibilityAudit() {
    const problems = [];
    const describe = (el) => `<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}> "${(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 25)}"`;
    const hasName = (el) => {
        if (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('aria-labelledby')) return true;
        if ((el.textContent || '').replace(/\s+/g, '').length > 0) return true;
        return Boolean(el.querySelector('img[alt]:not([alt=""])'));
    };
    const visible = (el) => !el.closest('[hidden]') && getComputedStyle(el).display !== 'none';

    document.querySelectorAll('button, a[href], [role="tab"]').forEach((el) => {
        if (visible(el) && !hasName(el)) problems.push(`${describe(el)} has no accessible name (no text, aria-label or title)`);
    });
    document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach((el) => {
        if (!visible(el)) return;
        const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') ||
            (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label');
        if (!labelled) problems.push(`${describe(el)} (${el.type || el.tagName.toLowerCase()}) has no label`);
    });
    document.querySelectorAll('img').forEach((img) => {
        if (!img.hasAttribute('alt')) problems.push(`picture without an alt attribute: ${img.getAttribute('src')}`);
    });
    const h1s = [...document.querySelectorAll('h1')].filter(visible);
    if (h1s.length !== 1) problems.push(`the page should have exactly one main heading (h1), found ${h1s.length}`);
    if (!document.querySelector('main')) problems.push('the page has no <main> landmark');
    document.querySelectorAll('[id]').forEach((el) => {
        if (document.querySelectorAll(`[id="${CSS.escape(el.id)}"]`).length > 1) problems.push(`duplicate id "${el.id}"`);
    });
    return [...new Set(problems)];
}

/**
 * Is an open dialog or menu fully on screen, with its buttons reachable?
 * Returns { open: 'dialog' | 'menu' | 'drawer' | null, problems: [...] }
 */
function overlayAudit() {
    const problems = [];
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const modals = [...document.querySelectorAll('.modal:not([hidden])')];
    const menu = document.querySelector('.menu:not([hidden])');
    const drawerOpen = document.body.classList.contains('nav-open');
    const inside = (rect, what) => {
        if (rect.left < -1 || rect.right > vw + 1 || rect.top < -1 || rect.bottom > vh + 1) {
            problems.push(`${what} does not fit the screen (${Math.round(rect.left)},${Math.round(rect.top)} to ${Math.round(rect.right)},${Math.round(rect.bottom)} in ${vw}x${vh})`);
        }
    };

    modals.forEach((modal) => {
        const dialog = modal.querySelector('.modal-dialog');
        inside(dialog.getBoundingClientRect(), `dialog "${(modal.querySelector('.modal-title') || modal).textContent.trim().slice(0, 30)}"`);
        const body = modal.querySelector('.modal-body');
        const foot = modal.querySelector('.modal-foot');
        if (body && body.scrollWidth > body.clientWidth + 1) problems.push('the dialog content is wider than the dialog');
        if (foot) {
            const footRect = foot.getBoundingClientRect();
            if (footRect.bottom > vh + 1) problems.push('the dialog buttons are pushed below the screen');
        }
        const focus = document.activeElement;
        if (!modal.contains(focus) && modal === modals[modals.length - 1]) problems.push('keyboard focus is outside the open dialog');
    });
    if (menu) inside(menu.getBoundingClientRect(), 'the account menu');
    if (drawerOpen) {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) inside(sidebar.getBoundingClientRect(), 'the menu drawer');
    }
    return { open: modals.length ? 'dialog' : menu ? 'menu' : drawerOpen ? 'drawer' : null, problems };
}

/**
 * Picks the next control nobody pressed yet, marks it with data-crawl-target and reports it.
 * `done` maps a "kind" of control to how many times it was pressed already. Lists repeat the same buttons in every row,
 * so a kind ignores the row's own text and ids: one "delete" button of a table is as good as the others.
 * Tabs and "close" buttons come last: pressing them hides the controls of the other tabs / the dialog.
 */
function pickNextControl(done, perKind) {
    document.querySelectorAll('[data-crawl-target]').forEach((el) => el.removeAttribute('data-crawl-target'));
    const topModal = [...document.querySelectorAll('.modal:not([hidden])')].pop();
    const scope = topModal || document;
    const selector = 'a[href], button, [data-action], [role="tab"], summary';
    const inRow = (el) => Boolean(el.closest('tr, .work-card, .story, .mini, .comment, li'));
    const skip = (el) => {
        if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[hidden], [inert]')) return true;
        if (el.classList.contains('skip-link')) return true;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none' || rect.width === 0 || rect.height === 0) return true;
        if (el.closest('.sidebar') && !document.body.classList.contains('nav-open') && document.documentElement.clientWidth < 1024) return true;
        if (!topModal && el.closest('.modal')) return true;
        if (el.dataset.action === 'logout') return true;     // logging out is tested on its own
        if (el.tagName === 'A') {
            const href = el.getAttribute('href') || '';
            if (!href.startsWith('#') && !el.dataset.action) return true; // links that leave the page are clicked in their own step
        }
        return false;
    };
    const kindOf = (el) => {
        const data = Object.keys(el.dataset).filter((key) => !['id', 'crawlTarget', 'page'].includes(key)).sort().map((key) => key + '=' + el.dataset[key]).join(',');
        const text = inRow(el) ? '' : (el.textContent || '').replace(/s+/g, ' ').trim().slice(0, 25) || el.getAttribute('aria-label') || '';
        return `${el.tagName}|${data}|${el.getAttribute('href') || ''}|${text}|${el.id}`;
    };
    let candidates = [...scope.querySelectorAll(selector)].filter((el) => !skip(el));
    // a yes/no question (delete? publish?) is only ever answered "no" here: the crawler must not destroy its own test data
    if (topModal && topModal.getAttribute('role') === 'alertdialog') candidates = candidates.filter((el) => el.matches('[data-confirm="no"]'));
    // buttons that close something come last, so that everything else in the dialog / on the page gets pressed first
    const last = (el) => (el.matches('[role="tab"], [data-action="close-modal"], [data-confirm="no"]') ? 1 : 0);
    candidates.sort((x, y) => last(x) - last(y));
    for (const el of candidates) {
        const kind = kindOf(el);
        if ((done[kind] || 0) >= perKind) continue;
        el.setAttribute('data-crawl-target', '1');
        return { kind, description: `<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.dataset.action ? ' data-action=' + el.dataset.action : ''}> "${(el.textContent || el.getAttribute('aria-label') || '').replace(/s+/g, ' ').trim().slice(0, 30)}"`, inModal: Boolean(topModal) };
    }
    return null;
}

/** The text fields, drop-downs and radio buttons of the page (outside dialogs), each marked so the crawler can use it */
function listFields() {
    const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && !el.disabled && !el.closest('[hidden], .modal, .sidebar');
    };
    const fields = [];
    document.querySelectorAll('main input[type="search"], main input[type="text"], main select, main .segmented input[type="radio"]').forEach((el, index) => {
        if (el.matches('.segmented input') ? !el.closest('label').getClientRects().length : !visible(el)) return;
        el.setAttribute('data-crawl-field', String(index));
        const kind = el.tagName === 'SELECT' ? 'select' : el.type === 'radio' ? 'radio' : 'text';
        fields.push({ index, kind, name: el.id || el.name || el.getAttribute('aria-label') || kind, options: kind === 'select' ? [...el.options].map((option) => option.value) : [] });
    });
    return fields;
}

/** Marks the first visible link that leads to `href` (so a real mouse click can press it) */
function markLink(href) {
    document.querySelectorAll('[data-crawl-link]').forEach((el) => el.removeAttribute('data-crawl-link'));
    for (const a of document.querySelectorAll('a[href]')) {
        if ((a.getAttribute('href') || '').startsWith('#') || a.target === '_blank') continue;
        const url = new URL(a.getAttribute('href'), location.href);
        if (url.pathname + url.search !== href || a.dataset.action) continue;
        const rect = a.getBoundingClientRect();
        const style = getComputedStyle(a);
        if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || a.closest('[hidden]')) continue;
        a.setAttribute('data-crawl-link', '1');
        return true;
    }
    return false;
}

/** Same-origin links of the page (with the text that names them), so the crawler can load each one */
function listLinks() {
    const links = new Map();
    document.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || a.dataset.action) return;
        const url = new URL(href, location.href);
        if (url.origin !== location.origin) return;
        links.set(url.pathname + url.search, (a.textContent || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30));
    });
    return [...links.entries()];
}

module.exports = { layoutAudit, clickAudit, accessibilityAudit, overlayAudit, pickNextControl, listFields, markLink, listLinks };
