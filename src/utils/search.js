const { cleanText } = require('./text');

const MAX_SEARCH_LENGTH = 100;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Builds a Mongo filter for a free-text search box: the text may match any part of the given fields
 * (case-insensitive), so typing half a word already finds results. Returns null for an empty search.
 */
const buildSearchFilter = (search, fields) => {
    const text = cleanText(search).slice(0, MAX_SEARCH_LENGTH);
    if (!text) {
        return null;
    }
    const pattern = new RegExp(escapeRegex(text), 'i');
    return { $or: fields.map((field) => ({ [field]: pattern })) };
};

module.exports = { buildSearchFilter };
