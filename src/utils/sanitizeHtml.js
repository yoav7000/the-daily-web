// Tags a reporter may use in an article body. Everything else is dropped (its text is kept).
const ALLOWED_TAGS = new Set([
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
    'h2', 'h3', 'h4', 'blockquote', 'a', 'img'
]);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi;
const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;

const escapeText = (text) => text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const escapeAttribute = (value) => escapeText(value).replace(/"/g, '&quot;');

// Only plain web links and same-site paths are allowed (blocks javascript:, data:, etc.)
const isSafeUrl = (url) => /^(https?:\/\/|\/(?!\/))/i.test(url.trim());

const readAttribute = (tag, name) => {
    const match = tag.match(new RegExp(String.raw`\b${name}\s*=\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
    return match ? (match[1] !== undefined ? match[1] : match[2]) : null;
};

const rebuildOpeningTag = (name, rawTag) => {
    if (name === 'a') {
        const href = readAttribute(rawTag, 'href');
        return href && isSafeUrl(href)
            ? `<a href="${escapeAttribute(href.trim())}" rel="noopener noreferrer" target="_blank">`
            : '<a>';
    }
    if (name === 'img') {
        const src = readAttribute(rawTag, 'src');
        if (!src || !isSafeUrl(src)) {
            return '';
        }
        const alt = readAttribute(rawTag, 'alt') || '';
        return `<img src="${escapeAttribute(src.trim())}" alt="${escapeAttribute(alt)}">`;
    }
    return `<${name}>`;
};

/**
 * Reduces reporter supplied HTML to a small, safe subset.
 * The output is rebuilt from scratch: tags come from the allowlist, attributes are limited to
 * validated href/src/alt, and all remaining text is escaped, so nothing from the input can run as script.
 */
const sanitizeHtml = (input) => {
    if (typeof input !== 'string') {
        return '';
    }

    const html = input.replace(DROP_WITH_CONTENT, '');
    let output = '';
    let lastIndex = 0;
    let match;

    TAG_PATTERN.lastIndex = 0;
    while ((match = TAG_PATTERN.exec(html)) !== null) {
        output += escapeText(html.slice(lastIndex, match.index));
        lastIndex = TAG_PATTERN.lastIndex;

        const [rawTag, closing, tagName] = match;
        const name = tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(name)) {
            continue;
        }
        if (closing) {
            if (name !== 'br' && name !== 'img') {
                output += `</${name}>`;
            }
        } else {
            output += rebuildOpeningTag(name, rawTag);
        }
    }

    return output + escapeText(html.slice(lastIndex));
};

module.exports = { sanitizeHtml };
