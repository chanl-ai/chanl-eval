/**
 * Workshop room operations: seed every seat, write the seat directory, check health, reset a seat,
 * and load-test the room. Seats are reachable only on Fly's private network, so each seat is reached
 * through its own `fly proxy` on a local port while the command runs.
 *
 * Usage (from packages/server; credentials come from ~/.chanl-eval-room.env):
 *   npx tsx scripts/seed/workshop-room.ts seed [--seats 1-40]
 *   npx tsx scripts/seed/workshop-room.ts status
 *   npx tsx scripts/seed/workshop-room.ts reset 07              wipe, reseed and free the seat
 *   npx tsx scripts/seed/workshop-room.ts reset-password <email> <password>
 *   npx tsx scripts/seed/workshop-room.ts loadtest [--seats 1-40] [--k 5]
 *   npx tsx scripts/seed/workshop-room.ts clear-runs [--seats 1-40] [--release]
 */

import { spawn, execFileSync, ChildProcess } from 'child_process';
import { randomBytes, scryptSync } from 'crypto';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { MongoClient } from 'mongodb';
import { SeatClient, seedSeat, runAndWait } from './workshop-seed';

const SEAT_APP = 'chanl-eval-room';
const DB_APP = 'chanl-eval-room-db';
const SEAT_PORT = 18005;
const LOCAL_MONGO_PORT = 27027;
const LOCAL_SEAT_PORT_BASE = 19000;
const PARALLEL = 10;

const seatName = (n: number) => `seat-${String(n).padStart(2, '0')}`;

function loadSecrets(): Record<string, string> {
  const file = process.env.ROOM_SECRETS_FILE ?? join(homedir(), '.chanl-eval-room.env');
  return Object.fromEntries(
    readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
  );
}

function parseSeats(argv: string[]): number[] {
  const i = argv.indexOf('--seats');
  const spec = i >= 0 ? argv[i + 1] : '1-40';
  const [a, b] = spec.split('-').map((x) => parseInt(x, 10));
  return Array.from({ length: (b ?? a) - a + 1 }, (_, k) => a + k);
}

function argValue(argv: string[], name: string, fallback: number): number {
  const i = argv.indexOf(name);
  return i >= 0 ? parseInt(argv[i + 1], 10) : fallback;
}

function machines(): Map<string, { id: string; state: string }> {
  const out = execFileSync('fly', ['machines', 'list', '-a', SEAT_APP, '--json'], { encoding: 'utf8' });
  return new Map(JSON.parse(out).map((m: any) => [m.name, { id: m.id, state: m.state }]));
}

async function waitForPort(url: string, timeoutMs = 45_000): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.status < 500) return true;
    } catch { /* proxy not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** Opens `fly proxy` to a private host and resolves once a probe request gets through. */
async function openProxy(localPort: number, remotePort: number, host: string, app: string, probe: string): Promise<ChildProcess> {
  const child = spawn('fly', ['proxy', `${localPort}:${remotePort}`, host, '-a', app], { stdio: 'ignore' });
  if (!(await waitForPort(probe))) {
    child.kill();
    throw new Error(`proxy to ${host} did not come up`);
  }
  return child;
}

async function openMongo(secrets: Record<string, string>) {
  const child = spawn('fly', ['proxy', `${LOCAL_MONGO_PORT}:27017`, `${DB_APP}.internal`, '-a', DB_APP], { stdio: 'ignore' });
  const uri = `mongodb://${secrets.ROOM_MONGO_USER}:${secrets.ROOM_MONGO_PASSWORD}@localhost:${LOCAL_MONGO_PORT}/?authSource=admin&directConnection=true`;
  for (let i = 0; i < 30; i++) {
    try {
      const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 3000 });
      return { client, close: async () => { await client.close(); child.kill(); } };
    } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  child.kill();
  throw new Error('could not reach room Mongo through fly proxy');
}

/** Runs `fn` for each seat with its own proxy, at most PARALLEL at a time. */
async function forEachSeat<T>(seats: number[], fn: (n: number, base: string, machineId: string) => Promise<T>) {
  const ms = machines();
  const results: Record<string, T | { error: string }> = {};
  const queue = [...seats];
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
    for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
      const m = ms.get(seatName(n));
      if (!m) { results[seatName(n)] = { error: 'no machine' }; continue; }
      const port = LOCAL_SEAT_PORT_BASE + n;
      let proxy: ChildProcess | undefined;
      try {
        proxy = await openProxy(port, SEAT_PORT, `${m.id}.vm.${SEAT_APP}.internal`, SEAT_APP, `http://localhost:${port}/health`);
        results[seatName(n)] = await fn(n, `http://localhost:${port}/api/v1`, m.id);
      } catch (e: any) {
        results[seatName(n)] = { error: e.message };
      } finally {
        proxy?.kill();
      }
    }
  }));
  return results;
}

