// A small real-browser driver for the UI tests. It needs NO extra package: it starts Chrome / Edge / Chromium that is
// already installed (or the one named in CHROME_PATH) and talks to it with the Chrome DevTools Protocol over
// Node's built-in WebSocket. Everything the tests do (clicks, typing, key presses, screenshots) is a real browser event.
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const env = process.env;
const CANDIDATES = {
    win32: [
        `${env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
        `${env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
        `${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
        `${env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
        `${env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`
    ],
    darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ],
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge']
};

function findBrowser() {
    if (env.CHROME_PATH) return env.CHROME_PATH;
    return (CANDIDATES[process.platform] || []).find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

const KEYS = {
    Escape: { code: 'Escape', keyCode: 27 },
    Enter: { code: 'Enter', keyCode: 13, text: '\r' },
    Tab: { code: 'Tab', keyCode: 9 },
    ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
    ArrowRight: { code: 'ArrowRight', keyCode: 39 },
    End: { code: 'End', keyCode: 35 },
    Home: { code: 'Home', keyCode: 36 }
};

class Connection {
    constructor(socket) {
        this.socket = socket;
        this.lastId = 0;
        this.pending = new Map();
        this.listeners = new Set();
        socket.addEventListener('message', (event) => this.receive(JSON.parse(event.data)));
    }

    send(method, params, sessionId) {
        const id = ++this.lastId;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject, method });
            this.socket.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
        });
    }

    receive(message) {
        if (message.id) {
            const waiting = this.pending.get(message.id);
            if (!waiting) return;
            this.pending.delete(message.id);
            if (message.error) waiting.reject(new Error(`${waiting.method}: ${message.error.message}`));
            else waiting.resolve(message.result);
        } else {
            this.listeners.forEach((listener) => listener(message));
        }
    }
}

class Page {
    constructor(connection, sessionId, targetId) {
        this.connection = connection;
        this.sessionId = sessionId;
        this.targetId = targetId;
        this.origin = null;          // set by the tests: requests to other hosts are not the site's own
        this.errors = [];            // uncaught exceptions and console.error() output
        this.failures = [];          // own-site responses with an error status and requests that failed: { method, url, status, text }
        this.requests = [];          // every request: { url, method, status }
        this.dialogs = [];           // native alert/confirm/prompt dialogs (the site must not use them)
        this.inflight = new Set();
        this.waiters = [];
        this.urls = new Map();
        connection.listeners.add((message) => {
            if (message.sessionId === sessionId) this.onEvent(message.method, message.params);
        });
    }

