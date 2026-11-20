import type { ScorecardResult } from '@chanl/eval-sdk';
import type { ScoreMetric, ScorecardCriterionDisplay } from '@/components/scorecard/types';

// ---------------------------------------------------------------------------
// Data mapping: ScorecardResult → ScoreMetric[] (real scorecard evaluation)
// ---------------------------------------------------------------------------

export function scorecardResultToMetrics(result: ScorecardResult): ScoreMetric[] {
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
      criteriaId: cr.criteriaId,
      result: (cr as any).result,
      passed: cr.passed,
      explanation: cr.reasoning,
      evidence: cr.evidence?.length > 0 ? cr.evidence.slice(0, 2) : undefined,
      notApplicable: (cr as any).notApplicable ?? false,
      notApplicableReason: (cr as any).notApplicable ? cr.reasoning : undefined,
      needsReview: (cr as any).needsReview === true,
    });
  }

  return Array.from(categoryMap.values()).map(({ name, criteria }) => {
    const applicable = criteria.filter((c) => !c.notApplicable);
    const passed = applicable.filter((c) => c.passed).length;
    return {
      name,
      score: passed,
      maxScore: applicable.length,
      status: applicable.length === 0 ? 'pass' as const : passed > applicable.length * 0.5 ? 'pass' as const : 'fail' as const,
      criteria,
    };
  });
}

// ---------------------------------------------------------------------------
// Data mapping: embedded scorecardResults → ScoreMetric[]
// ---------------------------------------------------------------------------

export function embeddedResultsToMetrics(result: {
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
      criteriaId: cr.criteriaId,
      result: (cr as any).result,
      passed: cr.passed,
      explanation: cr.reasoning,
      evidence: cr.evidence?.length ? cr.evidence.slice(0, 2) : undefined,
      notApplicable: (cr as any).notApplicable ?? false,
      notApplicableReason: (cr as any).notApplicable ? cr.reasoning : undefined,
      needsReview: (cr as any).needsReview === true,
    });
  }

  return Array.from(categoryMap.values()).map(({ name, criteria }) => {
    const applicable = criteria.filter((c) => !c.notApplicable);
    const passed = applicable.filter((c) => c.passed).length;
    return {
      name,
      score: passed,
      maxScore: applicable.length,
      status: applicable.length === 0 ? 'pass' as const : passed > applicable.length * 0.5 ? 'pass' as const : 'fail' as const,
      criteria,
    };
  });
}
