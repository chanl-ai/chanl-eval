'use client';

/**
 * Run Detail Page — shows transcript + scorecard results for a completed execution.
 *
 * Two-column layout adapted from chanl-admin's call detail pattern:
 * - Left: Conversation transcript with search
 * - Right: Scorecard results with expandable criteria
 *
 * Data comes from the eval SDK's executions.get() endpoint.
 */

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Bot,
  ClipboardCheck,
  Clock,
  Loader2,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Hash,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageLayout } from '@/components/shared/page-layout';
import { DeleteDialog } from '@/components/shared/delete-dialog';
import { TranscriptView, type TranscriptMessage } from '@/components/transcript/transcript-view';
import { ScorecardWidget } from '@/components/scorecard/scorecard-widget';
import { ShareResults } from '@/components/share-results';
import { useFirstRunPrompt } from '@/components/first-run-prompt';
import { useEvalConfig } from '@/lib/eval-config';
import type { ScoreMetric, ScorecardCriterionDisplay } from '@/components/scorecard/types';
import type { Execution, Scorecard, ScorecardResult } from '@chanl/eval-sdk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number | undefined): string {
  if (ms == null) return '--';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
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

function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default';
    case 'running':
    case 'queued':
      return 'secondary';
    case 'failed':
    case 'error':
    case 'timeout':
      return 'destructive';
    default:
      return 'outline';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-3.5 w-3.5" />;
    case 'failed':
    case 'error':
    case 'timeout':
      return <XCircle className="h-3.5 w-3.5" />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Data mapping: execution → transcript messages
// ---------------------------------------------------------------------------

function executionToMessages(execution: Execution): TranscriptMessage[] {
  if (!execution.stepResults || execution.stepResults.length === 0) return [];

  return execution.stepResults
    .filter((step) => step.actualResponse || (step as Record<string, unknown>).role === 'tool')
    .map((step, i) => {
      const stepAny = step as Record<string, unknown>;
      const role = stepAny.role as string | undefined;

      // Tool call step — use structured toolCalls data
      if (role === 'tool') {
        const toolCalls = stepAny.toolCalls as Array<{ name: string; arguments: Record<string, unknown>; result: unknown }> | undefined;
        if (toolCalls?.length) {
          return {
            id: `${step.stepId}-${i}`,
            role: 'tool' as const,
            content: '',
            toolCalls: toolCalls.map((tc) => ({ name: tc.name, arguments: tc.arguments, result: tc.result })),
          };
        }
        // Fallback: parse JSON from actualResponse
        try {
          const parsed = JSON.parse(step.actualResponse || '{}');
          return {
            id: `${step.stepId}-${i}`,
            role: 'tool' as const,
            content: '',
            toolCalls: [{ name: parsed.name, arguments: parsed.arguments, result: parsed.result }],
          };
        } catch {
          // Can't parse — show as raw text
        }
      }

      // Persona or agent step
      const isPersona = role === 'persona' || (step.stepId?.includes('persona') ?? false);
      return {
        id: `${step.stepId}-${i}`,
        role: (isPersona ? 'persona' : 'agent') as 'agent' | 'persona',
        content: step.actualResponse!,
        duration: step.duration,
        score: step.score,
        status: step.status,
      };
    });
}

// ---------------------------------------------------------------------------
// Data mapping: ScorecardResult → ScoreMetric[] (real scorecard evaluation)
// ---------------------------------------------------------------------------

