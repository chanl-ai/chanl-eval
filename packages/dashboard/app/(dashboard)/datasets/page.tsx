'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  Download,
  Play,
  Loader2,
  FileJson2,
  FileText,
  GitCompare,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { DataTable } from '@/components/shared/data-table';
import { PageLayout } from '@/components/shared/page-layout';
import { EmptyState } from '@/components/shared/empty-state';
import { useEvalConfig } from '@/lib/eval-config';
import { toast } from 'sonner';
import { columns, type DatasetRow } from './columns';
import type { Execution, ExportDatasetOptions } from '@chanl/eval-sdk';

const FORMAT_INFO = [
  { value: 'openai', label: 'OpenAI Chat', description: 'OpenAI, Together AI, Fireworks, Axolotl, Unsloth', icon: FileJson2, ext: '.jsonl' },
  { value: 'openai-tools', label: 'OpenAI + Tools', description: 'Same providers, with tool call training data', icon: FileJson2, ext: '.jsonl' },
  { value: 'sharegpt', label: 'ShareGPT', description: 'LLaMA Factory, legacy open-source', icon: FileText, ext: '.json' },
  { value: 'dpo', label: 'DPO Preference', description: 'OpenAI DPO, Together, TRL DPOTrainer', icon: GitCompare, ext: '.jsonl' },
] as const;

// ---------------------------------------------------------------------------
// Generate Dialog
// ---------------------------------------------------------------------------

