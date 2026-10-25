let app;
let initError = null;

try {
  app = require('../server');
} catch (err) {
  initError = err;
  console.error('Failed to load server:', err);
}

module.exports = (req, res) => {
  if (initError) {
    return res.status(500).json({
      error: 'Server initialization failed',
      details: initError.message,
      stack: initError.stack
    });
  }
  return app(req, res);
};
