'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Info, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DeleteDialog } from '@/components/shared/delete-dialog';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig } from '@/lib/eval-config';
import { toast } from 'sonner';
import type { Persona, Scorecard } from '@chanl/eval-sdk';

export default function ScenarioDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const qc = useQueryClient();
  const { client } = useEvalConfig();

  const q = useQuery({
    queryKey: ['scenario', id],
    queryFn: () => client.scenarios.get(id),
    enabled: !!id,
  });

  const personasQuery = useQuery({
    queryKey: ['personas'],
    queryFn: () => client.personas.list({ limit: 100 }),
  });

  const scorecardsQuery = useQuery({
    queryKey: ['scorecards'],
    queryFn: () => client.scorecards.list({ limit: 100 }),
  });

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string>('active');
  const [difficulty, setDifficulty] = useState<string>('medium');
  const [category, setCategory] = useState('');
  const [scorecardId, setScorecardId] = useState<string>('');
  const [personaId, setPersonaId] = useState<string>('');

  useEffect(() => {
    if (q.data) {
      setName(q.data.name);
      setPrompt(q.data.prompt);
      setDescription(q.data.description ?? '');
      setStatus(q.data.status ?? 'active');
      setDifficulty(q.data.difficulty ?? 'medium');
      setCategory(q.data.category ?? '');
      setScorecardId(q.data.scorecardId ?? '');
      setPersonaId(q.data.personaIds?.[0] ?? '');
    }
  }, [q.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await client.scenarios.update(id, {
        name,
        prompt,
        description: description || undefined,
        status: status as 'draft' | 'active' | 'paused' | 'completed' | 'archived',
        difficulty: difficulty as 'easy' | 'medium' | 'hard',
        category: category || undefined,
        scorecardId: scorecardId || undefined,
        personaIds: personaId ? [personaId] : [],
      });
    },
    onSuccess: () => {
      toast.success('Scenario saved');
      void qc.invalidateQueries({ queryKey: ['scenario', id] });
      void qc.invalidateQueries({ queryKey: ['scenarios'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await client.scenarios.remove(id);
      toast.success('Scenario deleted');
      void qc.invalidateQueries({ queryKey: ['scenarios'] });
      router.push('/scenarios');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <PageLayout
      backHref="/scenarios"
      title={q.data?.name ?? 'Scenario'}
      description={q.data?.description ?? 'Loading...'}
      actions={
        q.data ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid="save-scenario"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => router.push(`/playground?scenario=${id}`)}>
              <Play className="mr-2 h-3.5 w-3.5" />
              Run
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeleteOpen(true)} data-testid="delete-scenario-button">
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : q.isError ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-destructive text-sm">{(q.error as Error).message}</p>
          </CardContent>
        </Card>
      ) : q.data ? (
        <div className="max-w-2xl space-y-6">
          {/* Edit Scenario */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Scenario Details</CardTitle>
              <p className="text-sm text-muted-foreground">
                Define the test scenario and the situation the persona will role-play.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Angry Customer Refund"
                  data-testid="scenario-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="prompt">Situation Prompt <span className="text-destructive">*</span></Label>
                <Textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="font-mono text-sm min-h-[200px]"
                  placeholder="e.g. I was charged twice for my subscription — $49.99 on March 20 and again on March 21. I already called about this last week and was told it would be reversed, but nothing happened..."
                  rows={8}
                  data-testid="scenario-prompt"
                />
                <p className="text-[11px] text-muted-foreground">
                  The customer&apos;s situation — written in first person. This becomes the persona&apos;s motivation
                  during the simulated conversation.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this scenario tests and what a good outcome looks like..."
                  rows={2}
                />
                <p className="text-[11px] text-muted-foreground">
                  Shown on the scenario card and in run results for context.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. support"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Difficulty</Label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

            </CardContent>
          </Card>

          {/* Linked Entities — Scorecard + Personas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Linked Scorecard & Personas</CardTitle>
              <p className="text-sm text-muted-foreground">
                The scorecard evaluates each run. Personas define who the simulated customer is.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Scorecard Selector */}
              <div className="space-y-2">
                <Label>Scorecard</Label>
                <Select value={scorecardId || '_none'} onValueChange={(v) => setScorecardId(v === '_none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="No scorecard linked" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No scorecard (skip evaluation)</SelectItem>
                    {(scorecardsQuery.data?.scorecards ?? []).filter((s: Scorecard) => s.status !== 'archived').map((s: Scorecard) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Runs without a scorecard won&apos;t get per-criteria evaluation — only a basic completion score.
                </p>
              </div>

              {/* Persona Selector */}
              <div className="space-y-2">
                <Label>Persona</Label>
                <Select value={personaId || '_none'} onValueChange={(v) => setPersonaId(v === '_none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select a persona..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No persona (use scenario prompt only)</SelectItem>
                    {(personasQuery.data?.personas ?? []).filter((p: Persona) => (p as any).status !== 'archived').map((p: Persona) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {p.emotion}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  The persona defines the simulated customer&apos;s personality, behavior, and communication style.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* How Simulation Works */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                How Simulation Works
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-3">
              <p>
                When a scenario runs, the engine builds a full system prompt for the persona by combining:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-foreground">Persona traits</strong> — emotion, cooperation level, patience, speech style are mapped to behavioral instructions</li>
                <li><strong className="text-foreground">Situation prompt</strong> — inserted as the reason the persona is contacting support</li>
                <li><strong className="text-foreground">Custom attributes</strong> — persona key-value pairs injected into the prompt context</li>
                <li><strong className="text-foreground">Backstory</strong> — additional character background and context</li>
              </ul>
              <p>
                The generated prompt includes sections for negotiation style, patience reactions,
                conversation pacing, and closing behavior — all derived from the persona&apos;s trait settings.
              </p>
              <p className="text-xs border-t pt-3 mt-3">
                <strong className="text-foreground">Customize the prompt generation:</strong>{' '}
                <code className="bg-muted px-1 rounded text-[11px]">packages/scenarios-core/src/simulator/persona-simulator.service.ts</code>
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityType="Scenario"
        entityName={q.data?.name}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </PageLayout>
  );
}
