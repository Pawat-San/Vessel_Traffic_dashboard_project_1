/**
 * Creates a standardized success response object
 * @param {any} data - The data payload
 * @param {object} [meta] - Optional pagination metadata
 * @returns {object} Standardized success response
 */
function success(data, meta = null) {
  const response = {
    success: true,
    data,
  };
  if (meta) {
    response.meta = meta;
  }
  return response;
}

/**
 * Creates a standardized error response object
 * @param {string} code - Application-specific error code
 * @param {string} message - Human-readable error message
 * @param {any} [details] - Detailed validation or context fields
 * @returns {object} Standardized error response
 */
function error(code, message, details = null) {
  const response = {
    success: false,
    error: {
      code,
      message,
    },
  };
  if (details) {
    response.error.details = details;
  }
  return response;
}

module.exports = {
  success,
  error,
};
