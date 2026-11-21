import 'dotenv/config';
import dns from 'node:dns';
import mongoose from 'mongoose';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore in sandboxed or custom environments
}

export const production = process.env.NODE_ENV === 'production';
export const origin = process.env.FRONTEND_URL || 'http://localhost:5173';
export function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('Set SESSION_SECRET to at least 32 random characters.');
  return value;
}
export async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Set MONGODB_URI before starting.');
  if (production && !origin.startsWith('https://')) throw new Error('Production requires an HTTPS frontend origin.');
  secret();
  const dbName = process.env.NODE_ENV === 'test' ? 'village360_test' : 'village360';
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
}
