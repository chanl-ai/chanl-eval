'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CopyPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { EvalClient, Scorecard } from '@chanl/eval-sdk';
import { Button } from '@/components/ui/button';
import { useEvalConfig } from '@/lib/eval-config';

/**
 * Copies a scorecard, its categories and its criteria through the existing API. Categories the
 * server already created for the new scorecard are reused by name instead of duplicated.
 */
export async function duplicateScorecard(client: EvalClient, source: Scorecard): Promise<Scorecard> {
  const [categories, criteria] = await Promise.all([
    client.scorecards.listCategories(source.id),
    client.scorecards.listCriteria(source.id),
  ]);
  const copy = await client.scorecards.create({
    name: `${source.name} (copy)`,
    description: source.description,
    passingThreshold: source.passingThreshold,
    scoringAlgorithm: source.scoringAlgorithm as never,
    tags: source.tags,
  });

  const existing = await client.scorecards.listCategories(copy.id);
  const categoryMap = new Map<string, string>();
  for (const cat of categories) {
    const match = existing.find((e) => e.name === cat.name);
    const target = match ?? (await client.scorecards.createCategory(copy.id, {
      name: cat.name, description: cat.description, weight: cat.weight,
    }));
    categoryMap.set(cat.id, target.id);
  }

  for (const c of criteria) {
    const categoryId = categoryMap.get(c.categoryId);
    if (!categoryId) continue;
    await client.scorecards.createCriterion(copy.id, {
      categoryId,
      name: c.name,
      description: c.description,
      type: c.type ?? 'keyword',
      settings: c.settings ?? {},
      ...(c.threshold ? { threshold: c.threshold } : {}),
    });
  }
  return copy;
}

export function DuplicateScorecardButton({ scorecard }: { scorecard: Scorecard }) {
  const { client } = useEvalConfig();
  const router = useRouter();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    try {
      const copy = await duplicateScorecard(client, scorecard);
      toast.success(`Created “${copy.name}”`);
      void qc.invalidateQueries({ queryKey: ['scorecards'] });
      router.push(`/scorecards/${copy.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not duplicate the scorecard');
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={run} disabled={pending} data-testid="duplicate-scorecard">
      {pending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CopyPlus className="mr-2 h-3.5 w-3.5" />}
      Duplicate
    </Button>
  );
}
