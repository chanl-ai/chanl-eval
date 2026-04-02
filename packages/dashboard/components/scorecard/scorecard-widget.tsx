'use client';

import { useState } from 'react';
import { Check, AlertCircle, ChevronDown, CheckCircle, XCircle, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { SCORECARD_COLORS } from './scorecard-colors';
import type { ScoreMetric, ScorecardWidgetProps, ScorecardCriterionDisplay } from './types';

/**
 * ScorecardWidget — Presentational component for displaying scorecard results.
 * Copied from @chanl-ai/platform-sdk — zero external dependencies.
 *
 * Accepts pre-processed metrics. Each page transforms its own API data shape
 * into `ScoreMetric[]` before passing here.
 */
export function ScorecardWidget({
  metrics,
  overallScorePercentage,
  overallStatus: overallStatusProp,
  summary,
  className,
}: ScorecardWidgetProps) {
  if (metrics.length === 0) {
    return (
      <div className="text-muted-foreground text-center py-4 text-sm">
        No scorecard data available
      </div>
    );
  }

  const totalScore = metrics.reduce((sum, m) => sum + m.score, 0);
  const maxTotalScore = metrics.reduce((sum, m) => sum + m.maxScore, 0);

  const percentage =
    overallScorePercentage ??
    (maxTotalScore > 0 ? (totalScore / maxTotalScore) * 100 : 0);

  const overallStatus =
    overallStatusProp ??
    (metrics.every((m) => m.status === 'pass')
      ? 'pass'
      : percentage >= 80
        ? 'pass'
        : percentage >= 60
          ? 'warning'
          : 'fail');

  return (
    <div className={cn('score-card-widget', className)}>
      {/* Overall Score Summary */}
      <div className="py-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Overall Score
          </h3>
          <div
            className="flex items-center gap-1.5 rounded-md px-2 py-0.5"
            style={{
              backgroundColor: SCORECARD_COLORS[overallStatus === 'warning' ? 'warning' : overallStatus].bg,
              color: SCORECARD_COLORS[overallStatus === 'warning' ? 'warning' : overallStatus].text,
            }}
          >
            {overallStatus === 'pass' ? (
              <Check className="size-2.5" />
            ) : (
              <AlertCircle className="size-2.5" />
            )}
            <span className="text-[10px] font-semibold tracking-wider">
              {overallStatus === 'pass' ? 'PASS' : overallStatus === 'warning' ? 'WARNING' : 'FAIL'}
            </span>
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{Math.round(percentage)}%</span>
          <span className="text-sm text-muted-foreground">
            ({totalScore}/{maxTotalScore} criteria)
          </span>
        </div>
        {summary && (
          <p className="mt-2 text-sm leading-relaxed text-foreground/80">{summary}</p>
        )}
      </div>

      {/* Category Metrics */}
      <div className="space-y-4">
        {metrics.map((metric, index) => (
          <ScorecardMetricRow key={index} metric={metric} />
        ))}
      </div>
    </div>
  );
}

/** Single category row with progress bar + expandable criteria */
function ScorecardMetricRow({ metric }: { metric: ScoreMetric }) {
  const isPass = metric.status === 'pass';
  const colorKey = isPass ? 'pass' : 'fail';

  const segmentCount = metric.maxScore || metric.criteria?.length || 1;
  const maxPossibleSegments = 10;
  const segmentWidth = maxPossibleSegments / segmentCount;
  const [isExpanded, setIsExpanded] = useState(true);

  const dotPosition = metric.score > 0 ? metric.score - 1 : -1;

  return (
    <div className="space-y-1">
      {/* Title Row with Score and Badge */}
      <div className="flex items-center justify-between gap-4">
        <h3
          className="text-sm font-medium"
          data-testid={`scorecard-category-${metric.name.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {metric.name}
        </h3>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className="text-sm font-semibold tabular-nums"
            data-testid={`scorecard-score-${metric.name.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {metric.score}/{metric.maxScore}
          </span>
          <div
            data-testid={`scorecard-badge-${metric.name.toLowerCase().replace(/\s+/g, '-')}`}
            className="flex min-w-[64px] items-center justify-center gap-1.5 rounded-md px-2 py-0.5"
            style={{
              backgroundColor: SCORECARD_COLORS[colorKey].bg,
              color: SCORECARD_COLORS[colorKey].text,
            }}
          >
            {isPass ? <Check className="size-2.5" /> : <AlertCircle className="size-2.5" />}
            <span className="text-[10px] font-semibold tracking-wider">
              {isPass ? 'PASS' : 'FAIL'}
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div
        className="flex cursor-pointer items-center justify-between gap-6 -mx-2 rounded-lg px-2 py-1 transition-colors hover:bg-muted/30"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex w-full items-center" style={{ gap: '2px' }}>
          {Array.from({ length: segmentCount }).map((_, segmentIndex) => {
            const isFilled = segmentIndex < metric.score;

            return (
              <div
                key={segmentIndex}
                className="relative flex items-center"
                style={{ flex: segmentWidth }}
              >
                <div
                  className={cn(
                    'w-full rounded-sm border transition-all',
                    !isFilled && 'border-muted-foreground/10 bg-muted/40 dark:bg-muted/20',
                  )}
                  style={{
                    height: 'var(--scorecard-bar-height, 1rem)',
                    ...(isFilled
                      ? {
                          backgroundColor: SCORECARD_COLORS[colorKey].bg,
                          borderColor: SCORECARD_COLORS[colorKey].border,
                        }
                      : {}),
                  }}
                />
                {dotPosition === segmentIndex && (
                  <div
                    className="absolute left-full top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background z-10"
                    style={{
                      width: 'var(--scorecard-dot-size, 1.5rem)',
                      height: 'var(--scorecard-dot-size, 1.5rem)',
                      backgroundColor: SCORECARD_COLORS[colorKey].solid,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="shrink-0 ml-3">
          <ChevronDown
            className={cn('size-5 transition-transform duration-200', isExpanded && 'rotate-180')}
          />
        </div>
      </div>

      {/* Expandable Criteria Details */}
      <div
        className={cn(
          'grid transition-all duration-300 ease-in-out',
          isExpanded ? 'opacity-100' : 'opacity-0'
        )}
        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="mt-2 overflow-hidden rounded-lg border bg-background">
            {metric.criteria && metric.criteria.length > 0 ? (
              <div>
                {metric.criteria.map((item, index) => (
                  <CriterionRow key={index} item={item} index={index} />
                ))}
              </div>
            ) : (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                No detailed breakdown available for this metric.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Single criterion row inside the expanded details */
function CriterionRow({ item, index }: { item: ScorecardCriterionDisplay; index: number }) {
  const isNA = item.notApplicable === true;
  const criterionPassed = isNA ? true : item.passed;

  const confidenceLabel =
    item.confidence != null
      ? item.confidence > 0.8
        ? 'High'
        : item.confidence > 0.5
          ? 'Medium'
          : 'Low'
      : null;

  return (
    <div
      className="flex items-start justify-between gap-6 border-b px-6 py-4 transition-colors last:border-b-0"
      style={{
        backgroundColor:
          isNA ? undefined : !criterionPassed ? SCORECARD_COLORS.fail.bg : undefined,
      }}
    >
      <div className="flex gap-4 flex-1">
        <div className="shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
          {(index + 1).toString().padStart(2, '0')}
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{item.name}</span>
            {confidenceLabel && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] px-1.5 py-0',
                  confidenceLabel === 'High' && 'border-green-300 text-green-700',
                  confidenceLabel === 'Medium' && 'border-amber-300 text-amber-700',
                  confidenceLabel === 'Low' && 'border-red-300 text-red-700'
                )}
              >
                {confidenceLabel}
              </Badge>
            )}
          </div>
          {item.explanation && (
            <div className="text-xs leading-relaxed text-muted-foreground">
              {item.explanation}
            </div>
          )}
          {item.evidence && item.evidence.length > 0 && (
            <div className="mt-2 space-y-1">
              {item.evidence.map((quote, qi) => (
                <blockquote
                  key={qi}
                  className="border-l-2 border-muted-foreground/20 pl-3 text-xs italic text-muted-foreground"
                >
                  &ldquo;{quote}&rdquo;
                </blockquote>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex min-w-[60px] shrink-0 items-center justify-end gap-2">
        {isNA ? (
          <>
            <Minus className="size-4 text-muted-foreground" />
            <div
              className="text-sm font-semibold text-muted-foreground"
              title={item.notApplicableReason || 'Not applicable'}
            >
              N/A
            </div>
          </>
        ) : criterionPassed ? (
          <>
            <CheckCircle className="size-4" style={{ color: SCORECARD_COLORS.pass.solid }} />
            <div className="text-sm font-semibold" style={{ color: SCORECARD_COLORS.pass.text }}>
              Yes
            </div>
          </>
        ) : (
          <>
            <XCircle className="size-4" style={{ color: SCORECARD_COLORS.fail.solid }} />
            <div className="text-sm font-semibold" style={{ color: SCORECARD_COLORS.fail.text }}>
              No
            </div>
          </>
        )}
      </div>
    </div>
  );
}
