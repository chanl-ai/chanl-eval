'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useEvalConfig } from '@/lib/eval-config';
import { compareChange } from '@/lib/workshop';
import type { RunSet } from '@chanl/eval-sdk';

const CHANGE_STYLE = {
  improved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  same: '',
  regressed: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
} as const;

const CHANGE_LABEL = { improved: 'Improved', same: 'Same', regressed: 'Regressed' } as const;

/**
 * Before/after per check, against the baseline run set. Shown only once both run sets have
 * finished: partial counts made a half-run "after" look like a regression.
 */
export function CompareCard({ runSet, baselineId }: { runSet: RunSet; baselineId: string }) {
  const { runSets } = useEvalConfig().client;
  const baseline = useQuery({
    queryKey: ['run-set', baselineId],
    queryFn: () => runSets.get(baselineId),
    refetchInterval: (query) => (query.state.data?.status === 'completed' ? false : 3000),
  });
  const done = runSet.status === 'completed' && baseline.data?.status === 'completed';
  const q = useQuery({
    // Keyed on progress so the final numbers are fetched once the last run lands.
    queryKey: ['run-set-compare', runSet.id, baselineId, runSet.completed, baseline.data?.completed],
    queryFn: () => runSets.compare(runSet.id, baselineId),
    enabled: done,
  });
  const finished = runSet.completed + (baseline.data?.completed ?? 0);
  const total = runSet.total + (baseline.data?.total ?? 0);

  return (
    <Card data-testid="compare-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Before and after</CardTitle>
        <p className="text-sm text-muted-foreground">
          The baseline is &quot;before&quot;; this run set is &quot;after&quot;. Counts are failed runs per check.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!done ? (
          <div className="space-y-2" data-testid="compare-running">
            <p className="text-sm text-muted-foreground">
              Running: {finished} of {total || '…'} runs finished. The comparison appears when both sets are done.
            </p>
            <Progress value={total > 0 ? (finished / total) * 100 : 0} />
          </div>
        ) : q.isLoading || !baseline.data ? (
          <Skeleton className="h-24 w-full" />
        ) : q.isError ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : q.data ? (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-md border px-3 py-1.5" data-testid="compare-before">
                Before <strong className="tabular-nums">{baseline.data.passed}/{baseline.data.total}</strong> passed
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="rounded-md border px-3 py-1.5" data-testid="compare-after">
                After <strong className="tabular-nums">{runSet.passed}/{runSet.total}</strong> passed
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check</TableHead>
                  <TableHead className="text-right">Before</TableHead>
                  <TableHead className="text-right">After</TableHead>
                  <TableHead>Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.checks.map((c) => {
                  const change = compareChange(c.beforeFailed, c.afterFailed);
                  return (
                    <TableRow key={c.key} data-change={change} className={cn(change === 'regressed' && 'bg-red-500/10 hover:bg-red-500/15')}>
                      <TableCell className="font-medium whitespace-normal">{c.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.beforeFailed}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.afterFailed}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={CHANGE_STYLE[change]}>{CHANGE_LABEL[change]}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {q.data.checks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No checks failed in either run set.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
