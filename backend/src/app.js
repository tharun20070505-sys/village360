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

// AI Agentic Resource Discovery & LLM Context specs
const aiCatalog = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  specVersion: '1.0',
  host: {
    displayName: 'Village 360°',
    identifier: 'did:web:village360.local',
    documentationUrl: '/llms.txt',
    logoUrl: '/assets/village-fieldwork-small.webp'
  },
  entries: [
    {
      identifier: 'urn:air:village360.local:api:discovery',
      displayName: 'Village 360 Field Survey Discovery API',
      type: 'application/openapi+json',
      url: '/api/discovery',
      description: 'Exposes metadata, schemas, validation rules, and endpoint specifications for all 7 survey instruments (households, problems, infrastructure, farmers, shgs, consultations, students) and Coimbatore administrative divisions (235 Panchayats, 2,041 Wards).',
      version: '1.0.0',
      tags: ['surveys', 'coimbatore', 'fieldwork', 'governance', 'panchayats'],
      representativeQueries: [
        'Discover available rural survey modules',
        'Inspect household survey schema and required fields',
        'List Coimbatore village panchayats and wards'
      ],
      updatedAt: '2026-11-21T12:00:00Z'
    },
    {
      identifier: 'urn:air:village360.local:telemetry:metrics',
      displayName: 'Village 360 Performance Telemetry',
      type: 'application/json',
      url: '/api/telemetry/metrics',
      description: 'Real-time metrics exposing p50, p95, p99 response latency, circuit breaker status, and rate limit telemetry for admin observers.',
      version: '1.0.0',
      tags: ['telemetry', 'observability', 'circuit-breaker', 'rate-limiting'],
      representativeQueries: [
        'Check API p95 response time',
        'Inspect MongoDB circuit breaker state'
      ],
      updatedAt: '2026-11-21T12:00:00Z'
    },
    {
      identifier: 'urn:air:village360.local:docs:llmstxt',
      displayName: 'Village 360 LLM Context Specification',
      type: 'text/markdown',
      url: '/llms.txt',
      description: 'Standardized markdown documentation map outlining project architecture, survey methodologies, and data schemas for LLMs.',
      version: '1.0.0',
      tags: ['llms', 'documentation', 'knowledge-base'],
      representativeQueries: [
        'What is Village 360?',
        'How do surveyors submit records?'
      ],
      updatedAt: '2026-11-21T12:00:00Z'
    }
  ]
};

app.get(['/ai-catalog.json', '/.well-known/ai-catalog.json'], (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(aiCatalog);
});

const llmsContent = `# Village 360

> Digital village survey, rural development fieldwork, and governance data management platform covering 235 Village Panchayats and 2,041 Wards in Coimbatore district.

Village 360° provides an end-to-end digital infrastructure for student survey teams, faculty researchers, and administrative coordinators to collect, verify, and analyze rural development data with cryptographic verification and enterprise reliability.

## Core Survey Modules

- [Household Survey](/surveys/households/new): Comprehensive household demographic assessment, living condition records, water supply access, sanitation facilities, and welfare scheme enrollment.
- [Village Problems](/surveys/problems/new): Field grievance and infrastructure deficit reporting including road deterioration, streetlighting faults, drainage blockages, and waste disposal needs.
- [Infrastructure Audit](/surveys/infrastructure/new): Physical audit of village assets including schools, Anganwadis, primary health centres, community halls, and overhead drinking water tanks.
- [Farmer Survey](/surveys/farmers/new): Agricultural census capturing landholding size, crop varieties, irrigation systems (borewell/canal/drip), pest challenges, and crop insurance participation.
- [Self-Help Groups](/surveys/shgs/new): Women empowerment and microfinance audit documenting SHG savings, bank loan repayment rates, livelihood ventures, and training requirements.
- [Panchayat Consultations](/surveys/consultations/new): Gram Sabha consultation records, village leader priorities, ongoing development projects, and fund allocation resolutions.
- [Student Participation](/surveys/students/new): Fieldwork team logs tracking student enumerator rosters, assigned wards, supervised visits, and community interaction hours.

## Administrative Boundaries

- [Coimbatore District Panchayats](/api/records/panchayats): 235 recognized Village Panchayats across 12 Community Development blocks.
- [Coimbatore Ward Records](/api/records/wards): 2,041 surveyed wards linked with localized census codes and geographic references.

## System & API Endpoints

- [Survey Discovery API](/api/discovery): OpenAPI-compatible JSON discovery specification enumerating all schemas, field types, validation rules, and available modules.
- [System Telemetry API](/api/telemetry/metrics): Observability endpoint providing p50, p95, p99 response times, MongoDB circuit breaker health, and rate limiter status.
- [AI Catalog Manifest](/ai-catalog.json): Standardized Agentic Resource Discovery manifest for autonomous AI tools and crawlers.

## Optional

- [Full Documentation](/llms-full.txt): Comprehensive technical guide detailing the complete database schema, validation rules, role-based permissions, and deployment architecture.
`;

app.get(['/llms.txt', '/lms.txt', '/.well-known/llms.txt'], (req, res) => {
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(llmsContent);
});

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
