import cluster from 'node:cluster';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const numCPUs = Math.min(os.cpus().length, Number(process.env.WEB_CONCURRENCY || 4));

if (cluster.isPrimary) {
  console.log(`[Load Balancer] Primary process ${process.pid} is running`);
  console.log(`[Load Balancer] Starting ${numCPUs} worker processes...`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('online', (worker) => {
    console.log(`[Worker ${worker.process.pid}] Online and ready for traffic`);
  });

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`[Worker ${worker.process.pid}] Exited (code: ${code}, signal: ${signal}). Respawning...`);
    cluster.fork();
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('[Load Balancer] Shutting down workers gracefully...');
    for (const id in cluster.workers) {
      cluster.workers[id].kill('SIGTERM');
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} else {
  // Workers share the TCP connection on port 5001
  await import('./server.js');
}
