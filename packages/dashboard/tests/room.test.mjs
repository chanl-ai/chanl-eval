// Workshop room checks, run over HTTP against a dashboard started in cloud mode.
//   ROOM_TEST_URL=http://localhost:3410 ROOM_MONGODB_URI=mongodb://localhost:27217/evalroom-test \
//   ROOM_TEST_CODE=qa-room node --test tests/room.test.mjs
// ROOM_MONGODB_URI must be the room database that dashboard uses. Skipped when unset.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';

const URL_ = process.env.ROOM_TEST_URL;
const MONGO = process.env.ROOM_MONGODB_URI;
const CODE = process.env.ROOM_TEST_CODE;
const skip = !URL_ || !MONGO || !CODE ? 'set ROOM_TEST_URL, ROOM_MONGODB_URI and ROOM_TEST_CODE' : false;
const run = `t${Date.now()}`;
let mongo;
let db;

before(async () => {
  if (skip) return;
  mongo = await MongoClient.connect(MONGO);
  db = mongo.db();
  // Free seats this run owns: two for the race, one for the proxy test.
  await db.collection('seats').insertMany(
    ['a', 'b', 'c'].map((s) => ({ seat: `${run}-${s}`, url: 'http://127.0.0.1:9/api/v1', apiKey: 'x', assignedTo: null })),
  );
});

after(async () => {
  if (skip) return;
  const emails = (await db.collection('accounts').find({ email: new RegExp(`^${run}`) }).toArray()).map((a) => a.email);
  await db.collection('accounts').deleteMany({ email: { $in: emails } });
  await db.collection('seats').updateMany({ assignedTo: { $in: emails } }, { $set: { assignedTo: null } });
  await db.collection('seats').deleteMany({ seat: new RegExp(`^${run}`) });
  await mongo.close();
});

function signup(email, roomCode = CODE) {
  return fetch(`${URL_}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test', email, password: 'password123', roomCode }),
  });
}

test('a wrong room code is refused and creates no account', { skip }, async () => {
  const res = await signup(`${run}-wrong@example.com`, 'not-the-code');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).message, 'Room code not recognized');
  assert.equal(await db.collection('accounts').countDocuments({ email: `${run}-wrong@example.com` }), 0);
});

test('two simultaneous signups get two different seats', { skip }, async () => {
  const [a, b] = await Promise.all([signup(`${run}-x@example.com`), signup(`${run}-y@example.com`)]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const [sa, sb] = [(await a.json()).seat, (await b.json()).seat];
  assert.ok(sa && sb);
  assert.notEqual(sa, sb);
  const holders = await db.collection('seats').find({ seat: { $in: [sa, sb] } }).toArray();
  assert.deepEqual(holders.map((s) => s.assignedTo).sort(), [`${run}-x@example.com`, `${run}-y@example.com`]);
});

test('the proxy refuses settings writes and api-key routes', { skip }, async () => {
  const res = await signup(`${run}-p@example.com`);
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const put = await fetch(`${URL_}/api/eval/settings`, {
    method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: '{"openaiApiKey":"sk-x"}',
  });
  assert.equal(put.status, 403);
  const keys = await fetch(`${URL_}/api/eval/api-keys`, { headers: { cookie } });
  assert.equal(keys.status, 403);
  const encoded = await fetch(`${URL_}/api/eval/prompts/..%2Fsettings`, { method: 'PUT', headers: { cookie } });
  assert.equal(encoded.status, 403);
});

test('signed-out visitors are sent to login and get 401 from the API', { skip }, async () => {
  const page = await fetch(`${URL_}/scenarios`, { redirect: 'manual' });
  assert.equal(page.status, 307);
  assert.match(page.headers.get('location'), /\/login\?next=%2Fscenarios$/);
  const api = await fetch(`${URL_}/api/eval/scenarios`);
  assert.equal(api.status, 401);
});
