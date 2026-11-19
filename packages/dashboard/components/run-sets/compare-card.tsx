'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useEvalConfig } from '@/lib/eval-config';

const CHANGE_STYLE = {
  improved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  same: '',
  regressed: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
} as const;

const CHANGE_LABEL = { improved: 'Improved', same: 'Same', regressed: 'Regressed' } as const;

/** Before/after per check, against the baseline run set. Regressed checks are highlighted. */
export function CompareCard({ runSetId, baselineId, running }: { runSetId: string; baselineId: string; running: boolean }) {
  const { runSets } = useEvalConfig().client;
  const q = useQuery({
    queryKey: ['run-set-compare', runSetId, baselineId],
    queryFn: () => runSets.compare(runSetId, baselineId),
    refetchInterval: running ? 3000 : false,
  });

  return (
    <Card data-testid="compare-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Before and after</CardTitle>
        <p className="text-sm text-muted-foreground">
          The baseline is &quot;before&quot;; this run set is &quot;after&quot;. Counts are failed runs per check.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : q.isError ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : q.data ? (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-md border px-3 py-1.5">
                Before <strong className="tabular-nums">{q.data.before.passed}/{q.data.before.k}</strong> passed
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="rounded-md border px-3 py-1.5" data-testid="compare-after">
                After <strong className="tabular-nums">{q.data.after.passed}/{q.data.after.k}</strong> passed
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
                {q.data.checks.map((c) => (
                  <TableRow key={c.key} data-change={c.change} className={cn(c.change === 'regressed' && 'bg-red-500/10 hover:bg-red-500/15')}>
                    <TableCell className="font-medium whitespace-normal">{c.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.beforeFailed}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.afterFailed}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={CHANGE_STYLE[c.change]}>{CHANGE_LABEL[c.change]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
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
