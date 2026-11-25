import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import mongoose from 'mongoose';
import argon2 from 'argon2';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { responses } from './fixtures.js';

test('REST workflows against an isolated MongoDB replica set', {timeout: 300000}, async t => {
  // Always create a disposable database. An Atlas URI in a developer's shell is never used.
  const replica = await MongoMemoryReplSet.create({replSet: {count: 1, storageEngine: 'wiredTiger'}});
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await replica.stop();
  });
  const origin = 'http://localhost:5173';
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: replica.getUri('village360_test'),
    SESSION_SECRET: randomBytes(48).toString('hex'), FRONTEND_URL: origin
  });
  const { app } = await import('../src/app.js');
  const { connect } = await import('../src/config/env.js');
  const { User } = await import('../src/models/index.js');
  await connect();
  assert.equal(mongoose.connection.name, 'village360_test');
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const password = randomBytes(24).toString('hex');
  await User.create({name: 'Pilot coordinator', email: 'admin@example.test', role: 'admin',
    passwordHash: await argon2.hash(password, {type: argon2.argon2id})});

  async function call(path, {session, method='GET', body, headers={}} = {}) {
    const response = await fetch(base + path, {
      method, headers: {Origin: origin, ...(body && {'Content-Type': 'application/json'}),
        ...(session && {Cookie: session.cookie, 'X-CSRF-Token': session.csrf}), ...headers},
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    return {status: response.status, headers: response.headers,
      body: response.headers.get('content-type')?.includes('application/json') && text ? JSON.parse(text) : text};
  }
  function check(result, expected) {
    assert.ok([expected].flat().includes(result.status),
      `Expected HTTP ${expected}; received ${result.status}: ${JSON.stringify(result.body).slice(0,400)}`);
    return result.body;
  }
  async function login(identifier) {
    const result = await call('/auth/login', {method:'POST',body:{identifier, password}});
    const { user, csrfToken } = check(result, 200);
    assert.ok(csrfToken);
    assert.ok(!('passwordHash' in user));
    assert.match(result.headers.get('set-cookie'), /HttpOnly/i);
    return {cookie:result.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), csrf: csrfToken, user};
  }

  const admin = await login('admin@example.test');
  const create = async (path, body) => check(await call(path,{session:admin,method:'POST',body}),201);
  const village = await create('/villages',{name:'Synthetic canal village',targets:{households:4}});
  const ward = await create('/wards',{name:'Canal ward',village:village._id});
  const otherVillage = await create('/villages',{name:'Synthetic hill village'});
  const otherWard = await create('/wards',{name:'Hill ward',village:otherVillage._id});
  const fieldUser = await create('/users',{name:'Field surveyor',email:'field@example.test',role:'surveyor',password});
  await create('/users',{name:'Faculty coordinator',email:'faculty@example.test',role:'viewer',password});
  await create('/assignments',{user:fieldUser._id, village:village._id,team:'Field team A'});
  const field = await login(fieldUser.publicId), viewer = await login('faculty@example.test');
  const packet = (kind, overrides={}) => ({
    village:village._id,ward:ward._id,surveyDate:'2025-01-14',status:'Submitted',data:responses(kind),...overrides
  });
  const submit = (path, body, key=randomUUID(), session=field) =>
    call(path,{method:'POST',session,body,headers:{'Idempotency-Key':key}});
  let household, problem;

  await t.test('protected endpoints require a current session, allowed origin and CSRF token', async () => {
    check(await call('/dashboard/summary'),401);
    check(await call('/auth/login',{method:'POST',body:{identifier:'field@example.test',password:'incorrect'}}),401);
    assert.equal(check(await call('/auth/me',{session:field}),200).user._id,fieldUser._id);
    check(await call('/villages',{session:admin,method:'POST',body:{name:'Wrong origin'},headers:{Origin:'https://invalid.example'}}),403);
    check(await call('/villages',{session:admin,method:'POST',body:{name:'No token'},headers:{'X-CSRF-Token':''}}),403);
  });
  await t.test('roles and village assignments restrict mutations and reads', async () => {
    check(await call('/users',{session:field}),403);
    check(await call('/users',{session:viewer}),403);
    check(await call('/villages',{session:field,method:'POST',body:{name:'Outside role'}}),403);
    check(await submit('/problems',packet('problems'),randomUUID(),viewer),403);
    check(await submit('/problems',packet('problems',{village:otherVillage._id,ward:otherWard._id})),403);
    check(await submit('/problems',packet('problems',{ward:otherWard._id})),[400,403,422]);
    assert.deepEqual(check(await call('/villages',{session:field}),200).items.map(v=>v._id),[village._id]);
  });
  await t.test('households persist once with their reference and retry-safe submission ID', async () => {
    const body=packet('households'), key=randomUUID();
    check(await submit('/surveys/households',packet('households',{data:responses('households',{consent:false})})),[400,422]);
    household=check(await submit('/surveys/households',body,key),201);
    assert.ok(household.publicId);
    const repeated=check(await submit('/surveys/households',body,key),[200,201]);
    assert.equal(repeated._id,household._id);
    check(await submit('/surveys/households',body),409);
    const db=mongoose.connection.db;
    assert.equal(await db.collection('households').countDocuments(),1);
    assert.equal(await db.collection('household_surveys').countDocuments(),1);
    const saved=await db.collection('household_surveys').findOne({publicId:household.publicId});
    assert.equal(saved.data.familyMembers,4);
    assert.ok(saved.household);
    assert.equal(String(saved.createdBy),fieldUser._id);
    assert.equal(saved.schemaVersion,1);
    check(await call('/surveys/households/'+household._id,{session:viewer}),403);
  });
  await t.test('all additional instruments save and retrieve valid observations', async () => {
    for (const [kind,collection] of Object.entries({
      infrastructure:'infrastructure_observations',farmers:'farmer_surveys',shgs:'shg_surveys',
      consultations:'panchayat_consultations',students:'student_participation'
    })) {
      const path='/surveys/'+kind;
      const saved=check(await submit(path,packet(kind)),201);
      assert.equal(check(await call(path+'/'+saved._id,{session:field}),200).publicId,saved.publicId);
      assert.equal(await mongoose.connection.db.collection(collection).countDocuments(),1);
    }
  });
  await t.test('problem verification is restricted and produces a persistent audit record',async()=>{
    const body=packet('problems'),key=randomUUID();
    problem=check(await submit('/problems',body,key),201);
    check(await submit('/problems',{...body,data:{...body.data,title:'A different issue'}},key),409);
    assert.equal(check(await call('/problems/'+problem._id,{session:field}),200).data.title,body.data.title);
    const path='/problems/'+problem._id+'/status';
    check(await call(path,{session:field,method:'PATCH',body:{status:'Verified'}}),403);
    check(await call(path,{session:admin,method:'PATCH',body:{status:'Verified'}}),200);
    assert.equal((await mongoose.connection.db.collection('village_problems').findOne({publicId:problem.publicId})).status,'Verified');
    assert.ok(await mongoose.connection.db.collection('audit_logs').countDocuments({record:new mongoose.Types.ObjectId(problem._id)})>=2);
  });
  await t.test('summary, filters and faculty reports reflect approved database records',async()=>{
    const summary=check(await call('/dashboard/summary',{session:admin}),200);
    assert.equal(summary.counts.households,1);
    assert.equal(summary.counts.problems,1);
    const faculty=check(await call('/dashboard/summary',{session:viewer}),200);
    assert.equal(faculty.counts.households,0);
    assert.equal(faculty.counts.problems,1);
    const empty=check(await call('/dashboard/summary?village='+otherVillage._id,{session:admin}),200);
    assert.equal(empty.counts.households,0);assert.equal(empty.counts.problems,0);
    const result=check(await call('/problems?limit=1&page=1',{session:admin}),200);
    assert.equal(result.total,1);assert.equal(result.items.length,1);
  });
  await t.test('CSV export has a CSV media type and excludes individual household details',async()=>{
    const result=await call('/reports/export?type=households&format=csv',{session:admin});
    check(result,200);
    assert.match(result.headers.get('content-type'),/text\/csv/i);
    assert.ok(result.body.length>10);
    assert.ok(!result.body.includes(responses('households').householdRef));
    check(await call('/reports/export?type=households&format=csv',{session:field}),403);
  });
  await t.test('GramAgent read-only export is scoped and suppresses small cells',async()=>{
    process.env.GRAMAGENT_READ_TOKEN=randomBytes(32).toString('hex');
    process.env.GRAMAGENT_VILLAGE_IDS=village._id;
    const path='/gramagent/v1/snapshots/'+village._id;
    check(await call(path),401);
    const headers={Authorization:'Bearer '+process.env.GRAMAGENT_READ_TOKEN};
    check(await call('/gramagent/v1/snapshots/'+otherVillage._id,{headers}),403);
    const before=await mongoose.connection.db.collection('household_surveys').countDocuments();
    const result=check(await call(path,{headers}),200);
    assert.deepEqual(result.observations,[]);
    assert.equal(result.synthetic,false);
    assert.equal(await mongoose.connection.db.collection('household_surveys').countDocuments(),before);
    assert.ok(!JSON.stringify(result).includes(responses('households').householdRef));
    const source=await mongoose.connection.db.collection('household_surveys').findOne({publicId:household.publicId});
    for(let i=0;i<10;i++){
      const {_id, ...copy}=source;
      await mongoose.connection.db.collection('household_surveys').insertOne({...copy,publicId:'GRAM-'+i,key:'gram-'+i,uniqueRef:'gram-'+i,status:'Verified',data:{...copy.data,waterAvailability:i<5?'Unavailable':'Reliable',consent:true}});
    }
    const full=check(await call(path,{headers}),200);
    const water=full.observations.find(o=>o.sector==='Water supply');
    assert.equal(water.value,5);assert.equal(water.denominator,10);
  });
  await t.test('logout invalidates the server session',async()=>{
    check(await call('/auth/logout',{method:'POST',session:field}),[200,204]);
    check(await call('/auth/me',{session:field}),401);
  });
});
