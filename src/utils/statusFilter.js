const { ARTICLE_STATUS, ARTICLE_STATUS_LABELS_HE } = require('../constants/articleConstants');

// Extra spellings the dashboards may send for each status, besides the English key and Hebrew label
const STATUS_ALIASES = {
    [ARTICLE_STATUS.PENDING_APPROVAL]: ['ממתינה לאישור'],
    [ARTICLE_STATUS.PUBLISHED]: ['פורסמו'],
    [ARTICLE_STATUS.REVISION_REQUESTED]: ['הוחזרו לתיקונים']
};

/**
 * Turns a status filter coming from the client (English key or Hebrew label) into the stored status value.
 * Returns the input unchanged when it matches nothing, so the query simply finds no results.
 */
const normalizeStatus = (value) => {
    if (typeof value !== 'string') {
        return '';
    }
    for (const status of Object.values(ARTICLE_STATUS)) {
        const names = [status, ARTICLE_STATUS_LABELS_HE[status], ...(STATUS_ALIASES[status] || [])];
        if (names.includes(value)) {
            return status;
        }
    }
    return value;
};

module.exports = { normalizeStatus };