function scorecardResultToMetrics(result: ScorecardResult): ScoreMetric[] {
  const criteriaResults = result.criteriaResults || [];
  if (criteriaResults.length === 0) return [];

  // Group by category (like chanl-admin's scorecard-view)
  const categoryMap = new Map<string, { name: string; criteria: ScorecardCriterionDisplay[] }>();

  for (const cr of criteriaResults) {
    const catId = cr.categoryId || 'uncategorized';
    if (!categoryMap.has(catId)) {
      categoryMap.set(catId, { name: cr.categoryName || 'General', criteria: [] });
    }
    categoryMap.get(catId)!.criteria.push({
      name: cr.criteriaName,
      passed: cr.passed,
      explanation: cr.reasoning,
      evidence: cr.evidence?.length > 0 ? cr.evidence : undefined,
    });
  }

  return Array.from(categoryMap.values()).map(({ name, criteria }) => {
    const passed = criteria.filter((c) => c.passed).length;
    return {
      name,
      score: passed,
      maxScore: criteria.length,
      status: passed >= criteria.length * 0.5 ? 'pass' as const : 'fail' as const,
      criteria,
    };
  });
}

// ---------------------------------------------------------------------------
// Data mapping: embedded scorecardResults → ScoreMetric[]
// ---------------------------------------------------------------------------

function embeddedResultsToMetrics(result: {
  criteriaResults: Array<{
    criteriaId: string;
    criteriaName?: string;
    categoryId?: string;
    categoryName?: string;
    passed: boolean;
    reasoning?: string;
    evidence?: string[];
  }>;
}): ScoreMetric[] {
  if (!result.criteriaResults?.length) return [];

  const categoryMap = new Map<string, { name: string; criteria: ScorecardCriterionDisplay[] }>();
  for (const cr of result.criteriaResults) {
    const catId = cr.categoryId || 'uncategorized';
    if (!categoryMap.has(catId)) {
      categoryMap.set(catId, { name: cr.categoryName || 'General', criteria: [] });
    }
    categoryMap.get(catId)!.criteria.push({
      name: cr.criteriaName || cr.criteriaId,
      passed: cr.passed,
      explanation: cr.reasoning,
      evidence: cr.evidence?.length ? cr.evidence : undefined,
    });
  }

  return Array.from(categoryMap.values()).map(({ name, criteria }) => {
    const passed = criteria.filter((c) => c.passed).length;
    return {
      name,
      score: passed,
      maxScore: criteria.length,
      status: passed >= criteria.length * 0.5 ? 'pass' as const : 'fail' as const,
      criteria,
    };
  });
}

// ---------------------------------------------------------------------------
// Stat Cards
// ---------------------------------------------------------------------------

