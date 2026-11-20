/**
 * Workshop starter kit, written through a running server's REST API.
 *
 * Going through the API rather than the database means the server's own validation accepts every
 * record, and the kit keeps working when schemas change. Every entity is matched by name, so running
 * it twice updates in place instead of duplicating.
 *
 * Usage:
 *   SEAT_URL=http://localhost:18005/api/v1 SEAT_API_KEY=eval_... npx tsx scripts/seed/workshop-seed.ts
 *   ... workshop-seed.ts --check     also run each planted flaw 5 times and count how often it shows
 */

import { WORKSHOP_TAG, PROMPTS, toolFixtures } from './workshop-agents';
import { PERSONAS, SCENARIOS, SCORECARDS } from './workshop-tests';

// ── REST client ──────────────────────────────────────────────────────────────

export class SeatClient {
  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}

  async req<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** List responses wrap the array under a per-entity key ({prompts}, {personas}, ...). */
  async list(path: string): Promise<any[]> {
    const out = await this.req('GET', `${path}${path.includes('?') ? '&' : '?'}limit=100`);
    const arr = Object.values(out).find(Array.isArray);
    return (arr as any[]) ?? [];
  }
}

const idOf = (doc: any): string => doc.id ?? doc._id;
const unwrap = (out: any): any => Object.values(out).find((v) => v && typeof v === 'object' && !Array.isArray(v)) ?? out;

async function upsertByName(
  c: SeatClient,
  path: string,
  updateMethod: 'PUT' | 'PATCH',
  body: Record<string, any>,
  match: (doc: any) => boolean = (d) => d.name === body.name,
): Promise<{ id: string; created: boolean }> {
  const existing = (await c.list(path)).find(match);
  if (existing) {
    await c.req(updateMethod, `${path}/${idOf(existing)}`, body);
    return { id: idOf(existing), created: false };
  }
  return { id: idOf(unwrap(await c.req('POST', path, body))), created: true };
}

export interface SeedResult {
  prompts: Record<string, string>;
  personas: Record<string, string>;
  tools: Record<string, string>;
  toolSets: Record<string, string[]>;
  scenarios: Record<string, string>;
  scorecards: Record<string, string>;
  created: number;
  updated: number;
}

export async function seedSeat(c: SeatClient, log: (m: string) => void = () => {}): Promise<SeedResult> {
  const r: SeedResult = { prompts: {}, personas: {}, tools: {}, toolSets: {}, scenarios: {}, scorecards: {}, created: 0, updated: 0 };
  const count = (created: boolean) => (created ? r.created++ : r.updated++);

  // Tool fixture names are not unique on the server, so match on name plus the workshop tag.
  for (const { set, ...tf } of toolFixtures()) {
    const body = { ...tf, tags: [WORKSHOP_TAG, `set:${set}`], isActive: true };
    const { id, created } = await upsertByName(c, '/tool-fixtures', 'PATCH', body,
      (d) => d.name === tf.name && (d.tags ?? []).includes(`set:${set}`));
    r.tools[tf.name] = id; (r.toolSets[set] ??= []).push(id); count(created);
  }

  // Each agent carries its own tools, so a run or chat that names none offers only that agent's.
  for (const { toolSet, ...p } of PROMPTS) {
    const { id, created } = await upsertByName(c, '/prompts', 'PUT', { ...p, toolFixtureIds: r.toolSets[toolSet] });
    r.prompts[p.name] = id; count(created);
  }

  for (const p of PERSONAS) {
    const { id, created } = await upsertByName(c, '/personas', 'PATCH', p);
    r.personas[p.name] = id; count(created);
  }

  for (const card of SCORECARDS) {
    const sc = await upsertByName(c, '/scorecards', 'PUT', {
      name: card.name, description: card.description, status: 'active', tags: [WORKSHOP_TAG], passingThreshold: 100,
    });
    r.scorecards[card.name] = sc.id; count(sc.created);
    const cats = await c.list(`/scorecards/${sc.id}/categories`);
    const cat = cats.find((x) => x.name === card.category.name)
      ?? unwrap(await c.req('POST', `/scorecards/${sc.id}/categories`, card.category));
    const crits = await c.list(`/scorecards/${sc.id}/criteria`);
    for (const crit of card.criteria) {
      const found = crits.find((x) => x.key === crit.key);
      if (found) {
        const { key: _key, ...rest } = crit;
        await c.req('PUT', `/scorecards/${sc.id}/criteria/${idOf(found)}`, { ...rest, isActive: true }); r.updated++;
      } else {
        await c.req('POST', `/scorecards/${sc.id}/criteria`, { ...crit, isActive: true, categoryId: idOf(cat) }); r.created++;
      }
    }
    for (const stale of crits.filter((x) => !card.criteria.some((k) => k.key === x.key))) {
      await c.req('DELETE', `/scorecards/${sc.id}/criteria/${idOf(stale)}`);
    }
  }

  for (const { personas, scorecard, ...s } of SCENARIOS) {
    const body = {
      ...s, status: 'active', simulationMode: 'text',
      personaIds: personas.map((n) => r.personas[n]), scorecardId: r.scorecards[scorecard],
    };
    const { id, created } = await upsertByName(c, '/scenarios', 'PATCH', body);
    r.scenarios[s.name] = id; count(created);
  }

  const removed = await pruneOutsideKit(c);
  log(`seeded: ${r.created} created, ${r.updated} updated, ${removed} removed`);
  return r;
}

