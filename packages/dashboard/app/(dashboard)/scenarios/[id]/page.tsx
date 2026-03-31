'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ArrowLeft, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { BeautifulAvatar } from '@/components/shared/beautiful-avatar';
import { useEvalConfig } from '@/lib/eval-config';
import { toast } from 'sonner';
import type { Persona } from '@chanl/eval-sdk';

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

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string>('active');
  const [difficulty, setDifficulty] = useState<string>('medium');
  const [category, setCategory] = useState('');

  useEffect(() => {
    if (q.data) {
      setName(q.data.name);
      setPrompt(q.data.prompt);
      setDescription(q.data.description ?? '');
      setStatus(q.data.status ?? 'active');
      setDifficulty(q.data.difficulty ?? 'medium');
      setCategory(q.data.category ?? '');
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
      });
    },
    onSuccess: () => {
      toast.success('Scenario saved');
      void qc.invalidateQueries({ queryKey: ['scenario', id] });
      void qc.invalidateQueries({ queryKey: ['scenarios'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const personaMap = new Map<string, Persona>();
  if (personasQuery.data?.personas) {
    for (const p of personasQuery.data.personas) {
      personaMap.set(p.id, p);
    }
  }

  const linkedPersonas = (q.data?.personaIds ?? [])
    .map((pid) => personaMap.get(pid))
    .filter(Boolean) as Persona[];

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <Link
        href="/scenarios"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Scenarios
      </Link>

      {q.isLoading ? (
        <div className="space-y-4">
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
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{q.data.name}</h1>
              {q.data.difficulty && (
                <Badge
                  variant={
                    q.data.difficulty === 'hard'
                      ? 'destructive'
                      : q.data.difficulty === 'easy'
                        ? 'secondary'
                        : 'default'
                  }
                >
                  {q.data.difficulty}
                </Badge>
              )}
              {q.data.category && (
                <Badge variant="outline">{q.data.category}</Badge>
              )}
            </div>
            <Button
              size="sm"
              onClick={() => router.push(`/?scenario=${id}`)}
            >
              <Play className="mr-2 h-3.5 w-3.5" />
              Run in Playground
            </Button>
          </div>

          {linkedPersonas.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">
                  Personas ({linkedPersonas.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {linkedPersonas.map((p) => (
                    <Link
                      key={p.id}
                      href={`/personas/${p.id}`}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                    >
                      <BeautifulAvatar name={p.name} platform="persona" size="xs" />
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.emotion}</span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">Edit Scenario</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="scenario-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category (optional)</Label>
                  <Input
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. billing, support, onboarding"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Difficulty</Label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this scenario tests..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt">Prompt</Label>
                <Textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="font-mono text-sm min-h-[120px]"
                  rows={8}
                  data-testid="scenario-prompt"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  data-testid="save-scenario"
                >
                  {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
