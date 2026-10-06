const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeHtml } = require('../src/utils/sanitizeHtml');

test('keeps basic formatting', () => {
    assert.equal(sanitizeHtml('<p>שלום <strong>עולם</strong></p>'), '<p>שלום <strong>עולם</strong></p>');
});

test('removes scripts, event handlers and dangerous tags', () => {
    assert.equal(sanitizeHtml('<p onclick="x()">hi</p><script>alert(1)</script>'), '<p>hi</p>');
    assert.equal(sanitizeHtml('<img src="x" onerror="alert(1)">'), '');
    assert.equal(sanitizeHtml('<img src="/a.png" onerror="alert(1)">'), '<img src="/a.png" alt="">');
    assert.equal(sanitizeHtml('<iframe src="https://evil.test"></iframe>text'), 'text');
});

test('blocks javascript: and data: links', () => {
    assert.equal(sanitizeHtml('<a href="javascript:alert(1)">x</a>'), '<a>x</a>');
    assert.equal(sanitizeHtml('<a href="data:text/html;base64,AAA">x</a>'), '<a>x</a>');
    assert.match(sanitizeHtml('<a href="https://example.com">x</a>'), /^<a href="https:\/\/example\.com"/);
});

test('escapes stray angle brackets and non-strings', () => {
    assert.equal(sanitizeHtml('1 < 2 & 3 > 2'), '1 &lt; 2 &amp; 3 &gt; 2');
    assert.equal(sanitizeHtml({ $ne: '' }), '');
    assert.equal(sanitizeHtml(undefined), '');
});

test('a ">" inside an attribute cannot smuggle markup', () => {
    const out = sanitizeHtml('<img src="/x.png" onerror="a>b<script>alert(1)</script>">');
    assert.ok(!/<script/i.test(out));
    assert.equal(out, '<img src="/x.png" alt="">b"&gt;');
});
