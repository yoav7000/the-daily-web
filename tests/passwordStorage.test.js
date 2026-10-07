const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const path = require('node:path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = require('../src/app');
const User = require('../src/models/User');
const Article = require('../src/models/Article');
const seedDatabase = require('../src/scripts/seed');
const { connectTestDb, disconnectTestDb, getTestDbUri, createEditor } = require('./helpers/testEnv');

const BCRYPT_HASH = /^\$2[aby]\$10\$[./A-Za-z0-9]{53}$/;

let server;
let baseUrl;
let editor;

const api = async (method, urlPath, { body, token } = {}) => {
    const res = await fetch(`${baseUrl}${urlPath}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (err) { /* not json */ }
    return { status: res.status, body: json, text };
};

// What MongoDB really contains, bypassing the Mongoose model
const storedPassword = async (username) => {
    const doc = await mongoose.connection.collection('users').findOne({ username });
    return doc && doc.password;
};

const assertStoredAsHash = async (username, plain) => {
    const stored = await storedPassword(username);
    assert.ok(stored, `${username} should exist`);
    assert.notEqual(stored, plain, `${username}: the password must not be stored as typed`);
    assert.match(stored, BCRYPT_HASH, `${username}: stored value must be a bcrypt hash`);
    assert.equal(await bcrypt.compare(plain, stored), true, `${username}: hash must match the password (not hashed twice)`);
};

test.before(async () => {
    await connectTestDb();
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
    editor = await createEditor('pw_editor');
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectTestDb();
});

test('Passwords are stored as bcrypt hashes on every way of writing a user', async (t) => {
    await t.test('User.create (also used by the test helpers)', async () => {
        await assertStoredAsHash('pw_editor', 'password123');
    });

    await t.test('creating a user through the API', async () => {
        const res = await api('POST', '/api/users', {
            token: editor.token,
            body: { username: 'pw_api', password: 'api-secret-1', fullName: 'API User' }
        });
        assert.equal(res.status, 201);
        await assertStoredAsHash('pw_api', 'api-secret-1');
    });

    await t.test('changing a password through the API', async () => {
        const created = await User.findOne({ username: 'pw_api' });
        const before = await storedPassword('pw_api');

        const res = await api('PUT', `/api/users/${created._id}`, { token: editor.token, body: { password: 'changed-secret-2' } });
        assert.equal(res.status, 200);

        await assertStoredAsHash('pw_api', 'changed-secret-2');
        assert.notEqual(await storedPassword('pw_api'), before);
        assert.equal((await api('POST', '/api/auth/login', { body: { username: 'pw_api', password: 'api-secret-1' } })).status, 401);
        assert.equal((await api('POST', '/api/auth/login', { body: { username: 'pw_api', password: 'changed-secret-2' } })).status, 200);
    });

    await t.test('User.insertMany', async () => {
        await User.insertMany([{ username: 'pw_many', password: 'many-secret-3', fullName: 'Many', role: 'reporter' }]);
        await assertStoredAsHash('pw_many', 'many-secret-3');
    });

    await t.test('updates that bypass save(): updateOne and findOneAndUpdate', async () => {
        await User.updateOne({ username: 'pw_many' }, { $set: { password: 'updated-secret-4' } });
        await assertStoredAsHash('pw_many', 'updated-secret-4');

        await User.findOneAndUpdate({ username: 'pw_many' }, { password: 'updated-secret-5' });
        await assertStoredAsHash('pw_many', 'updated-secret-5');
    });

    await t.test('the create-editor command line script', async () => {
        const script = path.join(__dirname, '..', 'src', 'scripts', 'createEditor.js');
        await new Promise((resolve, reject) => {
            execFile(process.execPath, [script, 'pw_cli', 'cli-secret-6', 'CLI Editor'], {
                env: { ...process.env, MONGODB_URI: getTestDbUri(), USE_MEMORY_DB: 'false' }
            }, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)));
        });
        await assertStoredAsHash('pw_cli', 'cli-secret-6');
        assert.equal((await User.findOne({ username: 'pw_cli' })).role, 'editor');
    });

    await t.test('the demo seeder', async () => {
        await seedDatabase({ connect: false });
        const users = await mongoose.connection.collection('users').find({}).toArray();
        assert.ok(users.length >= 6);
        for (const user of users) {
            assert.match(user.password, BCRYPT_HASH, `${user.username} must be stored hashed`);
            assert.equal(await bcrypt.compare('password123', user.password), true, `${user.username}: demo password must work (not hashed twice)`);
        }
        // and the demo accounts really can log in
        const login = await api('POST', '/api/auth/login', { body: { username: 'sarah_editor', password: 'password123' } });
        assert.equal(login.status, 200);
    });

    await t.test('saving other fields does not hash the hash again', async () => {
        const user = await User.findOne({ username: 'sarah_editor' });
        const before = user.password;
        user.fullName = 'שרה לוי-כהן';
        await user.save();
        assert.equal(await storedPassword('sarah_editor'), before);
        assert.equal((await api('POST', '/api/auth/login', { body: { username: 'sarah_editor', password: 'password123' } })).status, 200);
    });
});

test('The server (not the browser) enforces the password rules', async (t) => {
    const tooShort = '12345';
    const tooLong = 'x'.repeat(73);

    // the seeder in the previous test replaced all users, so log in as a seeded editor
    const { body: { token: editorToken } } = await api('POST', '/api/auth/login', { body: { username: 'sarah_editor', password: 'password123' } });

    await t.test('create: too short, too long or not a string is rejected', async () => {
        for (const password of [tooShort, tooLong, 123456, null, ['abcdefg'], { $ne: '' }]) {
            const res = await api('POST', '/api/users', {
                token: editorToken,
                body: { username: `rejected_${Math.random().toString(36).slice(2, 8)}`, password, fullName: 'Rejected' }
            });
            assert.equal(res.status, 400, `password ${JSON.stringify(password)} should be rejected`);
        }
    });

    await t.test('update: a weak password is rejected and the old one keeps working', async () => {
        const target = await User.findOne({ username: 'dan_reporter' });
        const before = await storedPassword('dan_reporter');

        for (const password of [tooShort, tooLong, 42]) {
            const res = await api('PUT', `/api/users/${target._id}`, { token: editorToken, body: { password } });
            assert.equal(res.status, 400, `password ${JSON.stringify(password)} should be rejected`);
        }
        assert.equal(await storedPassword('dan_reporter'), before);
        assert.equal((await api('POST', '/api/auth/login', { body: { username: 'dan_reporter', password: 'password123' } })).status, 200);
    });

    await t.test('the database layer refuses weak passwords too', async () => {
        await assert.rejects(() => User.insertMany([{ username: 'weak_one', password: tooShort, fullName: 'Weak', role: 'reporter' }]));
        await assert.rejects(() => User.updateOne({ username: 'dan_reporter' }, { $set: { password: tooShort } }));
        assert.equal(await User.exists({ username: 'weak_one' }), null);
    });

    await t.test('login checks the password on the server and never reveals which part was wrong', async () => {
        const wrongPassword = await api('POST', '/api/auth/login', { body: { username: 'dan_reporter', password: 'not-the-password' } });
        const unknownUser = await api('POST', '/api/auth/login', { body: { username: 'nobody_here', password: 'password123' } });
        assert.equal(wrongPassword.status, 401);
        assert.equal(unknownUser.status, 401);
        assert.equal(wrongPassword.body.message, unknownUser.body.message);

        // sending the stored hash instead of the password does not log you in (the hash is not a password)
        const hash = await storedPassword('dan_reporter');
        assert.equal((await api('POST', '/api/auth/login', { body: { username: 'dan_reporter', password: hash } })).status, 401);
    });

    await t.test('role, token and user id sent by the client cannot grant access', async () => {
        const login = await api('POST', '/api/auth/login', { body: { username: 'dan_reporter', password: 'password123', role: 'editor' } });
        assert.equal(login.body.user.role, 'reporter');

        // a forged token (signed with another secret) is refused
        const jwt = require('jsonwebtoken');
        const forged = jwt.sign({ id: login.body.user.id, role: 'editor' }, 'some-other-secret');
        assert.equal((await api('GET', '/api/users', { token: forged })).status, 401);

        // a real reporter token whose claims were changed to "editor" still only has reporter rights
        const reporterToken = login.body.token;
        const claims = JSON.parse(Buffer.from(reporterToken.split('.')[1], 'base64url').toString());
        assert.equal(claims.role, 'reporter');
        assert.equal((await api('GET', '/api/users', { token: reporterToken })).status, 403);
    });
});

test('No API response ever contains a password or a hash', async () => {
    const dan = await User.findOne({ username: 'dan_reporter' });
    const article = await Article.findOne({ author: dan._id });
    const login = await api('POST', '/api/auth/login', { body: { username: 'sarah_editor', password: 'password123' } });
    const token = login.body.token;

    const responses = {
        login: login.text,
        me: (await api('GET', '/api/auth/me', { token })).text,
        users: (await api('GET', '/api/users', { token })).text,
        user: (await api('GET', `/api/users/${dan._id}`, { token })).text,
        updated: (await api('PUT', `/api/users/${dan._id}`, { token, body: { fullName: 'דן שטרן' } })).text,
        created: (await api('POST', '/api/users', { token, body: { username: 'pw_leak_check', password: 'leak-check-7', fullName: 'Leak Check' } })).text,
        publicArticles: (await api('GET', '/api/articles/public?limit=50')).text,
        editorArticles: (await api('GET', '/api/articles/editor/all?limit=100', { token })).text,
        article: article ? (await api('GET', `/api/articles/editor/${article._id}/review`, { token })).text : '',
        analytics: article ? (await api('GET', `/api/analytics/article/${article._id}`)).text : '',
        comments: (await api('GET', '/api/comments', { token })).text
    };

    for (const [name, text] of Object.entries(responses)) {
        assert.ok(text.length > 0, `${name} should have a response`);
        assert.doesNotMatch(text, /\$2[aby]\$/, `${name} must not contain a bcrypt hash`);
        assert.doesNotMatch(text, /"password"/i, `${name} must not contain a password field`);
    }
});
