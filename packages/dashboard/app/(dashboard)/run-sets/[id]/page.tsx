'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, GitCompare } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageLayout } from '@/components/shared/page-layout';
import { CompareCard } from '@/components/run-sets/compare-card';
import { CompareDialog } from '@/components/run-sets/compare-dialog';
import { RedteamReport } from '@/components/run-sets/redteam-report';
import { ReliabilityCard } from '@/components/run-sets/reliability-card';
import { useEvalConfig } from '@/lib/eval-config';

const KIND_TITLE = { reliability: 'Run ×k', redteam: 'Red-team scan', compare: 'Comparison' } as const;

export default function RunSetPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const { client } = useEvalConfig();
  const { runSets } = useEvalConfig().client;
  const qc = useQueryClient();
  const [compareOpen, setCompareOpen] = useState(false);

  const q = useQuery({
    queryKey: ['run-set', id],
    queryFn: () => runSets.get(id),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === 'completed' ? false : 3000),
  });
  const rs = q.data;

  const scenario = useQuery({
    queryKey: ['scenario', rs?.scenarioId],
    queryFn: () => client.scenarios.get(rs!.scenarioId),
    enabled: !!rs?.scenarioId,
  });
  const prompt = useQuery({
    queryKey: ['prompt', rs?.promptId],
    queryFn: () => client.prompts.get(rs!.promptId),
    enabled: !!rs?.promptId,
  });

  const baselineMutation = useMutation({
    mutationFn: () => runSets.markBaseline(id),
    onSuccess: () => {
      toast.success('Marked as baseline');
      void qc.invalidateQueries({ queryKey: ['run-set', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const running = rs?.status !== 'completed';
  const title = rs ? `${KIND_TITLE[rs.kind]}${scenario.data ? ` · ${scenario.data.name}` : ''}` : 'Run set';
  const description = rs
    ? `Agent: ${prompt.data?.name ?? '…'} · ${rs.personaIds.length} persona${rs.personaIds.length === 1 ? '' : 's'} × ${rs.k}`
    : 'Loading...';

  return (
    <PageLayout
      backHref={rs?.scenarioId ? `/scenarios/${rs.scenarioId}` : '/scenarios'}
      title={title}
      description={description}
      titleExtra={rs?.isBaseline ? <Badge variant="secondary" data-testid="baseline-badge">Baseline</Badge> : undefined}
      actions={
        rs && rs.kind !== 'redteam' ? (
          <div className="flex flex-wrap items-center gap-2">
            {!rs.isBaseline && (
              <Button size="sm" variant="outline" disabled={running || baselineMutation.isPending}
                onClick={() => baselineMutation.mutate()} data-testid="mark-baseline">
                <Flag className="mr-2 h-3.5 w-3.5" />
                Mark as baseline
              </Button>
            )}
            <Button size="sm" disabled={running} onClick={() => setCompareOpen(true)} data-testid="open-compare">
              <GitCompare className="mr-2 h-3.5 w-3.5" />
              Compare
            </Button>
          </div>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : q.isError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">{(q.error as Error).message}</CardContent>
        </Card>
      ) : rs ? (
        <div className="space-y-6 max-w-4xl">
          {rs.kind === 'redteam' ? <RedteamReport runSet={rs} /> : <ReliabilityCard runSet={rs} />}
          {rs.baselineRunSetId && (
            <CompareCard runSetId={rs.id} baselineId={rs.baselineRunSetId} running={running} />
          )}
          <CompareDialog open={compareOpen} onOpenChange={setCompareOpen} baseline={rs} />
        </div>
      ) : null}
    </PageLayout>
  );
}
