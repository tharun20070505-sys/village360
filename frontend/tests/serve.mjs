// Starts a private, disposable full-stack installation for responsive browser tests.
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const backendRequire = createRequire(new URL('../../backend/package.json', import.meta.url));
const { MongoMemoryReplSet } = backendRequire('mongodb-memory-server');
const argon2 = backendRequire('argon2');
const mongoose = backendRequire('mongoose');
const replica = await MongoMemoryReplSet.create({replSet:{count:1,storageEngine:'wiredTiger'}});
const frontend = 'http://127.0.0.1:4179';
Object.assign(process.env, {NODE_ENV:'test', FRONTEND_URL:frontend,
  MONGODB_URI:replica.getUri('village360_test'), SESSION_SECRET:randomBytes(48).toString('hex')});
let apiServer, vite;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  if (vite) await vite.close();
  if (apiServer) await new Promise(resolve => apiServer.close(resolve));
  await mongoose.disconnect();
  await replica.stop();
}
for (const sig of ['SIGINT','SIGTERM']) process.once(sig, () => close().then(() => process.exit(0)));
try {
  const {app} = await import('../../backend/src/app.js');
  const {connect} = await import('../../backend/src/config/env.js');
  const {User,Village,Ward,Assignment} = await import('../../backend/src/models/index.js');
  await connect();
  const surveyor = await User.create({name:'Mobile pilot surveyor',email:'mobile@example.test',role:'surveyor',
    passwordHash:await argon2.hash(process.env.V360_TEST_PASSWORD,{type:argon2.argon2id})});
  const village = await Village.create({name:'Test village'});
  await Ward.create({name:'Test ward',village:village._id});
  await Assignment.create({village:village._id,user:surveyor._id});
  apiServer=app.listen(0,'127.0.0.1');
  await once(apiServer,'listening');
  // Keep test traffic on the unique disposable backend even if a developer set a Vite env file.
  process.env.VITE_API_BASE_URL='/api';
  vite=await createServer({server:{host:'127.0.0.1',port:4179,strictPort:true,proxy:{'/api':'http://127.0.0.1:'+apiServer.address().port}}});
  await vite.listen();
} catch (error) {
  await close();
  throw error;
}
