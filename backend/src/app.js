import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { origin, production } from './config/env.js';
import { authenticate, browserOrigin } from './middleware/session.js';
import { responseTimeTracker } from './middleware/metrics.js';
import { apiRateLimiter, authRateLimiter, surveySubmissionLimiter } from './middleware/rateLimiter.js';
import { dbBreaker } from './utils/circuitBreaker.js';
import { auth } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { adminMetricsRoutes } from './routes/adminMetrics.js';
import { surveyRoutes } from './routes/surveys.js';
import { reports } from './routes/reports.js';
import { discoveryRoutes } from './routes/discovery.js';

export const app = express();
app.disable('x-powered-by');

// Reverse proxy hop configuration
const hops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(hops) || hops < 0 || hops > 5) throw new Error('Invalid proxy configuration.');
app.set('trust proxy', hops);

// High-precision response time tracking (sets X-Response-Time header)
app.use(responseTimeTracker);

// Response compression (gzip/deflate for responses > 512 bytes)
app.use(compression({ threshold: 512 }));

// Security headers and CORS
app.use(
  helmet(),
  cors({
    origin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key']
  })
);

// High-availability health check with circuit breaker status
app.get('/api/health', (req, res) => {
  const ready = mongoose.connection.readyState === 1 && dbBreaker.state !== 'OPEN';
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'unavailable',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    circuitBreaker: dbBreaker.state,
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// Tiered rate limiters: global API, auth brute-force protection, survey spam protection
app.use('/api', apiRateLimiter);
app.use('/api/auth/login', authRateLimiter);
app.use('/api/surveys', surveySubmissionLimiter);

// Parsers & origin validation
app.use(browserOrigin, express.json({ limit: '128kb' }), cookieParser());

// Public routes
app.use('/api/auth', auth);
app.use('/api', discoveryRoutes);

// Protected routes (Session required)
app.use('/api', authenticate, adminRoutes, adminMetricsRoutes, surveyRoutes, reports);

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

// Centralized error handling
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: 'Check the submitted fields.',
      fields: err.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
    });
  }
  if (err.code === 11000) return res.status(409).json({ error: 'A record with that reference already exists.' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Photographs must be 2 MB or smaller.' });
  if (err.name === 'MulterError') return res.status(422).json({ error: 'Invalid photograph upload.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });

  const status = err.status >= 400 && err.status <= 599 ? err.status : 500;
  if (status >= 500) console.error('API error', err.name, err.code ?? '', production ? '' : err.message);
  res.status(status).json({ error: status >= 500 ? 'Unable to complete the database operation.' : err.message });
});

export default app;
