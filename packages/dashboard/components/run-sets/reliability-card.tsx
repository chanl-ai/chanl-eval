'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RunDots } from '@/components/run-sets/run-dots';
import type { RunSet } from '@chanl/eval-sdk';

type RunSetLabel = NonNullable<RunSet['label']>;

const LABEL_STYLE: Record<RunSetLabel, string> = {
  Reliable: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  Flaky: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  Broken: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
};

export function RunSetLabelBadge({ label }: { label: RunSetLabel | null }) {
  if (!label) return <Badge variant="outline">In progress</Badge>;
  return (
    <Badge variant="outline" className={LABEL_STYLE[label]} data-testid="runset-label">
      {label}
    </Badge>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

export function ReliabilityCard({ runSet }: { runSet: RunSet }) {
  const done = runSet.status === 'completed';
  return (
    <Card data-testid="reliability-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex flex-wrap items-center gap-2">
          Reliability
          <RunSetLabelBadge label={runSet.label} />
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {done
            ? 'Each dot is one run. Open a passing and a failing dot to compare them.'
            : `Running: ${runSet.completed} of ${runSet.total} finished. This page updates every 3 seconds.`}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <RunDots runs={runSet.runs} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Passed" value={<span data-testid="runset-passed">{runSet.passed}/{runSet.total}</span>} />
          <Stat label="Passed every run" value={done ? (runSet.passK ? 'Yes' : 'No') : '—'} />
          <Stat label="Passed at least once" value={done ? (runSet.passAtK ? 'Yes' : 'No') : '—'} />
          <Stat
            label="Check failed most often"
            value={
              runSet.mostFailedCheck ? (
                <span className="text-sm font-medium" data-testid="most-failed-check">
                  {runSet.mostFailedCheck.name}{' '}
                  <span className="text-muted-foreground">×{runSet.mostFailedCheck.failed}</span>
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">None</span>
              )
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