    static async create(connection, browserContextId) {
        const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank', browserContextId });
        const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });
        const page = new Page(connection, sessionId, targetId);
        await Promise.all(['Page.enable', 'Runtime.enable', 'Network.enable'].map((method) => page.send(method)));
        return page;
    }

    send(method, params) {
        return this.connection.send(method, params, this.sessionId);
    }

    isOwn(url) {
        return !this.origin || url.startsWith(this.origin);
    }

    onEvent(method, params) {
        this.waiters = this.waiters.filter((waiter) => {
            if (waiter.method !== method) return true;
            waiter.resolve(params);
            return false;
        });

        switch (method) {
            case 'Runtime.exceptionThrown': {
                const details = params.exceptionDetails;
                this.errors.push({ kind: 'exception', text: (details.exception && details.exception.description) || details.text });
                break;
            }
            case 'Runtime.consoleAPICalled':
                if (params.type === 'error') {
                    this.errors.push({ kind: 'console.error', text: params.args.map((arg) => (arg.value !== undefined ? arg.value : arg.description)).join(' ') });
                }
                break;
            case 'Network.requestWillBeSent':
                this.urls.set(params.requestId, { url: params.request.url, method: params.request.method });
                if (this.isOwn(params.request.url) && params.type !== 'Image') this.inflight.add(params.requestId);
                break;
            case 'Network.responseReceived': {
                const request = this.urls.get(params.requestId) || { url: params.response.url, method: 'GET' };
                this.requests.push({ url: params.response.url, method: request.method, status: params.response.status });
                if (params.response.status >= 400 && this.isOwn(params.response.url)) {
                    this.failures.push({ method: request.method, url: params.response.url, status: params.response.status, text: `${request.method} ${params.response.url} -> ${params.response.status}` });
                }
                break;
            }
            case 'Page.frameNavigated':
                // a new document replaced the old one: requests of the old document will never report back
                if (!params.frame.parentId) this.inflight.clear();
                break;
            case 'Network.loadingFinished':
                this.inflight.delete(params.requestId);
                break;
            case 'Network.loadingFailed': {
                this.inflight.delete(params.requestId);
                const request = this.urls.get(params.requestId);
                if (request && this.isOwn(request.url) && !params.canceled) this.failures.push({ method: request.method, url: request.url, status: 0, text: `${request.method} ${request.url} failed: ${params.errorText}` });
                break;
            }
            case 'Page.javascriptDialogOpening':
                this.dialogs.push({ type: params.type, message: params.message });
                this.send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
                break;
            default:
        }
    }

    waitForEvent(method, timeout = 15000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`timed out waiting for ${method}`)), timeout);
            this.waiters.push({ method, resolve: (params) => { clearTimeout(timer); resolve(params); } });
        });
    }

    async setViewport(width, height) {
        const mobile = width < 600;
        await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
        await this.send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    }

    async goto(url) {
        const loaded = this.waitForEvent('Page.loadEventFired');
        await this.send('Page.navigate', { url });
        await loaded;
        await this.settle();
    }

    // Waits until the site's own requests have stopped for a moment (the pages fill themselves after loading)
    async settle(quiet = 250, timeout = 10000) {
        const started = Date.now();
        let quietSince = Date.now();
        while (Date.now() - started < timeout) {
            if (this.inflight.size > 0) quietSince = Date.now();
            else if (Date.now() - quietSince >= quiet) return;
            await sleep(40);
        }
    }

    async evaluate(expression) {
        const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) {
            throw new Error((result.exceptionDetails.exception && result.exceptionDetails.exception.description) || result.exceptionDetails.text);
        }
        return result.result.value;
    }

    // Runs a function in the page: page.run((a, b) => a + b, 1, 2)
    run(fn, ...args) {
        return this.evaluate(`(${fn.toString()})(...${JSON.stringify(args)})`);
    }

    async waitFor(fn, ...args) {
        const options = typeof args[args.length - 1] === 'object' && args[args.length - 1] && args[args.length - 1].timeout ? args.pop() : {};
        const timeout = options.timeout || 8000;
        const started = Date.now();
        let last;
        while (Date.now() - started < timeout) {
            try { last = await this.run(fn, ...args); } catch (err) { last = false; }
            if (last) return last;
            await sleep(60);
        }
        throw new Error(`timed out (${timeout} ms) waiting for: ${fn.toString().replace(/\s+/g, ' ').slice(0, 220)} ${JSON.stringify(args)}`);
    }

    async url() {
        return this.evaluate('location.pathname + location.search');
    }

    async waitForUrl(pattern, timeout = 8000) {
        await this.waitFor((source) => new RegExp(source).test(location.pathname + location.search), pattern.source || String(pattern), { timeout });
        await this.settle();
    }

    // Finds the point to click for a CSS selector (or an element picked by text) and checks that nothing covers it
    async pointOf(selector, text) {
        return this.run((sel, label) => {
            const candidates = [...document.querySelectorAll(sel)].filter((el) => {
                const rect = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
            });
            const el = label ? candidates.find((item) => item.textContent.replace(/\s+/g, ' ').includes(label)) : candidates[0];
            if (!el) return { missing: true, count: candidates.length };
            el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); // the page scrolls smoothly by default: do not wait for the animation
            const rect = el.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const top = document.elementFromPoint(x, y);
            const hit = top && (top === el || el.contains(top));
            return {
                x, y, hit,
                covering: hit ? null : (top ? `${top.tagName.toLowerCase()}${top.className ? '.' + String(top.className).split(' ')[0] : ''}` : 'nothing'),
                described: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} "${el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)}"`
            };
        }, selector, text || null);
    }

    async mouseClickAt(x, y) {
        await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }

    // A real mouse click in the middle of the element. Fails when the element is missing or covered by something else.
    async click(selector, text) {
        const point = await this.pointOf(selector, text);
        if (point.missing) throw new Error(`nothing visible matches ${selector}${text ? ` with text "${text}"` : ''}`);
        if (!point.hit) throw new Error(`${point.described} cannot be clicked: it is covered by ${point.covering}`);
        await this.mouseClickAt(point.x, point.y);
        await sleep(30);
        return point;
    }

    async press(key) {
        const info = KEYS[key];
        if (!info) throw new Error(`unknown key ${key}`);
        const base = { key, code: info.code, windowsVirtualKeyCode: info.keyCode, nativeVirtualKeyCode: info.keyCode };
        await this.send('Input.dispatchKeyEvent', { type: info.text ? 'keyDown' : 'rawKeyDown', ...base, text: info.text });
        await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    }

    async pressShiftTab() {
        const base = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, modifiers: 8 };
        await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
        await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    }

    // Focuses the field, replaces what is in it and types like a person would (real input events)
    async fill(selector, value) {
        const ok = await this.run((sel) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            el.scrollIntoView({ block: 'center', behavior: 'instant' });
            el.focus();
            if (el.select) el.select();
            return document.activeElement === el;
        }, selector);
        if (!ok) throw new Error(`cannot focus ${selector}`);
        if (value === '') {
            await this.run((sel) => {
                const el = document.querySelector(sel);
                el.value = '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }, selector);
        } else {
            await this.send('Input.insertText', { text: value });
        }
    }

    async screenshot(file, { fullPage = false } = {}) {
        const params = { format: 'png' };
        if (fullPage) {
            const size = await this.evaluate('({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })');
            params.captureBeyondViewport = true;
            params.clip = { x: 0, y: 0, width: size.width, height: Math.min(size.height, 6000), scale: 1 };
        }
        const { data } = await this.send('Page.captureScreenshot', params);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(data, 'base64'));
    }

    // Failures nobody planned for. An API answering "bad input" (400), "conflict" (409) or "too many" (429) is the server
    // doing its job when a form is sent empty; anything else (5xx, a missing file, a refused login) is a real problem.
    unexpectedFailures() {
        const expected = (failure) => [400, 409, 429].includes(failure.status) && failure.url.includes('/api/');
        return this.failures.filter((failure) => !expected(failure)).map((failure) => failure.text);
    }

    resetRecords() {
        this.errors = [];
        this.failures = [];
        this.dialogs = [];
        this.requests = [];
    }

    async close() {
        await this.connection.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {});
    }
}

class Browser {
    constructor(child, connection, profile) {
        this.child = child;
        this.connection = connection;
        this.profile = profile;
    }

    // A new private browsing session: its own storage, so tests never see each other's login
    async newContext() {
        const { browserContextId } = await this.connection.send('Target.createBrowserContext');
        return {
            id: browserContextId,
            newPage: () => Page.create(this.connection, browserContextId),
            close: () => this.connection.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {})
        };
    }

    async close() {
        try { await this.connection.send('Browser.close'); } catch (err) { /* already gone */ }
        await new Promise((resolve) => {
            const timer = setTimeout(() => { this.child.kill(); resolve(); }, 3000);
            this.child.once('exit', () => { clearTimeout(timer); resolve(); });
        });
        fs.rmSync(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
}

async function launch() {
    const executable = findBrowser();
    if (!executable) return null;

    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-web-ui-'));
    const child = spawn(executable, [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-component-update',
        '--mute-audio',
        'about:blank'
    ], { stdio: 'ignore' });

    // Chrome writes the port it picked into this file
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await sleep(100);
    if (!fs.existsSync(portFile)) {
        child.kill();
        throw new Error(`${executable} did not start a DevTools port`);
    }
    const [port, socketPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');

    const socket = new WebSocket(`ws://127.0.0.1:${port}${socketPath}`);
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', () => reject(new Error('could not connect to the browser')), { once: true });
    });
    return new Browser(child, new Connection(socket), profile);
}

module.exports = { launch, findBrowser, sleep };
