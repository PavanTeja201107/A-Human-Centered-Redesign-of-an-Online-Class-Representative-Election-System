const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { NODE_ENV, PORT, allowlist } = require('./config/appConfig');
const app = express();
function setupMiddleware(app) {
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowlist.has(origin)) return callback(null, true);
        return callback(new Error(`CORS not allowed from origin: ${origin}`));
      },
      credentials: true,
    })
  );
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: NODE_ENV === 'production' ? 200 : 10000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/',
    handler: (req, res) => {
      return res
        .status(429)
        .json({
          error:
            'Too many requests (rate limit). Please slow down and try again shortly.',
        });
    },
  });
  app.use(limiter);
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}

setupMiddleware(app);

// routes

/*
 * Purpose: Mount API route modules and health endpoints.
 */
function setupRoutes(app) {
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/elections', require('./routes/elections'));
  app.use('/api/nominations', require('./routes/nominations'));
  app.use('/api/votes', require('./routes/votes'));
  app.use('/api/policy', require('./routes/policy'));
  app.use('/api/audit', require('./routes/audit'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/students', require('./routes/students'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.get('/', (req, res) =>
    res.json({ message: 'Class Representative Election System backend up' })
  );
  app.get('/api/health', (req, res) =>
    res.json({ ok: true, now: new Date().toISOString(), env: NODE_ENV })
  );
}

setupRoutes(app);

/*
 * Maintenance job: runs periodically to perform background tasks (cleanup OTPs, auto-close/activate elections, etc.).
 * Note: Currently scheduled with a 1s interval for development/demo. Consider increasing interval in production (e.g., 1m).
 */
const maintenanceJob = require('./utils/maintenanceJob');
setInterval(maintenanceJob, 1000);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