function GenerateDialog() {
  const { client } = useEvalConfig();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [scenarioId, setScenarioId] = React.useState('');
  const [promptId, setPromptId] = React.useState('');
  const [count, setCount] = React.useState(10);

  const scenariosQ = useQuery({
    queryKey: ['scenarios-list'],
    queryFn: () => client.scenarios.list({ limit: 100 }),
  });

  const promptsQ = useQuery({
    queryKey: ['prompts-list'],
    queryFn: () => client.prompts.list(),
  });

  const generateMut = useMutation({
    mutationFn: () => client.datasets.generate({ scenarioId, promptId, count }),
    onSuccess: (data) => {
      toast.success(`Batch started: ${data.total} conversations queued`);
      queryClient.invalidateQueries({ queryKey: ['executions'] });
      setOpen(false);
    },
    onError: (err: Error) => {
      toast.error(`Generation failed: ${err.message}`);
    },
  });

  const scenarios = scenariosQ.data?.scenarios ?? [];
  const prompts = promptsQ.data?.prompts ?? promptsQ.data ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Play className="mr-2 h-3.5 w-3.5" />
          Generate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Training Data</DialogTitle>
          <DialogDescription>
            Run a scenario with multiple personas to generate conversations for fine-tuning.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Scenario</Label>
            <Select value={scenarioId} onValueChange={setScenarioId}>
              <SelectTrigger><SelectValue placeholder="Select a scenario..." /></SelectTrigger>
              <SelectContent>
                {scenarios.map((s: { id: string; name: string }) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Agent (Prompt)</Label>
            <Select value={promptId} onValueChange={setPromptId}>
              <SelectTrigger><SelectValue placeholder="Select the agent to test..." /></SelectTrigger>
              <SelectContent>
                {(Array.isArray(prompts) ? prompts : []).map((p: { id: string; name?: string; model?: string }) => (
                  <SelectItem key={p.id} value={p.id}>{p.name || p.model || p.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Number of conversations</Label>
            <Input type="number" min={1} max={100} value={count} onChange={(e) => setCount(parseInt(e.target.value) || 10)} />
            <p className="text-xs text-muted-foreground">Each conversation uses a different persona. Max 100.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => generateMut.mutate()} disabled={!scenarioId || !promptId || generateMut.isPending}>
            {generateMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generate {count} Conversations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Export Dialog
// ---------------------------------------------------------------------------

function ExportDialog({ count }: { count: number }) {
  const { client } = useEvalConfig();
  const [open, setOpen] = React.useState(false);
  const [format, setFormat] = React.useState<ExportDatasetOptions['format']>('openai');
  const [minScore, setMinScore] = React.useState<string>('');
  const [exporting, setExporting] = React.useState(false);

  const previewQ = useQuery({
    queryKey: ['dataset-preview', format, minScore],
    queryFn: () => client.datasets.preview(format, minScore ? { minScore: parseInt(minScore) } : undefined),
    enabled: open,
  });

  async function handleExport() {
    setExporting(true);
    try {
      const data = await client.datasets.export({
        format,
        filters: minScore ? { minScore: parseInt(minScore) } : undefined,
      });
      const ext = FORMAT_INFO.find((f) => f.value === format)?.ext || '.jsonl';
      const blob = new Blob([data], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dataset-${format}-${Date.now()}${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      const lineCount = data.split('\n').filter(Boolean).length;
      toast.success(`Exported ${lineCount} examples as ${format} format`);
      setOpen(false);
    } catch (err: unknown) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setExporting(false);
    }
  }

  const preview = previewQ.data;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={count === 0}>
          <Download className="mr-2 h-3.5 w-3.5" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export as Training Data</DialogTitle>
          <DialogDescription>Convert completed runs into fine-tuning datasets.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Format</Label>
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_INFO.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFormat(f.value as ExportDatasetOptions['format'])}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    format === f.value ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <f.icon className={`h-4 w-4 mt-0.5 shrink-0 ${format === f.value ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{f.label}</p>
                    <p className="text-xs text-muted-foreground leading-snug">{f.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Minimum Score (optional)</Label>
            <Input type="number" min={0} max={100} placeholder="e.g. 70" value={minScore} onChange={(e) => setMinScore(e.target.value)} />
          </div>
          {preview && (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium tabular-nums">{preview.count} conversations</p>
                  <p className="text-xs text-muted-foreground">Avg score: {preview.avgScore}</p>
                </div>
                <Badge variant="secondary">{FORMAT_INFO.find((f) => f.value === format)?.ext}</Badge>
              </div>
              {preview.sampleLine && (
                <pre className="mt-2 max-h-24 overflow-auto rounded bg-background p-2 text-[10px] text-muted-foreground font-mono">
                  {JSON.stringify(JSON.parse(preview.sampleLine), null, 2).slice(0, 300)}
                  {preview.sampleLine.length > 300 ? '...' : ''}
                </pre>
              )}
            </div>
          )}
          {previewQ.isLoading && <Skeleton className="h-20 w-full" />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleExport} disabled={exporting || !preview?.count}>
            {exporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Download {preview?.count || 0} Examples
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DatasetsPage() {
  const { client } = useEvalConfig();

  const q = useQuery({
    queryKey: ['executions'],
    queryFn: () => client.executions.list({ limit: 100, status: 'completed' }),
  });

  const rows: DatasetRow[] = React.useMemo(() => {
    const executions = q.data?.executions ?? [];
    return executions.map((e: Execution) => ({
      id: e.id,
      scenarioName: e.scenarioId ? `Scenario ${e.scenarioId.slice(-6)}` : 'Unnamed',
      personaName: e.personaId ? `Persona ${e.personaId.slice(-6)}` : '--',
      score: e.overallScore,
      turns: Math.ceil((e.stepResults?.length ?? 0) / 2),
      duration: e.duration,
      createdAt: e.createdAt,
    }));
  }, [q.data]);

  return (
    <PageLayout
      icon={Database}
      title="Datasets"
      description="Export completed conversation runs as training data for fine-tuning"
      actions={
        <div className="flex items-center gap-2">
          <ExportDialog count={rows.length} />
          <GenerateDialog />
        </div>
      }
    >
      {q.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-destructive text-sm">{(q.error as Error).message}</p>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Database}
              title="No completed runs yet"
              description="Run scenarios to generate conversations, then export them as training data."
              action={{ label: 'Go to Scenarios', href: '/scenarios' }}
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          filterColumn="scenarioName"
          filterPlaceholder="Search conversations..."
          emptyState={
            <EmptyState
              icon={Database}
              title="No matching conversations"
              description="Try adjusting your filters."
            />
          }
        />
      )}
    </PageLayout>
  );
}
