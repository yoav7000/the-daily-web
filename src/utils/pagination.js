const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Reads page/limit from a query string, falling back to safe defaults and capping the limit.
 */
const parsePagination = (query, defaultLimit = DEFAULT_LIMIT) => {
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), MAX_LIMIT);
    return { page, limit, skip: (page - 1) * limit };
};

const buildPagination = (totalCount, page, limit) => ({
    totalCount,
    currentPage: page,
    totalPages: Math.ceil(totalCount / limit)
});

module.exports = { parsePagination, buildPagination };
