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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { PageLayout } from '@/components/shared/page-layout';
import { EmptyState } from '@/components/shared/empty-state';
import { useEvalConfig } from '@/lib/eval-config';
import { toast } from 'sonner';
import type { ExportDatasetOptions } from '@chanl/eval-sdk';

const FORMAT_INFO = [
  {
    value: 'openai',
    label: 'OpenAI Chat',
    description: 'OpenAI, Together AI, Fireworks, Axolotl, Unsloth',
    icon: FileJson2,
    ext: '.jsonl',
  },
  {
    value: 'openai-tools',
    label: 'OpenAI + Tools',
    description: 'Same providers, includes tool call training data',
    icon: FileJson2,
    ext: '.jsonl',
  },
  {
    value: 'sharegpt',
    label: 'ShareGPT',
    description: 'LLaMA Factory, legacy open-source fine-tuning',
    icon: FileText,
    ext: '.json',
  },
  {
    value: 'dpo',
    label: 'DPO Preference',
    description: 'OpenAI DPO, Together preference, TRL DPOTrainer',
    icon: GitCompare,
    ext: '.jsonl',
  },
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
    mutationFn: async () => {
      const res = await client.datasets.generate({
        scenarioId,
        promptId,
        count,
      });
      return res;
    },
    onSuccess: (data) => {
      toast.success(`Batch started: ${data.total} conversations queued`);
      queryClient.invalidateQueries({ queryKey: ['batches'] });
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
        <Button>
          <Play className="mr-2 h-4 w-4" />
          Generate Dataset
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
              <SelectTrigger>
                <SelectValue placeholder="Select a scenario..." />
              </SelectTrigger>
              <SelectContent>
                {scenarios.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Agent (Prompt)</Label>
            <Select value={promptId} onValueChange={setPromptId}>
              <SelectTrigger>
                <SelectValue placeholder="Select the agent to test..." />
              </SelectTrigger>
              <SelectContent>
                {(Array.isArray(prompts) ? prompts : []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name || p.model || p.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Number of conversations</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 10)}
            />
            <p className="text-xs text-muted-foreground">
              Each conversation uses a different persona. Max 100.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => generateMut.mutate()}
            disabled={!scenarioId || !promptId || generateMut.isPending}
          >
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

function ExportDialog() {
  const { client } = useEvalConfig();
  const [open, setOpen] = React.useState(false);
  const [format, setFormat] = React.useState<ExportDatasetOptions['format']>('openai');
  const [minScore, setMinScore] = React.useState<string>('');
  const [exporting, setExporting] = React.useState(false);

  const previewQ = useQuery({
    queryKey: ['dataset-preview', format, minScore],
    queryFn: () => client.datasets.preview(
      format,
      minScore ? { minScore: parseInt(minScore) } : undefined,
    ),
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
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  const selectedFormat = FORMAT_INFO.find((f) => f.value === format);
  const preview = previewQ.data;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export Training Data
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export as Training Data</DialogTitle>
          <DialogDescription>
            Convert completed conversation runs into fine-tuning datasets.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Format picker */}
          <div className="space-y-2">
            <Label>Format</Label>
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_INFO.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFormat(f.value as ExportDatasetOptions['format'])}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    format === f.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30'
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

          {/* Filters */}
          <div className="space-y-2">
            <Label>Minimum Score (optional)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              placeholder="e.g. 70"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Only include conversations that scored at least this on the scorecard.
            </p>
          </div>

          {/* Preview */}
          {preview && (
            <Card className="bg-muted/50">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{preview.count} conversations</p>
                    <p className="text-xs text-muted-foreground">Avg score: {preview.avgScore}</p>
                  </div>
                  <Badge variant="secondary">{selectedFormat?.ext}</Badge>
                </div>
                {preview.sampleLine && (
                  <pre className="mt-2 max-h-24 overflow-auto rounded bg-background p-2 text-[10px] text-muted-foreground">
                    {JSON.stringify(JSON.parse(preview.sampleLine), null, 2).slice(0, 300)}
                    {preview.sampleLine.length > 300 ? '...' : ''}
                  </pre>
                )}
              </CardContent>
            </Card>
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

  const previewQ = useQuery({
    queryKey: ['dataset-preview-default'],
    queryFn: () => client.datasets.preview('openai'),
  });

  const preview = previewQ.data;

  return (
    <PageLayout
      icon={Database}
      title="Datasets"
      description="Generate and export training data from conversation runs"
      actions={
        <div className="flex items-center gap-2">
          <ExportDialog />
          <GenerateDialog />
        </div>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Available Conversations</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {previewQ.isLoading ? <Skeleton className="h-8 w-16" /> : preview?.count ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Completed runs ready for export</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average Score</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {previewQ.isLoading ? <Skeleton className="h-8 w-16" /> : preview?.avgScore ?? '-'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Across all completed runs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Export Formats</CardDescription>
            <CardTitle className="text-2xl tabular-nums">4</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">OpenAI, OpenAI+Tools, ShareGPT, DPO</p>
          </CardContent>
        </Card>
      </div>

      {/* Format cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FORMAT_INFO.map((f) => (
          <Card key={f.value}>
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base">{f.label}</CardTitle>
                <CardDescription className="mt-1">{f.description}</CardDescription>
              </div>
              <Badge variant="outline">{f.ext}</Badge>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Empty state if no data */}
      {!previewQ.isLoading && (!preview?.count) && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Database}
              title="No conversations yet"
              description="Run some scenarios first, then come back to export them as training data."
              action={{ label: 'Go to Scenarios', href: '/scenarios' }}
            />
          </CardContent>
        </Card>
      )}
    </PageLayout>
  );
}
