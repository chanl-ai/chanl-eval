'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useEvalConfig } from '@/lib/eval-config';
import type { Execution } from '@chanl/eval-sdk';

function formatRelativeDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatDuration(ms: number | undefined): string {
  if (ms == null) return '--';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default';
    case 'running':
    case 'pending':
      return 'secondary';
    case 'failed':
    case 'error':
      return 'destructive';
    default:
      return 'outline';
  }
}

function getScoreDisplay(score: number | undefined): { label: string; className: string } {
  if (score == null) return { label: '--', className: 'text-muted-foreground' };
  if (score >= 80) return { label: `${score}%`, className: 'text-chart-6' };
  if (score >= 60) return { label: `${score}%`, className: 'text-warning' };
  return { label: `${score}%`, className: 'text-destructive' };
}

export default function RunsListPage() {
  const { client } = useEvalConfig();

  const q = useQuery({
    queryKey: ['executions'],
    queryFn: () => client.executions.list({ limit: 50 }),
  });

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Test Runs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          History of all scenario executions
        </p>
      </div>

      {q.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-destructive text-sm">{(q.error as Error).message}</p>
          </CardContent>
        </Card>
      ) : (q.data?.executions ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ScrollText}
              title="No test runs yet"
              description="Run your first scenario test from the playground to see results here."
              action={{ label: 'Go to Playground', href: '/' }}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {(q.data?.executions ?? []).map((execution: Execution) => {
                const ref = execution.id;
                const score = getScoreDisplay(execution.overallScore);
                return (
                  <Link
                    key={ref}
                    href={`/executions/${encodeURIComponent(ref)}`}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50 lg:px-6"
                    data-testid={`run-row-${ref}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {execution.scenarioId
                            ? `Scenario ${execution.scenarioId.slice(-6)}`
                            : 'Unnamed run'}
                        </span>
                        {execution.personaId && (
                          <span className="text-xs text-muted-foreground truncate">
                            with {execution.personaId.slice(-6)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <code className="text-[11px] text-muted-foreground font-mono">
                          {ref.slice(-8)}
                        </code>
                        <span className="text-[11px] text-muted-foreground">
                          {formatRelativeDate(execution.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-sm font-semibold tabular-nums ${score.className}`}>
                        {score.label}
                      </span>
                      <Badge variant={getStatusVariant(execution.status)} className="text-xs">
                        {execution.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono tabular-nums w-14 text-right">
                        {formatDuration(execution.duration)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
