/**
 * Parses page and limit parameters, ensuring they are valid integers within limits
 * @param {object} query - Express request query object
 * @returns {object} { page, limit, offset }
 */
function parsePagination(query) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (isNaN(page) || page < 1) {
    page = 1;
  }
  if (isNaN(limit) || limit < 1) {
    limit = 20;
  } else if (limit > 100) {
    limit = 100; // Cap limit to prevent large database queries
  }

  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Constructs pagination metadata
 * @param {number} totalCount - Total matching records
 * @param {number} page - Current page
 * @param {number} limit - Current limit
 * @returns {object} { page, limit, total, totalPages }
 */
function getPaginationMeta(totalCount, page, limit) {
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  return {
    page,
    limit,
    total: totalCount,
    totalPages,
  };
}

module.exports = {
  parsePagination,
  getPaginationMeta,
};
