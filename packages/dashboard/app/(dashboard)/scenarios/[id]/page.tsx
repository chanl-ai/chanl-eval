'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useEvalConfig } from '@/lib/eval-config';
import { buildExecutePayload } from '@/lib/execute-scenario';
import { toast } from 'sonner';

export default function ScenarioDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const qc = useQueryClient();
  const { client, apiKey, adapterType, agentApiKey } = useEvalConfig();

  const q = useQuery({
    queryKey: ['scenario', id, apiKey],
    queryFn: () => client.scenarios.get(id),
    enabled: !!apiKey && !!id,
  });

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<string>('active');

  useEffect(() => {
    if (q.data) {
      setName(q.data.name);
      setPrompt(q.data.prompt);
      setStatus(q.data.status ?? 'active');
    }
  }, [q.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await client.scenarios.update(id, {
        name,
        prompt,
        status: status as 'draft' | 'active' | 'paused' | 'completed' | 'archived',
      });
    },
    onSuccess: () => {
      toast.success('Scenario saved');
      void qc.invalidateQueries({ queryKey: ['scenario', id] });
      void qc.invalidateQueries({ queryKey: ['scenarios'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!agentApiKey) {
        throw new Error('Add an agent API key in Settings to run scenarios.');
      }
      const payload = buildExecutePayload(adapterType, agentApiKey);
      const exec = await client.scenarios.execute(id, payload as never);
      return exec;
    },
    onSuccess: async (exec) => {
      toast.success('Run started — waiting for completion…');
      const ex = exec as { id?: string; executionId?: string };
      const ref = ex.executionId || ex.id;
      if (!ref) throw new Error('No execution id');
      const done = await client.executions.waitForCompletion(ref);
      toast.success(`Finished: ${done.status}`);
      void qc.invalidateQueries({ queryKey: ['executions'] });
      const out = done as { id?: string; executionId?: string };
      const routeId = out.executionId || out.id || ref;
      router.push(`/executions/${encodeURIComponent(routeId)}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Link href="/scenarios" className="text-muted-foreground text-sm hover:underline">
          ← Scenarios
        </Link>
        {!apiKey ? (
          <p className="text-muted-foreground text-sm">
            Configure API key in <Link href="/settings">Settings</Link>.
          </p>
        ) : q.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : q.isError ? (
          <p className="text-destructive">{(q.error as Error).message}</p>
        ) : q.data ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>Edit scenario</CardTitle>
                  <CardDescription>Update prompt and metadata, then run against your agent.</CardDescription>
                </div>
                <Button
                  onClick={() => runMutation.mutate()}
                  disabled={runMutation.isPending || !agentApiKey}
                >
                  {runMutation.isPending ? 'Running…' : 'Run'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">draft</SelectItem>
                    <SelectItem value="active">active</SelectItem>
                    <SelectItem value="paused">paused</SelectItem>
                    <SelectItem value="archived">archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt">Prompt</Label>
                <Textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={8} />
              </div>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
