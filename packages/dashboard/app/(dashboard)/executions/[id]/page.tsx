'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bot, Clock, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScorecardWidget } from '@/components/scorecard/scorecard-widget';
import { BeautifulAvatar } from '@/components/shared/beautiful-avatar';
import { useEvalConfig } from '@/lib/eval-config';
import type { ScoreMetric } from '@/components/scorecard/types';
import type { Execution } from '@chanl/eval-sdk';

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
        const isAgent =
          typeof step.stepId === 'string' && step.stepId.includes('agent');

        return (
          <div
            key={`${step.stepId}-${i}`}
            className={`flex gap-3 ${isAgent ? 'flex-row-reverse' : ''}`}
          >
            <div className="shrink-0 pt-1">
              {isAgent ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              ) : (
                <BeautifulAvatar name="Persona" platform="persona" size="sm" />
              )}
            </div>
            <div className={`max-w-[80%] space-y-1 ${isAgent ? 'items-end text-right' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {isAgent ? 'Agent' : 'Persona'}
                </span>
                {step.duration != null && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                    {formatDuration(step.duration)}
                  </Badge>
                )}
              </div>
              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  isAgent ? 'bg-primary/10 text-foreground' : 'bg-muted text-foreground'
                }`}
              >
                <p className="whitespace-pre-wrap">{text}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      {/* Back link */}
      <Link
        href="/executions"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Runs
      </Link>

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
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                Run {execution.id.slice(-8)}
              </h1>
              <Badge variant={getStatusVariant(execution.status)}>
                {execution.status}
              </Badge>
              {execution.overallScore != null && (
                <Badge variant="outline" className="font-mono">
                  Score: {execution.overallScore}%
                </Badge>
              )}
              {execution.duration != null && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(execution.duration)}
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/')}
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Run Again
            </Button>
          </div>

          {/* Content: Transcript + Scorecard */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {/* Transcript */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Conversation</CardTitle>
              </CardHeader>
              <CardContent>
                {execution.stepResults && execution.stepResults.length > 0 ? (
                  <TranscriptView steps={execution.stepResults as TranscriptStep[]} />
                ) : (
                  <p className="text-muted-foreground text-sm py-4 text-center">
                    No transcript available.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Scorecard */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Scorecard</CardTitle>
              </CardHeader>
              <CardContent>
                <ScorecardWidget
                  metrics={buildMetrics(execution)}
                  overallScorePercentage={
                    execution.overallScore != null ? execution.overallScore : undefined
                  }
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
    </div>
  );
}