function StatCards({ execution }: { execution: Execution }) {
  const steps = execution.stepResults || [];
  const passedSteps = steps.filter(
    (s) => s.status === 'completed' || (s.score != null && s.score > 0),
  ).length;
  const failedSteps = steps.filter(
    (s) => s.status === 'failed' || s.status === 'timeout' || s.status === 'skipped',
  ).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">Steps</div>
              <div className="text-lg font-semibold tabular-nums">{steps.length}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <div>
              <div className="text-xs text-muted-foreground">Passed</div>
              <div className="text-lg font-semibold tabular-nums">{passedSteps}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <div>
              <div className="text-xs text-muted-foreground">Failed</div>
              <div className="text-lg font-semibold tabular-nums">{failedSteps}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">Duration</div>
              <div className="text-lg font-semibold tabular-nums">
                {formatDuration(execution.duration)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function RunDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Skeleton className="xl:col-span-3 h-96 rounded-lg" />
        <Skeleton className="xl:col-span-2 h-96 rounded-lg" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const { client } = useEvalConfig();
  const qc = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch execution data — auto-poll while running/queued
  const q = useQuery({
    queryKey: ['execution', id],
    queryFn: () => client.executions.get(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'running' || status === 'queued' ? 2000 : false;
    },
  });

  const execution = q.data;
  const isActive = execution?.status === 'running' || execution?.status === 'queued';

  // Fetch scenario name for share dialog
  const scenarioQ = useQuery({
    queryKey: ['scenario', execution?.scenarioId],
    queryFn: () => client.scenarios.get(execution!.scenarioId!),
    enabled: !!execution?.scenarioId,
  });
  const scenarioName = scenarioQ.data?.name;

  // First-run star/follow prompt
  useFirstRunPrompt(execution?.status === 'completed');

  // Scorecard evaluation state
  const [selectedScorecardId, setSelectedScorecardId] = useState<string>('');

  // Fetch scorecards list for the picker
  const scorecardsQ = useQuery({
    queryKey: ['scorecards'],
    queryFn: () => client.scorecards.list({ limit: 50 }),
    staleTime: 60_000,
  });
  const scorecards = scorecardsQ.data?.scorecards ?? [];

  // Check if execution already has embedded scorecardResults
  const embeddedResults = (execution as any)?.scorecardResults as {
    scorecardId: string;
    overallScore: number;
    passed: boolean;
    criteriaResults: Array<{
      criteriaId: string;
      criteriaName?: string;
      categoryId?: string;
      categoryName?: string;
      passed: boolean;
      reasoning?: string;
      evidence?: string[];
    }>;
  } | undefined;

  // Also check separate scorecard results collection
  const execUuid = (execution as any)?.executionId as string | undefined;
  const scorecardQ = useQuery({
    queryKey: ['scorecard-results', execUuid],
    queryFn: () => client.scorecards.getResultsByExecution(execUuid!),
    enabled: !!execUuid,
    staleTime: 300_000,
  });
  const scorecardResult = scorecardQ.data?.[0] ?? null;

  // Use embedded results first, fall back to separate collection
  const hasEvaluation = !!(embeddedResults || scorecardResult);
  const metrics = scorecardResult
    ? scorecardResultToMetrics(scorecardResult)
    : embeddedResults
      ? embeddedResultsToMetrics(embeddedResults)
      : [];
  // overallScore from scorecards-core is on a 0-10 scale → multiply by 10 for percentage
  const displayScore = embeddedResults?.overallScore != null
    ? Math.round(embeddedResults.overallScore * 10)
    : scorecardResult?.overallScore != null
      ? Math.round(scorecardResult.overallScore * 10)
      : execution?.overallScore ?? undefined;

  const scorecardSummary = (execution as any)?.scorecardSummary as string | undefined;

  const messages = execution ? executionToMessages(execution) : [];

  // Evaluate mutation — server resolves API key from env vars
  const evaluateMutation = useMutation({
    mutationFn: (scorecardId: string) =>
      client.executions.evaluate(id, { scorecardId }),
    onSuccess: () => {
      toast.success('Scorecard evaluation complete');
      void qc.invalidateQueries({ queryKey: ['execution', id] });
      void qc.invalidateQueries({ queryKey: ['scorecard-results', execUuid] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Evaluation failed');
    },
  });

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await client.executions.cancel(id);
      toast.success('Run deleted');
      void qc.invalidateQueries({ queryKey: ['executions'] });
      router.push('/executions');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <PageLayout
      backHref="/executions"
      title={execution ? `Run ${execution.id.slice(-8)}` : 'Run Detail'}
      description={execution ? formatDate(execution.createdAt) : 'Loading...'}
      titleExtra={
        execution ? (
          <div className="flex items-center gap-2">
            <Badge variant={getStatusVariant(execution.status)} className="gap-1">
              {isActive ? <Loader2 className="h-3 w-3 animate-spin" /> : getStatusIcon(execution.status)}
              {execution.status}
            </Badge>
            {displayScore != null && (
              <Badge variant="outline" className="font-mono tabular-nums">
                {displayScore}%
              </Badge>
            )}
          </div>
        ) : undefined
      }
      actions={
        execution ? (
          <div className="flex items-center gap-2">
            <ShareResults
              metrics={metrics}
              overallScore={displayScore}
              scenarioName={scenarioName}
              executionDate={execution.createdAt}
              turnCount={messages.length}
              duration={formatDuration(execution.duration ?? (execution.endTime && execution.startTime ? new Date(execution.endTime).getTime() - new Date(execution.startTime).getTime() : undefined))}
            />
            <Button variant="outline" size="sm" onClick={() => router.push('/playground')} disabled={isActive}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Run Again
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)} disabled={isActive} data-testid="delete-run">
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <RunDetailSkeleton />
      ) : q.isError ? (
        <Card className="border-destructive/30">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-3" />
            <p className="text-destructive text-sm font-medium">Failed to load execution</p>
            <p className="text-muted-foreground text-xs mt-1">
              {(q.error as Error).message}
            </p>
          </CardContent>
        </Card>
      ) : execution ? (
        <div className="space-y-6">
          {/* Stat cards */}
          <StatCards execution={execution} />

          {/* Main content: Transcript + Scorecard */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            {/* Transcript — wider column */}
            <Card className="xl:col-span-3">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  Conversation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TranscriptView messages={messages} />
              </CardContent>
            </Card>

            {/* Scorecard — narrower column */}
            <Card className="xl:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium">Scorecard</CardTitle>
                  {hasEvaluation && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        setSelectedScorecardId('');
                        // Force re-render to show picker
                        void qc.setQueryData(['execution', id], (prev: Execution | undefined) => {
                          if (!prev) return prev;
                          return { ...prev, scorecardResults: undefined };
                        });
                        void qc.invalidateQueries({ queryKey: ['scorecard-results', execUuid] });
                      }}
                      data-testid="re-evaluate-button"
                    >
                      <RotateCcw className="mr-1.5 h-3 w-3" />
                      Re-evaluate
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isActive ? (
                  /* State 0: Running */
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">Test is running...</p>
                    <p className="text-xs text-muted-foreground mt-1">Waiting for the conversation to complete. This page updates automatically.</p>
                  </div>
                ) : evaluateMutation.isPending ? (
                  /* State 2: Evaluating */
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">Evaluating conversation...</p>
                    <p className="text-xs text-muted-foreground mt-1">LLM judge is scoring each criterion. This may take 10-30 seconds.</p>
                  </div>
                ) : hasEvaluation && metrics.length > 0 ? (
                  /* State 3: Results */
                  <ScorecardWidget
                    metrics={metrics}
                    overallScorePercentage={displayScore}
                    summary={scorecardSummary}
                  />
                ) : (
                  /* State 1: No evaluation — show picker */
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <ClipboardCheck className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No evaluation yet</p>
                    <p className="text-xs text-muted-foreground mt-1 mb-4">
                      Select a scorecard to evaluate this conversation
                    </p>
                    {/* Server resolves API key from environment — no client key needed */}
                    <div className="w-full max-w-[220px] space-y-3">
                      <Select value={selectedScorecardId} onValueChange={setSelectedScorecardId}>
                        <SelectTrigger data-testid="scorecard-picker">
                          <SelectValue placeholder="Select scorecard..." />
                        </SelectTrigger>
                        <SelectContent>
                          {scorecards.map((sc: Scorecard) => (
                            <SelectItem key={sc.id} value={sc.id}>{sc.name}</SelectItem>
                          ))}
                          {scorecards.length === 0 && (
                            <SelectItem value="_none" disabled>No scorecards found</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <Button
                        className="w-full"
                        size="sm"
                        disabled={!selectedScorecardId || evaluateMutation.isPending || isActive}
                        onClick={() => evaluateMutation.mutate(selectedScorecardId)}
                        data-testid="evaluate-button"
                      >
                        <ClipboardCheck className="mr-2 h-3.5 w-3.5" />
                        Evaluate
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Errors */}
          {execution.errorMessages && execution.errorMessages.length > 0 && (
            <Card className="border-destructive/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Errors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {execution.errorMessages.map((msg, i) => (
                    <li key={i} className="text-sm text-destructive/80 flex items-start gap-2">
                      <span className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-destructive/60" />
                      {msg}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityType="Run"
        entityName={execution ? `Run ${execution.id.slice(-8)}` : undefined}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </PageLayout>
  );
}
