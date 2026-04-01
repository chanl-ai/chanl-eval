'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bot, Clock, RotateCcw, ScrollText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScorecardWidget } from '@/components/scorecard/scorecard-widget';
import { BeautifulAvatar } from '@/components/shared/beautiful-avatar';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig } from '@/lib/eval-config';
import type { ScoreMetric } from '@/components/scorecard/types';
import type { Execution } from '@chanl/eval-sdk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number | undefined): string {
  if (ms == null) return '--';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed': return 'default';
    case 'running':
    case 'pending': return 'secondary';
    case 'failed':
    case 'error': return 'destructive';
    default: return 'outline';
  }
}

function buildMetrics(execution: Execution): ScoreMetric[] {
  if (!execution.stepResults || execution.stepResults.length === 0) return [];
  const passed = execution.stepResults.filter((s) => s.score != null && s.score > 0).length;
  const total = execution.stepResults.length;
  return [
    {
      name: 'Conversation Quality',
      score: passed,
      maxScore: total,
      status: passed >= total * 0.8 ? 'pass' : 'fail',
    },
  ];
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Transcript step
// ---------------------------------------------------------------------------

interface TranscriptStep {
  stepId: string;
  status: string;
  actualResponse?: string;
  expectedResponse?: string;
  score?: number;
  duration?: number;
}

function TranscriptView({ steps }: { steps: TranscriptStep[] }) {
  return (
    <div className="scrollbar-thin max-h-[60vh] space-y-4 overflow-y-auto pr-1">
      {steps.map((step, i) => {
        const text = step.actualResponse;
        if (!text) return null;
        const isAgent = typeof step.stepId === 'string' && step.stepId.includes('agent');

        return (
          <div key={`${step.stepId}-${i}`} className="flex gap-3">
            <div className="shrink-0 pt-0.5">
              {isAgent ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </div>
              ) : (
                <BeautifulAvatar name="Persona" platform="persona" size="sm" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {isAgent ? 'Agent' : 'Persona'}
                </span>
                {step.duration != null && (
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {formatDuration(step.duration)}
                  </span>
                )}
              </div>
              <div className={`rounded-lg px-3 py-2 text-sm ${isAgent ? 'bg-primary/5' : 'bg-muted'}`}>
                <p className="whitespace-pre-wrap">{text}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const { client } = useEvalConfig();

  const q = useQuery({
    queryKey: ['execution', id],
    queryFn: () => client.executions.get(id),
    enabled: !!id,
  });

  const execution = q.data;

  return (
    <PageLayout
      backHref="/executions"
      title={execution ? `Run ${execution.id.slice(-8)}` : 'Run Detail'}
      description={execution ? formatDate(execution.createdAt) : 'Loading...'}
      actions={
        execution ? (
          <Button variant="outline" size="sm" onClick={() => router.push('/')}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Run Again
          </Button>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : q.isError ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-destructive text-sm">{(q.error as Error).message}</p>
          </CardContent>
        </Card>
      ) : execution ? (
        <>
          {/* Status bar */}
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={getStatusVariant(execution.status)}>{execution.status}</Badge>
            {execution.overallScore != null && (
              <Badge variant="outline" className="font-mono tabular-nums">
                Score: {execution.overallScore}%
              </Badge>
            )}
            {execution.duration != null && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span className="tabular-nums">{formatDuration(execution.duration)}</span>
              </div>
            )}
          </div>

          {/* Content: Transcript + Scorecard */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Conversation</CardTitle>
              </CardHeader>
              <CardContent>
                {execution.stepResults && execution.stepResults.length > 0 ? (
                  <TranscriptView steps={execution.stepResults as TranscriptStep[]} />
                ) : (
                  <p className="text-muted-foreground text-sm py-8 text-center">
                    No transcript available.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Scorecard</CardTitle>
              </CardHeader>
              <CardContent>
                <ScorecardWidget
                  metrics={buildMetrics(execution)}
                  overallScorePercentage={execution.overallScore ?? undefined}
                />
              </CardContent>
            </Card>
          </div>

          {/* Errors */}
          {execution.errorMessages && execution.errorMessages.length > 0 && (
            <Card className="border-destructive/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium text-destructive">Errors</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {execution.errorMessages.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </PageLayout>
  );
}
