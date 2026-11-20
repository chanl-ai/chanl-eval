'use client';

import { useQuery } from '@tanstack/react-query';
import { Scale } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useEvalConfig } from '@/lib/eval-config';
import type { AgreementStats } from '@chanl/eval-sdk';

/**
 * How closely the LLM judge matches human reviewers on this scorecard's criteria.
 *
 * Scoped to one scorecard: agreement is a property of a rubric, and the disagreement notes are the
 * input to editing the criterion sitting next to them.
 */
export function JudgeAgreementPanel({ scorecardId }: { scorecardId: string }) {
  const { client } = useEvalConfig();

  const q = useQuery({
    queryKey: ['agreement', scorecardId],
    queryFn: () => client.labels.agreement({ scorecardId }),
    enabled: !!scorecardId,
    staleTime: 30_000,
  });

  if (q.isLoading) return <Skeleton className="h-32 w-full" />;
  if (q.isError || !q.data) return null;

  const { overall, byCriterion, disagreements } = q.data;

  if (overall.n === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Scale className="h-3.5 w-3.5" />
            Judge agreement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            No human verdicts yet. Review a run&apos;s criteria with the thumbs controls and this
            shows how far the judge can be trusted, criterion by criterion.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Scale className="h-3.5 w-3.5" />
            Judge agreement
          </CardTitle>
          <Badge variant="outline" className="tabular-nums text-[10px]">
            {overall.n} label{overall.n === 1 ? '' : 's'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {Math.round(overall.rawAgreement * 100)}% of human verdicts matched the judge.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {byCriterion.slice(0, 6).map((c) => (
          <div key={c.criteriaKey} className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-xs">
              {c.criteriaName || c.criteriaKey}
            </span>
            <KappaBadge stats={c} />
          </div>
        ))}

        {disagreements.length > 0 && (
          <div className="border-t pt-3">
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
              Recent disagreements
            </p>
            <div className="space-y-1.5">
              {disagreements.slice(0, 3).map((d) => (
                <div key={d.id} className="text-[11px] leading-snug">
                  <span className="font-medium">{d.criteriaName || d.criteriaKey}</span>
                  {d.note ? (
                    <span className="text-muted-foreground"> — {d.note}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      {' '}
                      — judge said {String(d.judgeResult)}, human said {String(d.humanResult)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KappaBadge({ stats }: { stats: AgreementStats }) {
  if (stats.underpowered) {
    return (
      <Badge variant="outline" className="shrink-0 text-[10px]">
        {stats.n} label{stats.n === 1 ? '' : 's'}
      </Badge>
    );
  }
  const variant =
    stats.kappa === null
      ? 'outline'
      : stats.kappa >= 0.61
        ? 'default'
        : stats.kappa >= 0.41
          ? 'secondary'
          : 'destructive';
  return (
    <Badge variant={variant} className="shrink-0 text-[10px] tabular-nums">
      κ {stats.kappa === null ? '—' : stats.kappa.toFixed(2)}
    </Badge>
  );
}