/** The server creates one key on first boot; it is stored in the seat's own database. */
async function seatKey(mongo: MongoClient, seat: string): Promise<string> {
  const k = await mongo.db(seat).collection('api_keys').findOne({ isActive: true }, { sort: { createdAt: 1 } });
  if (!k) throw new Error(`${seat} has no API key yet (has the server booted?)`);
  return k.key as string;
}

async function ensureRoomIndexes(mongo: MongoClient) {
  const room = mongo.db('room');
  // Signup assigns seats by finding the first unassigned one; these keep two signups from
  // creating the same account or a seat from appearing twice.
  await room.collection('accounts').createIndex({ email: 1 }, { unique: true });
  await room.collection('seats').createIndex({ seat: 1 }, { unique: true });
}

async function cmdSeed(argv: string[]) {
  const secrets = loadSecrets();
  const mongo = await openMongo(secrets);
  try {
    await ensureRoomIndexes(mongo.client);
    const seats = mongo.client.db('room').collection('seats');
    const results = await forEachSeat(parseSeats(argv), async (n, base, machineId) => {
      const seat = seatName(n);
      const apiKey = await seatKey(mongo.client, seat);
      const r = await seedSeat(new SeatClient(base, apiKey));
      await seats.updateOne(
        { seat },
        {
          $set: { url: `http://${machineId}.vm.${SEAT_APP}.internal:${SEAT_PORT}/api/v1`, apiKey, machineId, seededAt: new Date() },
          // A reseed must never take a seat away from the attendee who holds it.
          $setOnInsert: { seat, assignedTo: null },
        },
        { upsert: true },
      );
      return `${r.created} created, ${r.updated} updated`;
    });
    report(results);
  } finally {
    await mongo.close();
  }
}

async function cmdStatus(argv: string[]) {
  const results = await forEachSeat(parseSeats(argv), async (_n, base) => {
    const t = Date.now();
    const res = await fetch(base.replace('/api/v1', '/health'));
    return `${res.status} in ${Date.now() - t} ms`;
  });
  report(results);
}

