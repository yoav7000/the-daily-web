const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { connectTestDb, disconnectTestDb, createReporter } = require('./helpers/testEnv');

const Session = { countDocuments: () => mongoose.connection.collection('sessions').countDocuments() };

let server;
let baseUrl;

const startApp = () => new Promise((resolve) => {
    // fresh copies of the app and session handler, like a server restart
    Object.keys(require.cache)
        .filter((file) => /src\/(app|config\/session)\.js$/.test(file.replaceAll('\\', '/')))
        .forEach((file) => delete require.cache[file]);
    const app = require('../src/app');
    server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}`;
        resolve();
    });
});

const stopApp = () => new Promise((resolve) => server.close(resolve));

const request = (method, path, body = null, headers = {}) => new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request({
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: { 'Content-Type': 'application/json', ...headers }
    }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
            let parsed = data;
            try { parsed = JSON.parse(data); } catch (e) { /* not json */ }
            resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
});

test.before(async () => {
    await connectTestDb();
    await startApp();
});

test.after(async () => {
    await stopApp();
    await disconnectTestDb();
});

test('Session login, restart persistence and logout', async (t) => {
    let cookie;

    await t.test('login opens a session cookie', async () => {
        await createReporter('sessionuser', 'Session User');
        const res = await request('POST', '/api/auth/login', { username: 'sessionuser', password: 'password123' });
        assert.equal(res.status, 200);
        assert.equal(res.body.user.role, 'reporter');
        cookie = res.headers['set-cookie'][0].split(';')[0];
        assert.ok(cookie.startsWith('daily.sid='));
    });

    await t.test('/me knows the user from the cookie alone', async () => {
        const res = await request('GET', '/api/auth/me', null, { Cookie: cookie });
        assert.equal(res.status, 200);
        assert.equal(res.body.user.username, 'sessionuser');
    });

    await t.test('session survives a server restart', async () => {
        await stopApp();
        await startApp();
        const res = await request('GET', '/api/auth/me', null, { Cookie: cookie });
        assert.equal(res.status, 200);
        assert.equal(res.body.user.role, 'reporter');
    });

    await t.test('logout kills the session: the old cookie no longer works anywhere', async () => {
        const sessionsBefore = await Session.countDocuments();
        const out = await request('POST', '/api/auth/logout', null, { Cookie: cookie });
        assert.equal(out.status, 200);
        assert.equal(await Session.countDocuments(), sessionsBefore - 1, 'the session document is deleted from MongoDB');

        const me = await request('GET', '/api/auth/me', null, { Cookie: cookie });
        assert.equal(me.body.user, null);
        const reused = await request('GET', '/api/articles/my-articles', null, { Cookie: cookie });
        assert.equal(reused.status, 401, 'a copy of the cookie taken before logout is refused');
    });
});

test('Unauthenticated users are rejected from protected routes', async () => {
    assert.equal((await request('GET', '/api/articles/my-articles')).status, 401);
    // asking "who am I?" is not an error for a guest
    const me = await request('GET', '/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user, null);
});

test('Weather endpoint is cached for 15 minutes', async () => {
    delete process.env.OPENWEATHER_API_KEY;
    const first = await request('GET', '/api/weather');
    const second = await request('GET', '/api/weather');
    assert.equal(first.status, 200);
    assert.equal(second.body.cached, true);
    assert.equal(second.body.data.updatedAt, first.body.data.updatedAt);
});
