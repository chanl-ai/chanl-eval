'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { WallData } from '@/lib/room/wall';

async function fetchWall(): Promise<WallData> {
  const res = await fetch('/api/wall', { cache: 'no-store' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? `Wall failed (${res.status})`);
  return res.json();
}

function Big({ label, value, testId }: { label: string; value: number | string; testId: string }) {
  return (
    <Card>
      <CardContent className="py-6">
        <p className="text-lg text-muted-foreground">{label}</p>
        <p className="text-6xl lg:text-7xl font-bold tabular-nums" data-testid={testId}>{value}</p>
      </CardContent>
    </Card>
  );
}

/** Facilitator's projector view. Large type; refreshes every 15 seconds. */
export function RoomWall() {
  const q = useQuery({ queryKey: ['room-wall'], queryFn: fetchWall, refetchInterval: 15_000 });
  const d = q.data;

  return (
    <main className="min-h-svh bg-background p-4 lg:p-10 space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl lg:text-5xl font-bold tracking-tight">Room</h1>
        <p className="text-sm text-muted-foreground" data-testid="wall-updated">
          {d ? `Updated ${new Date(d.updatedAt).toLocaleTimeString()} · ${d.seatsReporting} of ${d.seats} seats reporting` : q.isError ? (q.error as Error).message : 'Loading...'}
        </p>
      </div>
      {!d ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-40" /><Skeleton className="h-40" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Big label="People joined" value={d.joined} testId="wall-joined" />
            <Big label="Runs in the last 10 minutes" value={d.runsLast10Min} testId="wall-runs" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-2xl">Top failing checks</CardTitle></CardHeader>
              <CardContent>
                {d.topFailingChecks.length === 0 ? (
                  <p className="text-xl text-muted-foreground">No failed checks yet.</p>
                ) : (
                  <ol className="space-y-3" data-testid="wall-checks">
                    {d.topFailingChecks.map((c, i) => (
                      <li key={c.name} className="flex items-baseline justify-between gap-4 text-2xl">
                        <span className="min-w-0 break-words"><span className="text-muted-foreground mr-2">{i + 1}.</span>{c.name}</span>
                        <span className="tabular-nums font-semibold shrink-0">{c.failed}<span className="text-muted-foreground text-lg">/{c.total}</span></span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-2xl">Attacks that worked</CardTitle></CardHeader>
              <CardContent>
                {d.attacksThatWorked.length === 0 ? (
                  <p className="text-xl text-muted-foreground">No attack has worked yet.</p>
                ) : (
                  <ul className="space-y-3" data-testid="wall-attacks">
                    {d.attacksThatWorked.map((a) => (
                      <li key={a.personaName} className="flex items-baseline justify-between gap-4 text-2xl">
                        <span className="min-w-0 break-words">{a.personaName}</span>
                        <span className="tabular-nums font-semibold shrink-0">{a.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-2xl">Run ×5 results by team</CardTitle></CardHeader>
            <CardContent>
              {d.teams.length === 0 ? (
                <p className="text-xl text-muted-foreground">No one has run ×5 yet.</p>
              ) : (
                <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-3" data-testid="wall-teams">
                  {d.teams.map((t) => (
                    <li key={t.name} className="flex items-baseline justify-between gap-4 text-2xl">
                      <span className="min-w-0 break-words">{t.name}</span>
                      <span className="tabular-nums font-semibold shrink-0">
                        {t.passed}<span className="text-muted-foreground text-lg">/{t.total}{t.running ? ' …' : ''}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