async function cmdReset(argv: string[]) {
  const n = parseInt(argv[0], 10);
  if (!n) throw new Error('usage: reset <seat number>');
  const seat = seatName(n);
  const m = machines().get(seat);
  if (!m) throw new Error(`no machine for ${seat}`);
  const secrets = loadSecrets();
  const mongo = await openMongo(secrets);
  try {
    // A reset seat goes back to the pool, so its attendee's account goes too; they sign up again.
    const room = mongo.client.db('room');
    const gone = await room.collection('accounts').deleteMany({ seat });
    await room.collection('seats').updateOne({ seat }, { $set: { assignedTo: null } });
    console.log(`${seat}: ${gone.deletedCount} account(s) deleted, seat free`);
    await mongo.client.db(seat).dropDatabase();
    console.log(`${seat}: database dropped, restarting ${m.id}`);
    // A restart rebuilds indexes and the first-boot key; the machine id, and so the seat URL, stay.
    execFileSync('fly', ['machine', 'restart', m.id, '-a', SEAT_APP], { stdio: 'inherit' });
    for (let i = 0; i < 30; i++) {
      if (await mongo.client.db(seat).collection('api_keys').findOne({})) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  } finally {
    await mongo.close();
  }
  await cmdSeed(['--seats', `${n}-${n}`]);
}

async function cmdLoadtest(argv: string[]) {
  const k = argValue(argv, '--k', 5);
  const secrets = loadSecrets();
  const mongo = await openMongo(secrets);
  const durations: number[] = [];
  const statuses: Record<string, number> = {};
  const started = Date.now();
  try {
    const results = await forEachSeatAllAtOnce(parseSeats(argv), async (n, base) => {
      const c = new SeatClient(base, await seatKey(mongo.client, seatName(n)));
      const seed = await seedSeat(c);
      const runs = await Promise.all(Array.from({ length: k }, () => runAndWait(c, seed.scenarios['Late Refund Request'], {
        promptId: seed.prompts['Acme Refund Agent'], personaId: seed.personas['Impatient Ivan'], toolFixtureIds: seed.toolSets.acme,
      }, 900_000)));
      for (const r of runs) {
        statuses[r.status] = (statuses[r.status] ?? 0) + 1;
        if (r.status === 'completed') durations.push(r.durationMs);
      }
      return runs.map((r) => r.status).join(',');
    });
    report(results);
  } finally {
    await mongo.close();
  }
  durations.sort((a, b) => a - b);
  const pct = (p: number) => durations.length ? Math.round(durations[Math.min(durations.length - 1, Math.floor(p * durations.length))] / 1000) : null;
  console.log(JSON.stringify({ statuses, completed: durations.length, p50s: pct(0.5), p95s: pct(0.95), wallClockS: Math.round((Date.now() - started) / 1000) }, null, 2));
}

/** Load tests need every seat busy at once, so this opens all proxies together. */
async function forEachSeatAllAtOnce<T>(seats: number[], fn: (n: number, base: string, machineId: string) => Promise<T>) {
  const ms = machines();
  const results: Record<string, T | { error: string }> = {};
  await Promise.all(seats.map(async (n) => {
    const m = ms.get(seatName(n));
    if (!m) { results[seatName(n)] = { error: 'no machine' }; return; }
    const port = LOCAL_SEAT_PORT_BASE + n;
    let proxy: ChildProcess | undefined;
    try {
      proxy = await openProxy(port, SEAT_PORT, `${m.id}.vm.${SEAT_APP}.internal`, SEAT_APP, `http://localhost:${port}/health`);
      results[seatName(n)] = await fn(n, `http://localhost:${port}/api/v1`, m.id);
    } catch (e: any) {
      results[seatName(n)] = { error: e.message };
    } finally {
      proxy?.kill();
    }
  }));
  return results;
}

/**
 * Removes runs left by rehearsals and load tests so attendees start from an empty run history.
 * --release also deletes accounts and frees every seat; never run it once attendees have joined.
 */
async function cmdClearRuns(argv: string[]) {
  const mongo = await openMongo(loadSecrets());
  try {
    for (const n of parseSeats(argv)) {
      const db = mongo.client.db(seatName(n));
      const counts = await Promise.all(['scenarioExecutions', 'run_sets', 'scorecard_results']
        .map(async (col) => (await db.collection(col).deleteMany({})).deletedCount));
      console.log(`${seatName(n)}  removed ${counts.join('/')} runs/run sets/results`);
    }
    if (argv.includes('--release')) {
      const room = mongo.client.db('room');
      await room.collection('accounts').deleteMany({});
      await room.collection('seats').updateMany({}, { $set: { assignedTo: null } });
      console.log('accounts deleted, all seats free');
    }
  } finally {
    await mongo.close();
  }
}

/** Same scheme the dashboard's sign-in checks: scrypt$<salt b64>$<64-byte key b64>. */
async function cmdResetPassword(argv: string[]) {
  const [emailRaw, password] = argv;
  const email = (emailRaw ?? '').trim().toLowerCase();
  if (!email || !password || password.length < 8) {
    throw new Error('usage: reset-password <email> <password of 8+ characters>');
  }
  const salt = randomBytes(16);
  const hash = ['scrypt', salt.toString('base64'), scryptSync(password, salt, 64).toString('base64')].join('$');
  const mongo = await openMongo(loadSecrets());
  try {
    const res = await mongo.client.db('room').collection('accounts').updateOne({ email }, { $set: { passwordHash: hash } });
    if (res.matchedCount === 0) throw new Error(`no account for ${email}`);
    console.log(`${email}: password reset`);
  } finally {
    await mongo.close();
  }
}

function report(results: Record<string, unknown>) {
  const names = Object.keys(results).sort();
  let bad = 0;
  for (const name of names) {
    const r = results[name] as any;
    if (r && typeof r === 'object' && 'error' in r) bad++;
    console.log(`${name}  ${typeof r === 'string' ? r : JSON.stringify(r)}`);
  }
  console.log(`${names.length - bad}/${names.length} seats ok`);
  if (bad) process.exitCode = 1;
}

const [cmd, ...rest] = process.argv.slice(2);
const commands: Record<string, (a: string[]) => Promise<void>> = {
  seed: cmdSeed, status: cmdStatus, reset: cmdReset, 'reset-password': cmdResetPassword, loadtest: cmdLoadtest, 'clear-runs': cmdClearRuns,
};
if (!commands[cmd]) {
  console.error('usage: workshop-room.ts seed|status|reset <n>|loadtest [--seats a-b] [--k 5]');
  process.exit(1);
}
commands[cmd](rest).catch((e) => { console.error(e); process.exit(1); });
