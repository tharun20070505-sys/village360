// High-precision response time and telemetry tracker
class MetricsCollector {
  constructor() {
    this.latencies = []; // Rolling window of recent latencies in ms (up to 1000)
    this.adminLatencies = []; // Rolling window for admin requests
    this.totalRequests = 0;
    this.statusCodes = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    this.endpointStats = new Map(); // path -> { count, totalMs }
    this.startTime = Date.now();
  }

  record(path, status, durationMs, isAdmin = false) {
    this.totalRequests++;

    // Track status code family
    const category = `${Math.floor(status / 100)}xx`;
    if (this.statusCodes[category] !== undefined) {
      this.statusCodes[category]++;
    }

    // Keep rolling window of 1000 samples
    this.latencies.push(durationMs);
    if (this.latencies.length > 1000) this.latencies.shift();

    if (isAdmin) {
      this.adminLatencies.push(durationMs);
      if (this.adminLatencies.length > 500) this.adminLatencies.shift();
    }

    // Normalized path (strip IDs)
    const normalized = path.replace(/[0-9a-fA-F]{24}/g, ':id').split('?')[0];
    const stat = this.endpointStats.get(normalized) || { count: 0, totalMs: 0 };
    stat.count++;
    stat.totalMs += durationMs;
    this.endpointStats.set(normalized, stat);
  }

  calculatePercentiles(samples) {
    if (!samples.length) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const p = (pct) => {
      const idx = Math.floor((pct / 100) * (sorted.length - 1));
      return Number(sorted[idx].toFixed(2));
    };

    return {
      min: Number(sorted[0].toFixed(2)),
      max: Number(sorted[sorted.length - 1].toFixed(2)),
      avg: Number((sum / sorted.length).toFixed(2)),
      p50: p(50),
      p95: p(95),
      p99: p(99)
    };
  }

  getSnapshot() {
    const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
    const rpm = uptimeSec > 0 ? Number(((this.totalRequests / uptimeSec) * 60).toFixed(1)) : 0;

    // Top 5 slowest endpoints
    const slowest = [...this.endpointStats.entries()]
      .map(([path, { count, totalMs }]) => ({
        path,
        requests: count,
        avgMs: Number((totalMs / count).toFixed(2))
      }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, 5);

    return {
      uptimeSeconds: uptimeSec,
      totalRequests: this.totalRequests,
      requestsPerMinute: rpm,
      statusCodes: this.statusCodes,
      responseTime: this.calculatePercentiles(this.latencies),
      adminResponseTime: this.calculatePercentiles(this.adminLatencies),
      slowestEndpoints: slowest,
      timestamp: new Date().toISOString()
    };
  }
}

export const metrics = new MetricsCollector();

export function responseTimeTracker(req, res, next) {
  const start = process.hrtime.bigint();

  // Safely set header before response is written to the client
  const originalWriteHead = res.writeHead;
  res.writeHead = function (...args) {
    if (!res.headersSent) {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;
      res.setHeader('X-Response-Time', durationMs.toFixed(2) + 'ms');
    }
    return originalWriteHead.apply(this, args);
  };

  // Record metrics on finish
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    const isAdmin = req.user && req.user.role === 'admin';
    metrics.record(req.originalUrl || req.url, res.statusCode, durationMs, isAdmin);
  });

  next();
}
