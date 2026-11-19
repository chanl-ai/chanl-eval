import { seats } from './db';

interface SeatStats {
  runsLast10Min: number;
  topFailingChecks: Array<{ name: string; failed: number; total: number }>;
  redteamBroken: Array<{ personaName: string; count: number }>;
}

export interface WallData {
  joined: number;
  seats: number;
  seatsReporting: number;
  runsLast10Min: number;
  topFailingChecks: Array<{ name: string; failed: number; total: number }>;
  attacksThatWorked: Array<{ personaName: string; count: number }>;
  updatedAt: string;
}

const SEAT_TIMEOUT_MS = 4000;

/** Reads every seat's room stats in parallel. A slow or dead seat is skipped, not fatal. */
export async function loadWall(): Promise<WallData> {
  const col = await seats();
  const all = await col.find({}).sort({ seat: 1 }).toArray();
  const joined = all.filter((s) => s.assignedTo).length;

  const results = await Promise.allSettled(
    all.map(async (s) => {
      const res = await fetch(`${s.url.replace(/\/$/, '')}/stats/room`, {
        headers: { 'X-API-Key': s.apiKey },
        cache: 'no-store',
        signal: AbortSignal.timeout(SEAT_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`${s.seat}: ${res.status}`);
      const body = await res.json();
      return (body && 'success' in body && 'data' in body ? body.data : body) as SeatStats;
    }),
  );

  const checks = new Map<string, { failed: number; total: number }>();
  const attacks = new Map<string, number>();
  let runs = 0;
  let reporting = 0;
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    reporting++;
    runs += r.value.runsLast10Min ?? 0;
    for (const c of r.value.topFailingChecks ?? []) {
      const cur = checks.get(c.name) ?? { failed: 0, total: 0 };
      checks.set(c.name, { failed: cur.failed + c.failed, total: cur.total + c.total });
    }
    for (const a of r.value.redteamBroken ?? []) {
      attacks.set(a.personaName, (attacks.get(a.personaName) ?? 0) + a.count);
    }
  }

  return {
    joined,
    seats: all.length,
    seatsReporting: reporting,
    runsLast10Min: runs,
    topFailingChecks: [...checks.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.failed - a.failed)
      .slice(0, 5),
    attacksThatWorked: [...attacks.entries()]
      .map(([personaName, count]) => ({ personaName, count }))
      .sort((a, b) => b.count - a.count),
    updatedAt: new Date().toISOString(),
  };
}
