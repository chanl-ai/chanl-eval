'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Beaker, Copy, Repeat, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { PageLayout } from '@/components/shared/page-layout';
import { RunSetDialog } from '@/components/run-sets/run-set-dialog';
import { SaveAsNewAgentDialog } from '@/components/agents/save-as-new-agent-dialog';
import { useEvalConfig } from '@/lib/eval-config';
import { playgroundHref, rememberLastAgent } from '@/lib/playground-link';

export default function AgentDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const qc = useQueryClient();
  const { client } = useEvalConfig();
  const q = useQuery({ queryKey: ['prompt', id], queryFn: () => client.prompts.get(id), enabled: !!id });

  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [copyOpen, setCopyOpen] = useState(false);
  const [dialog, setDialog] = useState<'reliability' | 'redteam' | null>(null);

  useEffect(() => {
    if (q.data) { setName(q.data.name); setContent(q.data.content); }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => client.prompts.update(id, { name, content }),
    onSuccess: () => {
      toast.success('Agent saved');
      void qc.invalidateQueries({ queryKey: ['prompt', id] });
      void qc.invalidateQueries({ queryKey: ['prompts'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dirty = !!q.data && (name !== q.data.name || content !== q.data.content);

  return (
    <PageLayout
      backHref="/agents"
      title={q.data?.name ?? 'Agent'}
      description={q.data?.adapterConfig?.model ? `Model: ${q.data.adapterConfig.model}` : 'Agent under test'}
      actions={
        q.data ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending} data-testid="save-agent">
              {save.isPending ? 'Saving...' : 'Save'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCopyOpen(true)} data-testid="save-as-new-agent">
              <Copy className="mr-2 h-3.5 w-3.5" />
              Save as new agent
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog('reliability')} data-testid="agent-run-x5">
              <Repeat className="mr-2 h-3.5 w-3.5" />
              Run ×5
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog('redteam')} data-testid="redteam-scan">
              <ShieldAlert className="mr-2 h-3.5 w-3.5" />
              Red-team scan
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { rememberLastAgent(id); router.push(playgroundHref({ agentId: id })); }} data-testid="agent-playground">
              <Beaker className="mr-2 h-3.5 w-3.5" />
              Playground
            </Button>
          </div>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-72 w-full max-w-3xl" />
      ) : q.isError ? (
        <Card><CardContent className="py-6 text-sm text-destructive">{(q.error as Error).message}</CardContent></Card>
      ) : q.data ? (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base font-medium">System prompt</CardTitle>
            <p className="text-sm text-muted-foreground">
              Edit and save to change this agent, or save a copy to compare the two versions.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-name">Name</Label>
              <Input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-content">Instructions</Label>
              <Textarea id="agent-content" value={content} onChange={(e) => setContent(e.target.value)}
                className="font-mono text-sm min-h-[320px]" />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {q.data && (
        <SaveAsNewAgentDialog open={copyOpen} onOpenChange={setCopyOpen} source={{ ...q.data, name, content }} />
      )}
      <RunSetDialog open={dialog === 'reliability'} onOpenChange={(o) => setDialog(o ? 'reliability' : null)}
        kind="reliability" promptId={id} />
      <RunSetDialog open={dialog === 'redteam'} onOpenChange={(o) => setDialog(o ? 'redteam' : null)}
        kind="redteam" promptId={id} />
    </PageLayout>
  );
}
