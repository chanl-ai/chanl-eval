'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Gauge, Loader2, ScaleIcon, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig } from '@/lib/eval-config';
import type { AgreementStats, CriterionAgreement } from '@chanl/eval-sdk';

/**
 * Judge benchmarking: how closely does the LLM judge match a human?
 *
 * A scorecard score is only worth as much as the judge producing it. This page is the check nobody
 * in the eval space publishes — it says, per criterion, whether the judge can actually read that
 * rubric line, and it surfaces the disagreements so the rubric can be fixed.
 */
export default function BenchmarkPage() {
  const { client } = useEvalConfig();

  const q = useQuery({
    queryKey: ['agreement'],
    queryFn: () => client.labels.agreement(),
    staleTime: 30_000,
  });

  const report = q.data;
  const hasLabels = (report?.overall.n ?? 0) > 0;

  return (
    <PageLayout
      icon={ScaleIcon}
      title="Judge benchmark"
      description="How well the LLM judge agrees with human reviewers, per criterion."
    >
      {q.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : q.isError ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-3 py-6">
            <TriangleAlert className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm font-medium">Could not load agreement data</p>
              <p className="text-sm text-muted-foreground">
                {(q.error as Error)?.message}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : !hasLabels ? (
        <EmptyState />
      ) : (
        <>
          {/* Headline */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Labels recorded"
              value={String(report!.overall.n)}
              hint="Human verdicts compared against the judge"
            />
            <StatCard
              label="Overall agreement"
              value={`${Math.round(report!.overall.rawAgreement * 100)}%`}
              hint="Across both criterion types; scores count as agreeing within 1 point"
            />
            <StatCard
              label="Confidence lift"
              value={
                report!.calibration.lift === null
                  ? '—'
                  : `${report!.calibration.lift > 0 ? '+' : ''}${Math.round(report!.calibration.lift * 100)}%`
              }
              hint="How much more often the judge is right when it says it is confident. Near zero means the confidence number is decoration."
            />
          </div>

          {/* Kappa, per criterion type */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <KappaCard
              title="Pass/fail criteria"
              subtitle="Cohen's kappa (unweighted)"
              stats={report!.overall.boolean}
            />
            <KappaCard
              title="Scored criteria"
              subtitle="Cohen's kappa (quadratic-weighted, 0-10)"
              stats={report!.overall.score}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">By criterion</CardTitle>
              <p className="text-sm text-muted-foreground">
                Worst agreement first. A criterion the judge cannot read reliably is one whose score
                you should not act on.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Criterion</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Labels</TableHead>
                    <TableHead className="text-right">Agreement</TableHead>
                    <TableHead className="text-right">Kappa</TableHead>
                    <TableHead>Verdict</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report!.byCriterion.map((c: CriterionAgreement) => (
                    <TableRow key={c.criteriaKey}>
                      <TableCell className="font-medium">
                        {c.criteriaName || c.criteriaKey}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.evaluationType}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.n}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Math.round(c.rawAgreement * 100)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.kappa === null ? '—' : c.kappa.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <KappaVerdict stats={c} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                Disagreements{' '}
                <span className="font-normal text-muted-foreground">
                  ({report!.disagreements.length})
                </span>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Where a human overruled the judge. These notes are the raw material for fixing a
                rubric.
              </p>
            </CardHeader>
            <CardContent>
              {report!.disagreements.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No disagreements recorded. Either the judge is doing well, or not enough runs have
                  been reviewed.
                </p>
              ) : (
                <div className="divide-y rounded-md border">
                  {report!.disagreements.map((d) => (
                    <div key={d.id} className="space-y-1.5 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {d.criteriaName || d.criteriaKey}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          judge:{' '}
                          {typeof d.judgeResult === 'number'
                            ? `${d.judgeResult}/10`
                            : String(d.judgeResult)}
                        </Badge>
                        <Badge variant="destructive" className="text-[10px]">
                          human:{' '}
                          {typeof d.humanResult === 'number'
                            ? `${d.humanResult}/10`
                            : String(d.humanResult)}
                        </Badge>
                        {d.judgeConfidence !== undefined && (
                          <Badge variant="secondary" className="text-[10px] tabular-nums">
                            judge was {Math.round(d.judgeConfidence * 100)}% confident
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">by {d.labeledBy}</span>
                      </div>
                      {d.note && <p className="text-sm">{d.note}</p>}
                      {d.judgeReasoning && (
                        <p className="text-xs text-muted-foreground">
                          Judge said: {d.judgeReasoning}
                        </p>
                      )}
                      {d.scenarioExecutionId && (
                        <Link
                          href={`/executions/${d.scenarioExecutionId}`}
                          className="inline-block text-xs text-primary underline-offset-2 hover:underline"
                        >
                          Open the run
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageLayout>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function KappaCard({
  title,
  subtitle,
  stats,
}: {
  title: string;
  subtitle: string;
  stats: AgreementStats;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Gauge className="h-4 w-4" />
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold tabular-nums">
            {stats.kappa === null ? '—' : stats.kappa.toFixed(2)}
          </span>
          <KappaVerdict stats={stats} />
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {stats.n} label{stats.n === 1 ? '' : 's'} · {Math.round(stats.rawAgreement * 100)}% raw
          agreement
          {stats.withinOne !== undefined
            ? ` · ${Math.round(stats.withinOne * 100)}% within 1 point`
            : ''}
          {stats.meanAbsoluteError !== undefined
            ? ` · MAE ${stats.meanAbsoluteError.toFixed(2)}`
            : ''}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Never render a kappa band off a handful of labels. One disagreeing label produces kappa exactly 0
 * ("poor"), which says nothing about the judge and everything about the sample size.
 */
function KappaVerdict({ stats }: { stats: AgreementStats }) {
  if (stats.n === 0) {
    return <span className="text-xs text-muted-foreground">no labels</span>;
  }
  if (stats.underpowered) {
    return (
      <Badge variant="outline" className="text-[10px]">
        needs more labels
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
    <Badge variant={variant} className="text-[10px] capitalize">
      {stats.interpretation}
    </Badge>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <ScaleIcon className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <p className="font-medium text-muted-foreground">No human labels yet</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Open a scored run, review the judge&apos;s verdicts under &ldquo;Human review&rdquo;, and
          mark each one right or wrong. Once labels exist, this page reports how much the judge can
          be trusted, criterion by criterion.
        </p>
        <Link
          href="/executions"
          className="mt-4 text-sm text-primary underline-offset-2 hover:underline"
        >
          Go to runs
        </Link>
      </CardContent>
    </Card>
  );
}
