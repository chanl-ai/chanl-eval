'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Play, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { Persona, Prompt, Scenario, Scorecard } from '@chanl/eval-sdk';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { readLastAgent } from '@/lib/playground-link';
import { agentForScenario } from '@/lib/workshop';
import type { RunSetKind } from '@chanl/eval-sdk';

export const RED_TEAM_TAG = 'red-team';
/** Seeded names the red-team scan preselects when they exist. */
const REDTEAM_SCENARIO = 'Red-team: Account probe';
const REDTEAM_SCORECARD = 'Red-team Guard';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: Exclude<RunSetKind, 'compare'>;
  scenarioId?: string;
  promptId?: string;
  personaId?: string;
  scorecardId?: string;
}

const COPY = {
  reliability: {
    title: 'Run ×5',
    description: 'Run the same scenario several times. One pass proves little; passing every time shows it is reliable. Every mock tool is available to the agent.',
    submit: 'Start runs',
    icon: Play,
  },
  redteam: {
    title: 'Red-team scan',
    description: 'Run every attack persona once against this agent and see which attacks worked. Every mock tool is available to the agent.',
    submit: 'Start scan',
    icon: ShieldAlert,
  },
} as const;

function FieldSelect<T extends { id: string; name: string }>({
  label, value, onChange, items, placeholder, testId, loading,
}: {
  label: string; value: string; onChange: (v: string) => void; items: T[];
  placeholder: string; testId: string; loading: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger data-testid={testId} className="w-full">
          <SelectValue placeholder={loading ? 'Loading...' : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
          ))}
          {!loading && items.length === 0 && (
            <SelectItem value="_none" disabled>None found</SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

export function RunSetDialog({ open, onOpenChange, kind, ...defaults }: Props) {
  const { client } = useEvalConfig();
  const { runSets } = useEvalConfig().client;
  const router = useRouter();
  const copy = COPY[kind];

  const prompts = useQuery({ queryKey: ['prompts'], queryFn: () => client.prompts.list({ limit: 100 }), enabled: open });
  const scenarios = useQuery({ queryKey: ['scenarios', 'all'], queryFn: () => client.scenarios.list({ limit: 100 }), enabled: open });
  const personas = useQuery({ queryKey: ['personas'], queryFn: () => client.personas.list({ limit: 100 }), enabled: open });
  const scorecards = useQuery({ queryKey: ['scorecards'], queryFn: () => client.scorecards.list({ limit: 100 }), enabled: open });

  const promptList = (prompts.data?.prompts ?? []) as Prompt[];
  const scenarioList = (scenarios.data?.scenarios ?? []) as Scenario[];
  const personaList = (personas.data?.personas ?? []) as Persona[];
  const scorecardList = ((scorecards.data?.scorecards ?? []) as Scorecard[]).filter((s) => s.status !== 'archived');
  const attackers = useMemo(() => personaList.filter((p) => p.tags?.includes(RED_TEAM_TAG)), [personaList]);

  const [promptId, setPromptId] = useState('');
  const [scenarioId, setScenarioId] = useState('');
  const [personaId, setPersonaId] = useState('');
  const [attackIds, setAttackIds] = useState<string[]>([]);
  const [scorecardId, setScorecardId] = useState('');
  const [k, setK] = useState(kind === 'redteam' ? '1' : '5');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPromptId(defaults.promptId ?? '');
    setScenarioId(defaults.scenarioId ?? '');
    setPersonaId(defaults.personaId ?? '');
    setScorecardId(defaults.scorecardId ?? '');
    setK(kind === 'redteam' ? '1' : '5');
  }, [open, kind, defaults.promptId, defaults.scenarioId, defaults.personaId, defaults.scorecardId]);

  // Preselect every attack persona once they load.
  // Keyed on the id list, not the array: the array is rebuilt every render while loading.
  const attackerKey = attackers.map((p) => p.id).join(',');
  useEffect(() => {
    if (open && kind === 'redteam') setAttackIds(attackerKey ? attackerKey.split(',') : []);
  }, [open, kind, attackerKey]);

  // Fill what the caller left open once the lists load: the red-team scan's seeded scenario and
  // scorecard, then the scenario's own scorecard, default persona and agent.
  const [filled, setFilled] = useState(false);
  useEffect(() => { if (!open) setFilled(false); }, [open]);
  const listsReady = prompts.isSuccess && scenarios.isSuccess && personas.isSuccess && scorecards.isSuccess;
  useEffect(() => {
    if (!open || filled || !listsReady) return;
    setFilled(true);
    let sid = defaults.scenarioId ?? '';
    let scId = defaults.scorecardId ?? '';
    if (kind === 'redteam') {
      sid = sid || scenarioList.find((s) => s.name === REDTEAM_SCENARIO)?.id || '';
      scId = scId || scorecardList.find((s) => s.name === REDTEAM_SCORECARD)?.id || '';
    }
    if (sid) applyScenario(sid, scId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filled, listsReady]);

  function applyScenario(id: string, scorecardOverride?: string) {
    setScenarioId(id);
    const sc = scenarioList.find((s) => s.id === id);
    setScorecardId(scorecardOverride || sc?.scorecardId || '');
    if (kind === 'reliability' && !defaults.personaId && sc?.personaIds?.[0]) setPersonaId(sc.personaIds[0]);
    if (!defaults.promptId) {
      const agentId = agentForScenario(sc, promptList, readLastAgent());
      if (agentId) setPromptId(agentId);
    }
  }

  const kNum = Math.min(10, Math.max(1, parseInt(k, 10) || 1));
  const personaIds = kind === 'redteam' ? attackIds : personaId ? [personaId] : [];
  const ready = !!promptId && !!scenarioId && personaIds.length > 0 && !!scorecardId;

  async function submit() {
    if (!ready) return;
    setPending(true);
    try {
      const created = await runSets.create({ kind, scenarioId, promptId, personaIds, scorecardId, k: kNum });
      toast.success(kind === 'redteam' ? 'Scan started' : `${kNum * personaIds.length} runs started`);
      onOpenChange(false);
      router.push(`/run-sets/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start the runs');
    } finally {
      setPending(false);
    }
  }

  const Icon = copy.icon;
  const loading = prompts.isLoading || scenarios.isLoading || personas.isLoading || scorecards.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90svh] overflow-y-auto" data-testid={`${kind}-dialog`}>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FieldSelect label="Agent" value={promptId} onChange={setPromptId} items={promptList}
            placeholder="Choose an agent" testId="runset-agent" loading={prompts.isLoading} />
          <FieldSelect label="Scenario" value={scenarioId} onChange={(v) => applyScenario(v)} items={scenarioList}
            placeholder="Choose a scenario" testId="runset-scenario" loading={scenarios.isLoading} />
          {kind === 'reliability' ? (
            <FieldSelect label="Persona" value={personaId} onChange={setPersonaId} items={personaList}
              placeholder="Choose a persona" testId="runset-persona" loading={personas.isLoading} />
          ) : (
            <div className="space-y-2">
              <Label>Attack personas</Label>
              {personas.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : attackers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No personas are tagged &quot;{RED_TEAM_TAG}&quot;. Tag a persona to include it in the scan.
                </p>
              ) : (
                <div className="space-y-2 rounded-md border p-3" data-testid="attack-personas">
                  {attackers.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={attackIds.includes(p.id)}
                        onCheckedChange={(c) =>
                          setAttackIds((ids) => (c ? [...ids, p.id] : ids.filter((x) => x !== p.id)))
                        }
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <FieldSelect label="Scorecard" value={scorecardId} onChange={setScorecardId} items={scorecardList}
            placeholder="Choose a scorecard" testId="runset-scorecard" loading={scorecards.isLoading} />
          <div className="space-y-2">
            <Label htmlFor="runset-k">{kind === 'redteam' ? 'Runs per attack persona' : 'Number of runs'}</Label>
            <Input id="runset-k" type="number" min={1} max={10} value={k} onChange={(e) => setK(e.target.value)} className="w-24" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={!ready || pending || loading} data-testid="runset-submit">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Icon className="mr-2 h-4 w-4" />}
            {copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
