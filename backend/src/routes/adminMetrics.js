import { Router } from 'express';
import mongoose from 'mongoose';
import { metrics } from '../middleware/metrics.js';
import { cache } from '../utils/cache.js';
import { dbBreaker } from '../utils/circuitBreaker.js';
import { requireRoles } from '../utils/http.js';
import { User, Village, Ward } from '../models/index.js';

export const adminMetricsRoutes = Router();
const adminOnly = requireRoles('admin');

// GET /api/admin/metrics - Real-time system telemetry and response time analytics
adminMetricsRoutes.get('/admin/metrics', adminOnly, async (req, res) => {
  const snapshot = metrics.getSnapshot();
  const cacheStats = cache.getStats();
  const breakerStatus = dbBreaker.getStatus();

  // Test live DB latency ping
  let dbPingMs = null;
  const pingStart = process.hrtime.bigint();
  try {
    if (mongoose.connection.db) {
      await mongoose.connection.db.command({ ping: 1 });
      const pingEnd = process.hrtime.bigint();
      dbPingMs = Number(pingEnd - pingStart) / 1_000_000;
    }
  } catch (err) {
    dbPingMs = -1;
  }

  // Get active admin accounts
  const admins = await User.find({ role: 'admin', active: true })
    .select('name email publicId createdAt')
    .lean();

  const mem = process.memoryUsage();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    telemetry: {
      uptimeSeconds: snapshot.uptimeSeconds,
      totalRequests: snapshot.totalRequests,
      requestsPerMinute: snapshot.requestsPerMinute,
      statusCodes: snapshot.statusCodes,
      responseTime: snapshot.responseTime,
      adminResponseTime: snapshot.adminResponseTime,
      slowestEndpoints: snapshot.slowestEndpoints
    },
    cache: cacheStats,
    circuitBreaker: breakerStatus,
    database: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      latencyMs: dbPingMs !== null ? Number(dbPingMs.toFixed(2)) : null,
      host: mongoose.connection.host || 'Atlas Cluster'
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        heapUsedMb: (mem.heapUsed / 1024 / 1024).toFixed(1),
        heapTotalMb: (mem.heapTotal / 1024 / 1024).toFixed(1),
        rssMb: (mem.rss / 1024 / 1024).toFixed(1)
      }
    },
    administrators: admins.map(a => ({
      name: a.name,
      email: a.email,
      id: a.publicId
    }))
  });
});

// POST /api/admin/cache/clear - Flush cache
adminMetricsRoutes.post('/admin/cache/clear', adminOnly, (req, res) => {
  cache.clear();
  res.json({ message: 'System cache cleared successfully.', stats: cache.getStats() });
});
