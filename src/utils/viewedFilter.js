const MAX_VIEWED_IDS = 300;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

/**
 * Builds the _id condition for the "viewed / not viewed" filter of the public feed.
 * The browser remembers which articles the visitor opened and sends their ids with ?viewed=read|unread&viewedIds=a,b,c,
 * so the server can return correct results from the whole archive, not just from the pages already loaded.
 * Returns null when no (valid) filter was asked for.
 */
const buildViewedCondition = (query) => {
    const mode = query.viewed;
    if (mode !== 'read' && mode !== 'unread') {
        return null;
    }

    const ids = (typeof query.viewedIds === 'string' ? query.viewedIds : '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => OBJECT_ID.test(id))
        .slice(0, MAX_VIEWED_IDS);

    return mode === 'read' ? { $in: ids } : { $nin: ids };
};

module.exports = { buildViewedCondition, MAX_VIEWED_IDS };
