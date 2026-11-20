'use client';

import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { RunSetRun } from '@chanl/eval-sdk';

function dotState(run: RunSetRun): { label: string; className: string } {
  if (run.passed === true) return { label: 'Passed', className: 'bg-emerald-500 border-emerald-600' };
  if (run.passed === false) return { label: 'Failed', className: 'bg-red-500 border-red-600' };
  return { label: run.status === 'queued' ? 'Queued' : 'Running', className: 'bg-muted border-border animate-pulse' };
}

/** One dot per run, in order. Each dot opens its run. */
export function RunDots({ runs }: { runs: RunSetRun[] }) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="run-dots">
      {runs.map((run, i) => {
        const s = dotState(run);
        const first = run.failedChecks[0];
        return (
          <Tooltip key={run.executionId}>
            <TooltipTrigger asChild>
              <Link
                href={`/executions/${run.executionId}`}
                aria-label={`Run ${i + 1}: ${s.label}`}
                data-state={s.label.toLowerCase()}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-semibold text-white transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  s.className,
                )}
              >
                {i + 1}
              </Link>
            </TooltipTrigger>
            <TooltipContent>
              Run {i + 1}: {s.label}
              {first ? ` · failed “${first.name}”` : ''}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
