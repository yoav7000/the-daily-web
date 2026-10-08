// UI toolkit shared by every page: button actions, dialogs, toasts, menus, tabs.
// Needs icons.js and common.js. Markup stays free of inline handlers:
//   <button data-action="save-article">  +  UI.on('save-article', (button, event) => { ... })
// A data-action without a registered handler is reported in the console, so a dead button is never silent.

window.UI = (function () {
    const actions = {};
    const modalStack = [];
    let dialogCounter = 0;

    // ------------------------------------------------------------------------------------------
    // Actions
    // ------------------------------------------------------------------------------------------

    function on(name, handler) {
        actions[name] = handler;
    }

    function reportFailure(err) {
        // errors that came from the server already carry a clear message for the user
        if (!err || !err.status) console.error(err);
        toast((err && err.message) || 'אירעה שגיאה. נסו שוב.', 'error');
    }

    function run(handler, el, event) {
        try {
            const result = handler(el, event);
            if (result && typeof result.then === 'function') result.catch(reportFailure);
        } catch (err) {
            reportFailure(err);
        }
    }

    document.addEventListener('click', (event) => {
        const el = event.target.closest('[data-action]');
        if (!el) return;
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
        const name = el.dataset.action;
        const handler = actions[name];
        if (!handler) {
            console.error(`No handler for data-action="${name}"`);
            return;
        }
        if (el.tagName === 'A') event.preventDefault();
        run(handler, el, event);
    });

    // ------------------------------------------------------------------------------------------
    // Dialogs
    // ------------------------------------------------------------------------------------------

    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function focusables(root) {
        return [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.hidden && el.getClientRects().length > 0);
    }

    function resolveEl(target) {
        return typeof target === 'string' ? document.getElementById(target) : target;
    }

    function openModal(target) {
        const el = resolveEl(target);
        if (!el || !el.hidden) return el;
        modalStack.push({ el, opener: document.activeElement });
        el.hidden = false;
        document.body.classList.add('is-locked');
        requestAnimationFrame(() => {
            const first = el.querySelector('[data-autofocus]') || focusables(el.querySelector('.modal-body') || el)[0] || focusables(el)[0];
            if (first) first.focus({ preventScroll: true });
        });
        el.dispatchEvent(new CustomEvent('modal:open', { bubbles: true }));
        return el;
    }

    function closeModal(target, reason) {
        const el = resolveEl(target);
        const index = modalStack.findIndex((entry) => entry.el === el);
        if (index === -1) return;
        const [entry] = modalStack.splice(index, 1);
        el.hidden = true;
        if (modalStack.length === 0) document.body.classList.remove('is-locked');
        if (entry.opener && entry.opener.isConnected && typeof entry.opener.focus === 'function') {
            entry.opener.focus({ preventScroll: true });
        }
        el.dispatchEvent(new CustomEvent('modal:close', { bubbles: true, detail: { reason: reason || 'close' } }));
    }

    function topModal() {
        return modalStack.length ? modalStack[modalStack.length - 1].el : null;
    }

    on('close-modal', (el) => {
        const modal = el.closest('.modal');
        if (modal) closeModal(modal, 'button');
    });

    // a click on the dim backdrop closes the dialog (unless it is marked data-backdrop="static")
    document.addEventListener('mousedown', (event) => {
        const modal = event.target;
        if (modal.classList && modal.classList.contains('modal') && modal.dataset.backdrop !== 'static') {
            closeModal(modal, 'backdrop');
        }
    });

    /**
     * A yes/no question in our own dialog (instead of the browser's confirm()).
     * Resolves with true only when the person pressed the confirm button.
     */
    function confirmDialog(options) {
        const o = Object.assign({ title: 'האם להמשיך?', message: '', confirmText: 'אישור', cancelText: 'ביטול', danger: false }, options);
        return new Promise((resolve) => {
            dialogCounter += 1;
            const id = `dialog-${dialogCounter}`;
            const el = document.createElement('div');
            el.className = 'modal';
            el.hidden = true;
            el.setAttribute('role', 'alertdialog');
            el.setAttribute('aria-modal', 'true');
            el.setAttribute('aria-labelledby', `${id}-title`);
            el.setAttribute('aria-describedby', `${id}-text`);
            el.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-body">
                        <div class="flex gap-4">
                            <span class="dialog-icon ${o.danger ? 'is-danger' : ''}">${icon(o.danger ? 'triangle-alert' : 'circle-alert')}</span>
                            <div class="grow">
                                <h2 class="modal-title" id="${id}-title"></h2>
                                <p class="muted mt-2" id="${id}-text" style="white-space: pre-line"></p>
                            </div>
                        </div>
                    </div>
                    <div class="modal-foot">
                        <button type="button" class="btn btn-secondary" data-confirm="no"></button>
                        <button type="button" class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" data-confirm="yes"></button>
                    </div>
                </div>`;
            el.querySelector('.modal-title').textContent = o.title;
            el.querySelector(`#${id}-text`).textContent = o.message;
            const cancel = el.querySelector('[data-confirm="no"]');
            const accept = el.querySelector('[data-confirm="yes"]');
            cancel.textContent = o.cancelText;
            accept.textContent = o.confirmText;
            // a destructive question starts on "cancel", so a stray Enter never deletes anything
            (o.danger ? cancel : accept).setAttribute('data-autofocus', '');
            document.body.appendChild(el);

            let settled = false;
            const finish = (value) => {
                if (settled) return;
                settled = true;
                closeModal(el, 'confirm');
                setTimeout(() => el.remove(), 0);
                resolve(value);
            };
            el.addEventListener('click', (event) => {
                const button = event.target.closest('[data-confirm]');
                if (button) finish(button.dataset.confirm === 'yes');
            });
            el.addEventListener('modal:close', () => finish(false));
            openModal(el);
        });
    }

    // ------------------------------------------------------------------------------------------
    // Toasts
    // ------------------------------------------------------------------------------------------

    const TOAST_ICONS = { success: 'circle-check', error: 'triangle-alert', info: 'info' };

    function toast(message, type) {
        const kind = TOAST_ICONS[type] ? type : 'success';
        let host = document.getElementById('toasts');
        if (!host) {
            host = document.createElement('div');
            host.id = 'toasts';
            host.className = 'toasts';
            host.setAttribute('aria-live', 'polite');
            document.body.appendChild(host);
        }
        const el = document.createElement('div');
        el.className = `toast toast-${kind}`;
        el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
        el.innerHTML = `${icon(TOAST_ICONS[kind])}<div class="toast-text"></div><button type="button" class="toast-close" aria-label="סגירת ההודעה">${icon('x')}</button>`;
        el.querySelector('.toast-text').textContent = message;
        host.appendChild(el);
        while (host.children.length > 4) host.firstElementChild.remove();

        let timer = null;
        const dismiss = () => {
            clearTimeout(timer);
            el.classList.add('is-leaving');
            setTimeout(() => el.remove(), 200);
        };
        el.querySelector('.toast-close').addEventListener('click', dismiss);
        timer = setTimeout(dismiss, kind === 'error' ? 7000 : 4200);
        return el;
    }

    // ------------------------------------------------------------------------------------------
    // Menus (the account menu, ...)
    // ------------------------------------------------------------------------------------------

    function closeMenus(except) {
        document.querySelectorAll('.menu:not([hidden])').forEach((menu) => {
            if (menu === except) return;
            menu.hidden = true;
            const trigger = document.querySelector(`[data-menu="${menu.id}"]`);
            if (trigger) trigger.setAttribute('aria-expanded', 'false');
        });
    }

    on('toggle-menu', (trigger) => {
        const menu = document.getElementById(trigger.dataset.menu);
        if (!menu) return;
        closeMenus(menu);
        menu.hidden = !menu.hidden;
        trigger.setAttribute('aria-expanded', String(!menu.hidden));
        if (!menu.hidden) {
            const first = menu.querySelector('.menu-item');
            if (first) first.focus({ preventScroll: true });
        }
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.dropdown')) closeMenus();
        else if (event.target.closest('.menu-item')) closeMenus();
    });

    // ------------------------------------------------------------------------------------------
    // Keyboard
    // ------------------------------------------------------------------------------------------

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (document.querySelector('.menu:not([hidden])')) {
                const openMenu = document.querySelector('.menu:not([hidden])');
                const trigger = document.querySelector(`[data-menu="${openMenu.id}"]`);
                closeMenus();
                if (trigger) trigger.focus();
                return;
            }
            const modal = topModal();
            if (modal && modal.dataset.esc !== 'off') {
                closeModal(modal, 'escape');
                return;
            }
            if (document.body.classList.contains('nav-open')) {
                document.body.classList.remove('nav-open');
            }
            return;
        }

        if (event.key === 'Tab' && modalStack.length) {
            const modal = topModal();
            const items = focusables(modal);
            if (items.length === 0) {
                event.preventDefault();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            const inside = modal.contains(document.activeElement);
            if (event.shiftKey && (!inside || document.activeElement === first)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
                event.preventDefault();
                first.focus();
            }
            return;
        }

        // "/" jumps to the search box of the page, like on most large sites
        if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && modalStack.length === 0) {
            const tag = (document.activeElement && document.activeElement.tagName) || '';
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (document.activeElement && document.activeElement.isContentEditable)) return;
            const search = [...document.querySelectorAll('[data-search-input]')].find((el) => el.getClientRects().length > 0);
            if (search) {
                event.preventDefault();
                search.focus();
                search.select();
            }
        }
    });

    // ------------------------------------------------------------------------------------------
    // Tabs
    // ------------------------------------------------------------------------------------------

    /**
     * Tabs made of role="tab" buttons (aria-controls = the id of the panel). Panels are hidden/shown for you.
     * onChange(panelId) runs after a tab was selected.
     */
    function tabs(root, onChange) {
        const list = [...root.querySelectorAll('[role="tab"]')];

        function select(tab, moveFocus) {
            list.forEach((item) => {
                const selected = item === tab;
                item.setAttribute('aria-selected', String(selected));
                item.tabIndex = selected ? 0 : -1;
                const panel = document.getElementById(item.getAttribute('aria-controls'));
                if (panel) panel.hidden = !selected;
            });
            if (moveFocus) tab.focus();
            if (onChange) onChange(tab.getAttribute('aria-controls'), tab);
        }

        root.addEventListener('click', (event) => {
            const tab = event.target.closest('[role="tab"]');
            if (tab && list.includes(tab)) select(tab, false);
        });

        root.addEventListener('keydown', (event) => {
            const index = list.indexOf(document.activeElement);
            if (index === -1) return;
            const rtl = document.documentElement.dir === 'rtl';
            let next = null;
            if (event.key === 'ArrowRight') next = index + (rtl ? -1 : 1);
            else if (event.key === 'ArrowLeft') next = index + (rtl ? 1 : -1);
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = list.length - 1;
            if (next === null) return;
            event.preventDefault();
            select(list[(next + list.length) % list.length], true);
        });

        const initial = list.find((item) => item.getAttribute('aria-selected') === 'true') || list[0];
        select(initial, false);
        return { select: (id) => { const tab = list.find((item) => item.getAttribute('aria-controls') === id); if (tab) select(tab, false); } };
    }

    // ------------------------------------------------------------------------------------------
    // Small helpers
    // ------------------------------------------------------------------------------------------

    // Shows a spinner on a button and blocks double clicks while its request runs
    function busy(button, isBusy) {
        if (!button) return;
        // a disabled button loses the keyboard focus: give it back when the button works again
        if (isBusy) button.dataset.hadFocus = document.activeElement === button ? '1' : '';
        button.classList.toggle('is-loading', isBusy);
        button.disabled = isBusy;
        if (isBusy) {
            button.setAttribute('aria-busy', 'true');
        } else {
            button.removeAttribute('aria-busy');
            if (button.dataset.hadFocus && button.isConnected) button.focus({ preventScroll: true });
            button.dataset.hadFocus = '';
        }
    }

    // Markup for an empty list / an error: { icon, title, text, action: { name, label } }
    function stateHtml(options) {
        const o = options || {};
        return `<div class="state">${icon(o.icon || 'inbox')}<h3>${escapeHtml(o.title || '')}</h3>${o.text ? `<p>${escapeHtml(o.text)}</p>` : ''}${
            o.action ? `<button type="button" class="btn btn-secondary btn-sm" data-action="${escapeHtml(o.action.name)}">${escapeHtml(o.action.label)}</button>` : ''}</div>`;
    }

    // A table row that holds one message across all columns (loading, empty, error)
    function stateRow(columns, html) {
        return `<tr><td class="cell-state" colspan="${columns}">${html}</td></tr>`;
    }

    function loadingHtml(text) {
        return `<div class="state"><span class="spinner"></span><p>${escapeHtml(text || 'טוען...')}</p></div>`;
    }

    // Shows or hides an inline message (form errors) – message '' hides it
    function setMessage(el, message) {
        if (!el) return;
        el.textContent = message || '';
        el.hidden = !message;
    }

    // Pictures that fail to load are swapped for the site's placeholder (once, so it can never loop)
    document.addEventListener('error', (event) => {
        const img = event.target;
        if (img && img.tagName === 'IMG' && !img.dataset.fallbackApplied) {
            img.dataset.fallbackApplied = '1';
            img.src = FALLBACK_IMAGE;
        }
    }, true);

    on('toggle-theme', () => window.toggleTheme());

    return { on, openModal, closeModal, confirm: confirmDialog, toast, tabs, busy, stateHtml, stateRow, loadingHtml, setMessage, closeMenus };
})();
