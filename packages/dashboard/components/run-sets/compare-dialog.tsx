'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { GitCompare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Prompt, Scorecard } from '@chanl/eval-sdk';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEvalConfig } from '@/lib/eval-config';
import type { RunSet } from '@chanl/eval-sdk';

/**
 * Re-runs the baseline's scenario and personas against another agent (usually the fixed copy),
 * k times, and opens the new run set with its before/after card.
 */
export function CompareDialog({ open, onOpenChange, baseline }: {
  open: boolean; onOpenChange: (o: boolean) => void; baseline: RunSet;
}) {
  const { client } = useEvalConfig();
  const { runSets } = useEvalConfig().client;
  const router = useRouter();
  const prompts = useQuery({ queryKey: ['prompts'], queryFn: () => client.prompts.list({ limit: 100 }), enabled: open });
  const list = ((prompts.data?.prompts ?? []) as Prompt[]).filter((p) => p.id !== baseline.promptId);
  const scenario = useQuery({ queryKey: ['scenario', baseline.scenarioId], queryFn: () => client.scenarios.get(baseline.scenarioId), enabled: open });
  const scorecards = useQuery({ queryKey: ['scorecards'], queryFn: () => client.scorecards.list({ limit: 100 }), enabled: open });
  const scorecardList = ((scorecards.data?.scorecards ?? []) as Scorecard[]).filter((s) => s.status !== 'archived');
  const [scorecardId, setScorecardId] = useState('');
  const [promptId, setPromptId] = useState('');
  const [k, setK] = useState(String(baseline.k));
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) { setPromptId(''); setK(String(baseline.k)); }
  }, [open, baseline.k]);

  // The run set does not record its scorecard, so default to the scenario's and let the user change it.
  useEffect(() => {
    if (open && !scorecardId && scenario.data?.scorecardId) setScorecardId(scenario.data.scorecardId);
  }, [open, scorecardId, scenario.data?.scorecardId]);

  async function submit() {
    setPending(true);
    try {
      const created = await runSets.create({
        kind: 'compare',
        scenarioId: baseline.scenarioId,
        promptId,
        personaIds: baseline.personaIds,
        scorecardId: scorecardId || undefined,
        k: Math.min(10, Math.max(1, parseInt(k, 10) || baseline.k)),
        baselineRunSetId: baseline.id,
      });
      onOpenChange(false);
      router.push(`/run-sets/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start the comparison');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]" data-testid="compare-dialog">
        <DialogHeader>
          <DialogTitle>Compare with another agent</DialogTitle>
          <DialogDescription>
            Runs the same scenario and personas against the agent you pick, then shows each check before and after.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Agent</Label>
            <Select value={promptId} onValueChange={setPromptId}>
              <SelectTrigger className="w-full" data-testid="compare-agent">
                <SelectValue placeholder={prompts.isLoading ? 'Loading...' : 'Choose an agent'} />
              </SelectTrigger>
              <SelectContent>
                {list.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                {!prompts.isLoading && list.length === 0 && (
                  <SelectItem value="_none" disabled>No other agents. Use “Save as new agent” first.</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Scorecard</Label>
            <Select value={scorecardId} onValueChange={setScorecardId}>
              <SelectTrigger className="w-full" data-testid="compare-scorecard">
                <SelectValue placeholder={scorecards.isLoading ? 'Loading...' : 'Use the same scorecard as the baseline'} />
              </SelectTrigger>
              <SelectContent>
                {scorecardList.map((sc) => <SelectItem key={sc.id} value={sc.id}>{sc.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="compare-k">Runs per persona (k)</Label>
            <Input id="compare-k" type="number" min={1} max={10} value={k} onChange={(e) => setK(e.target.value)} className="w-24" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={!promptId || pending} data-testid="compare-submit">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitCompare className="mr-2 h-4 w-4" />}
            Run comparison
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
