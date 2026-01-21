const { isConfigured } = require('../../sqlServerClient');

// Middleware to check if database is configured
function requireDb(req, res, next) {
  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Database not configured'
    });
  }
  next();
}

module.exports = { requireDb };
