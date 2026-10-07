/**
 * Trims a client supplied value; anything that is not a string becomes an empty string.
 * Keeps request bodies and query strings (which can contain objects) from reaching Mongo queries.
 */
const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

module.exports = { cleanText };
