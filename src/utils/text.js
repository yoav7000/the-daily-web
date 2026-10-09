const { DEFAULT_ARTICLE_IMAGE } = require('../constants/articleConstants');

/**
 * Trims a client supplied value; anything that is not a string becomes an empty string.
 * Keeps request bodies and query strings (which can contain objects) from reaching Mongo queries.
 */
const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Normalizes an image URL, automatically extracting direct image links from Google Images or redirect URLs,
 * and falling back to default placeholder if an invalid search page URL is passed.
 */
const normalizeImageUrl = (value) => {
    if (!value || typeof value !== 'string') return DEFAULT_ARTICLE_IMAGE;
    const trimmed = value.trim();
    if (!trimmed) return DEFAULT_ARTICLE_IMAGE;
    try {
        const parsed = new URL(trimmed);
        if (parsed.hostname.includes('google.')) {
            if (parsed.searchParams.has('imgurl')) {
                const extracted = parsed.searchParams.get('imgurl');
                if (extracted) return decodeURIComponent(extracted);
            }
            if (parsed.searchParams.has('url') && parsed.pathname.includes('/url')) {
                const extracted = parsed.searchParams.get('url');
                if (extracted) return decodeURIComponent(extracted);
            }
            if (parsed.pathname.includes('/search')) {
                return DEFAULT_ARTICLE_IMAGE;
            }
        }
    } catch (e) {
        // Not a valid URL
    }
    return trimmed;
};

module.exports = { cleanText, normalizeImageUrl };