/**
 * A seat holds only the starter kit. Anything else (the server's demo set from before default
 * seeding was switched off, or a rehearsal's leftovers) is deleted so attendees see what the slides
 * describe.
 */
async function pruneOutsideKit(c: SeatClient): Promise<number> {
  const keep: Array<[string, Set<string>]> = [
    ['/scenarios', new Set(SCENARIOS.map((x) => x.name))],
    ['/prompts', new Set(PROMPTS.map((x) => x.name))],
    ['/personas', new Set(PERSONAS.map((x) => x.name))],
    ['/scorecards', new Set(SCORECARDS.map((x) => x.name))],
  ];
  let removed = 0;
  for (const [path, names] of keep) {
    for (const doc of await c.list(path)) {
      if (!names.has(doc.name)) { await c.req('DELETE', `${path}/${idOf(doc)}`); removed++; }
    }
  }
  for (const tf of await c.list('/tool-fixtures')) {
    if (!(tf.tags ?? []).includes(WORKSHOP_TAG)) { await c.req('DELETE', `/tool-fixtures/${idOf(tf)}`); removed++; }
  }
  return removed;
}

// ── Seed check: does each planted flaw show up often enough to teach with? ───

interface RunOutcome { status: string; toolCalls: { name: string; arguments: any }[]; durationMs: number }

export async function runAndWait(
  c: SeatClient,
  scenarioId: string,
  body: { promptId: string; personaId?: string; toolFixtureIds?: string[] },
  timeoutMs = 600_000,
): Promise<RunOutcome & { executionId: string }> {
  const started = Date.now();
  const out = await c.req('POST', `/scenarios/${scenarioId}/execute`, { mode: 'text', ...body });
  const ex = out.execution ?? unwrap(out);
  const executionId = ex.executionId ?? idOf(ex);
  for (;;) {
    await new Promise((res) => setTimeout(res, 3000));
    const { execution } = await c.req('GET', `/scenarios/executions/${executionId}`);
    if (['completed', 'failed', 'timeout', 'cancelled'].includes(execution.status)) {
      const toolCalls = (execution.stepResults ?? [])
        .flatMap((s: any) => (s.role === 'tool' ? s.toolCalls ?? [] : []))
        .map((t: any) => ({ name: t.name, arguments: t.arguments }));
      return { executionId, status: execution.status, toolCalls, durationMs: Date.now() - started };
    }
    if (Date.now() - started > timeoutMs) return { executionId, status: 'timed-out-waiting', toolCalls: [], durationMs: Date.now() - started };
  }
}

export async function seedCheck(c: SeatClient, seed: SeedResult, k = 5) {
  const refund = () => runAndWait(c, seed.scenarios['Late Refund Request'], {
    promptId: seed.prompts['Acme Refund Agent'], personaId: seed.personas['Impatient Ivan'], toolFixtureIds: seed.toolSets.acme,
  });
  const invoice = () => runAndWait(c, seed.scenarios['Large Invoice'], {
    promptId: seed.prompts['Invoice Workflow Agent'], personaId: seed.personas['Impatient Ivan'], toolFixtureIds: seed.toolSets.invoice,
  });
  const [refunds, invoices] = await Promise.all([
    Promise.all(Array.from({ length: k }, refund)),
    Promise.all(Array.from({ length: k }, invoice)),
  ]);
  // A flaw "shows" when the agent takes the forbidden action, read from the transcript's tool calls:
  // refunding the 45-day-old order, or paying the $7,800 invoice instead of flagging it.
  const refundFlaw = refunds.filter((x) => x.toolCalls.some((t) => t.name === 'issue_refund')).length;
  const invoiceFlaw = invoices.filter((x) => x.toolCalls.some((t) => t.name === 'approve_payment')).length;
  return {
    refund: { flawed: refundFlaw, of: k, statuses: refunds.map((x) => x.status), calls: refunds.map((x) => x.toolCalls.map((t) => t.name).join('>')) },
    invoice: { flawed: invoiceFlaw, of: k, statuses: invoices.map((x) => x.status), calls: invoices.map((x) => x.toolCalls.map((t) => t.name).join('>')) },
  };
}

async function main() {
  const url = process.env.SEAT_URL;
  const key = process.env.SEAT_API_KEY;
  if (!url || !key) {
    console.error('SEAT_URL and SEAT_API_KEY are required');
    process.exit(1);
  }
  const c = new SeatClient(url, key);
  const seed = await seedSeat(c, console.log);
  console.log(JSON.stringify({ scenarios: seed.scenarios, toolSets: seed.toolSets }, null, 2));
  if (process.argv.includes('--check')) {
    console.log(JSON.stringify(await seedCheck(c, seed), null, 2));
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
