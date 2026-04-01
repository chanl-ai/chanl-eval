'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Beaker,
  Bot,
  BookOpen,
  Loader2,
  Lock,
  Play,
  RotateCcw,
  Save,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { ScorecardWidget } from '@/components/scorecard/scorecard-widget';
import { BeautifulAvatar } from '@/components/shared/beautiful-avatar';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig, type AdapterType } from '@/lib/eval-config';
import type { ScoreMetric } from '@/components/scorecard/types';
import type { Execution, Scenario, Persona, Prompt } from '@chanl/eval-sdk';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface TranscriptMessage {
  role: 'persona' | 'agent';
  content: string;
  stepId?: string;
  latencyMs?: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function buildMetricsFromExecution(execution: Execution): ScoreMetric[] {
  if (!execution.stepResults || execution.stepResults.length === 0) return [];
  const passed = execution.stepResults.filter((s) => s.score != null && s.score > 0).length;
  const total = execution.stepResults.length;
  return [
    {
      name: 'Conversation Quality',
      score: passed,
      maxScore: total,
      status: passed >= total * 0.8 ? 'pass' : 'fail',
    },
  ];
}

function extractTranscript(execution: Execution): TranscriptMessage[] {
  if (!execution.stepResults) return [];
  const messages: TranscriptMessage[] = [];
  for (const step of execution.stepResults) {
    const stepAny = step as Record<string, unknown>;
    const isAgent = typeof step.stepId === 'string' && step.stepId.includes('agent');
    const actualResponse = stepAny.actualResponse as string | undefined;
    if (actualResponse) {
      messages.push({
        role: isAgent ? 'agent' : 'persona',
        content: actualResponse,
        stepId: step.stepId,
        latencyMs: typeof stepAny.duration === 'number' ? stepAny.duration : undefined,
      });
    }
  }
  return messages;
}

const MODEL_OPTIONS: Record<AdapterType, { value: string; label: string }[]> = {
  openai: [
    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    { value: 'gpt-4o', label: 'gpt-4o' },
    { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
    { value: 'gpt-4.1', label: 'gpt-4.1' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  ],
};

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: TranscriptMessage }) {
  const isAgent = message.role === 'agent';
  return (
    <div className="flex gap-3" data-testid={`message-${message.role}`}>
      <div className="shrink-0 pt-0.5">
        {isAgent ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bot className="h-4 w-4" />
          </div>
        ) : (
          <BeautifulAvatar name="Persona" platform="persona" size="sm" />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{isAgent ? 'Agent' : 'Persona'}</span>
          {message.latencyMs != null && (
            <span className="text-[10px] tabular-nums text-muted-foreground">{formatDuration(message.latencyMs)}</span>
          )}
        </div>
        <div className={`rounded-lg px-3 py-2 text-sm ${isAgent ? 'bg-primary/5' : 'bg-muted'}`}>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Playground Page
// ---------------------------------------------------------------------------

export default function PlaygroundPage() {
  const { client, adapterType, setAdapterType, agentApiKey, setAgentApiKey } = useEvalConfig();
  const queryClient = useQueryClient();

  const DEFAULT_PROMPT = 'You are a helpful customer support agent. Be friendly, concise, and professional.';

  // Form state
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [promptDirty, setPromptDirty] = useState(false);
  const [savedPromptId, setSavedPromptId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [model, setModel] = useState('gpt-4o-mini');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(256);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('');

  // Load prompts from API
  const promptsQuery = useQuery({
    queryKey: ['prompts'],
    queryFn: () => client.prompts.list({ limit: 50 }),
  });
  const savedPrompts = promptsQuery.data?.prompts ?? [];

  // Load first saved prompt on mount
  useEffect(() => {
    if (savedPrompts.length > 0 && !savedPromptId) {
      const first = savedPrompts[0];
      setSavedPromptId(first.id);
      setSystemPrompt(first.content);
      setPromptDirty(false);
    }
  }, [savedPrompts, savedPromptId]);

  function handlePromptChange(value: string) {
    setSystemPrompt(value);
    setPromptDirty(true);
  }

  function handleSelectPrompt(promptId: string) {
    const p = savedPrompts.find((sp) => sp.id === promptId);
    if (p) {
      setSavedPromptId(p.id);
      setSystemPrompt(p.content);
      setPromptDirty(false);
    }
  }

  async function handleSavePrompt() {
    setIsSaving(true);
    try {
      if (savedPromptId) {
        await client.prompts.update(savedPromptId, { content: systemPrompt });
        toast.success('Prompt saved');
      } else {
        const created = await client.prompts.create({
          name: 'My Prompt',
          content: systemPrompt,
        });
        setSavedPromptId(created.id);
        toast.success('Prompt created');
      }
      setPromptDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['prompts'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save prompt');
    } finally {
      setIsSaving(false);
    }
  }

  // Banner
  const [showBanner, setShowBanner] = useState(false);
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem('chanl-eval-onboarding-dismissed');
      const visited = localStorage.getItem('chanl-eval-playground-visited');
      if (dismissed !== 'true' && visited !== 'true') setShowBanner(true);
      localStorage.setItem('chanl-eval-playground-visited', 'true');
    } catch { /* ignore */ }
  }, []);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [completedExecution, setCompletedExecution] = useState<Execution | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Data queries
  const scenariosQuery = useQuery({ queryKey: ['scenarios'], queryFn: () => client.scenarios.list({ limit: 100 }) });
  const personasQuery = useQuery({ queryKey: ['personas'], queryFn: () => client.personas.list({ limit: 100 }) });
  const scenarios = scenariosQuery.data?.scenarios ?? [];
  const personas = personasQuery.data?.personas ?? [];

  // Auto-select first scenario/persona
  useEffect(() => { if (scenarios.length > 0 && !selectedScenarioId) setSelectedScenarioId(scenarios[0].id); }, [scenarios, selectedScenarioId]);
  useEffect(() => { if (personas.length > 0 && !selectedPersonaId) setSelectedPersonaId(personas[0].id); }, [personas, selectedPersonaId]);

  // Auto-scroll transcript
  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcript]);

  // Reset model when provider changes
  useEffect(() => { const models = MODEL_OPTIONS[adapterType]; if (models.length > 0) setModel(models[0].value); }, [adapterType]);

  const handleReset = useCallback(() => { setTranscript([]); setCompletedExecution(null); }, []);

  const handleRun = useCallback(async () => {
    if (!agentApiKey) { toast.error('Enter your API key to run tests'); return; }
    if (!selectedScenarioId) { toast.error('Select a scenario to run'); return; }

    setIsRunning(true); setTranscript([]); setCompletedExecution(null);

    try {
      const execution = await client.scenarios.execute(selectedScenarioId, {
        mode: 'text', personaId: selectedPersonaId || undefined, adapterType,
        adapterConfig: { apiKey: agentApiKey, model, systemPrompt, temperature, maxTokens },
      } as never);

      const execAny = execution as unknown as { executionId?: string; id: string };
      const execRef = execAny.executionId || execAny.id;
      if (!execRef) throw new Error('No execution ID returned');
      toast.success('Test started...');

      const completed = await client.executions.waitForCompletion(execRef, { intervalMs: 1500, timeoutMs: 120000 });
      setTranscript(extractTranscript(completed));
      setCompletedExecution(completed);
      void queryClient.invalidateQueries({ queryKey: ['executions'] });

      if (completed.status === 'completed') {
        toast.success(`Test completed${completed.overallScore != null ? ` — Score: ${completed.overallScore}%` : ''}`);
      } else { toast.error(`Test ${completed.status}`); }
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Execution failed'); }
    finally { setIsRunning(false); }
  }, [agentApiKey, selectedScenarioId, selectedPersonaId, adapterType, model, systemPrompt, temperature, maxTokens, client, queryClient]);

  const hasResults = transcript.length > 0 || completedExecution != null;

  return (
    <PageLayout
      icon={Beaker}
      title="Playground"
      description="Configure your agent prompt and run simulated conversations"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSavePrompt}
            disabled={!promptDirty || isSaving}
            data-testid="save-prompt-button"
          >
            {isSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
            {promptDirty ? 'Save Prompt' : 'Saved'}
          </Button>
          <Button
            onClick={handleRun}
            disabled={isRunning || !agentApiKey || !selectedScenarioId}
            data-testid="run-test-button"
          >
            {isRunning ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running...</>
            ) : (
              <><Play className="mr-2 h-4 w-4" />Run Test</>
            )}
          </Button>
        </div>
      }
    >
      {/* Getting Started banner */}
      {showBanner && (
        <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 mb-2" data-testid="getting-started-banner">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-4 w-4 text-primary shrink-0" />
            <p className="text-sm">
              New here?{' '}
              <Link href="/" className="font-medium text-primary underline-offset-4 hover:underline">Getting Started guide</Link>
            </p>
          </div>
          <button onClick={() => { setShowBanner(false); try { localStorage.setItem('chanl-eval-onboarding-dismissed', 'true'); } catch { /* ignore */ } }} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Test config row — scenario + persona + prompt selectors */}
      <div className="flex flex-wrap items-end gap-6 -mt-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Scenario</Label>
          {scenariosQuery.isLoading ? (
            <Skeleton className="h-9 w-[200px]" />
          ) : (
            <Select value={selectedScenarioId} onValueChange={setSelectedScenarioId}>
              <SelectTrigger className="w-[200px]" data-testid="scenario-select">
                <SelectValue placeholder="Select scenario..." />
              </SelectTrigger>
              <SelectContent>
                {scenarios.map((s: Scenario) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      {s.name}
                      {s.difficulty && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{s.difficulty}</Badge>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Persona</Label>
          {personasQuery.isLoading ? (
            <Skeleton className="h-9 w-[200px]" />
          ) : (
            <Select value={selectedPersonaId} onValueChange={setSelectedPersonaId}>
              <SelectTrigger className="w-[200px]" data-testid="persona-select">
                <SelectValue placeholder="Select persona..." />
              </SelectTrigger>
              <SelectContent>
                {personas.map((p: Persona) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      {p.name}
                      <span className="text-xs text-muted-foreground">{p.emotion}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {savedPrompts.length > 1 && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Saved Prompt</Label>
            <Select value={savedPromptId ?? ''} onValueChange={handleSelectPrompt}>
              <SelectTrigger className="w-[200px]" data-testid="prompt-select">
                <SelectValue placeholder="Select prompt..." />
              </SelectTrigger>
              <SelectContent>
                {savedPrompts.map((p: Prompt) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Separator className="my-2" />

      {/* Two-column layout: System prompt + Model settings */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Left: System prompt */}
        <div className="flex flex-col gap-3">
          <Label className="text-sm font-medium">System Prompt</Label>
          <Textarea
            value={systemPrompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            placeholder="You are a helpful customer support agent..."
            className="min-h-[400px] resize-none font-mono text-sm lg:min-h-[500px]"
            data-testid="system-prompt"
          />
          {hasResults && (
            <Button variant="outline" size="sm" onClick={handleReset} className="w-fit" data-testid="reset-button">
              <RotateCcw className="mr-2 h-3.5 w-3.5" />Clear Results
            </Button>
          )}
        </div>

        {/* Right: Model + API Key only */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Model</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Provider</Label>
                <Select value={adapterType} onValueChange={(v) => setAdapterType(v as AdapterType)}>
                  <SelectTrigger data-testid="adapter-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Model</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger data-testid="model-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS[adapterType].map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Temperature</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">{temperature.toFixed(2)}</span>
                </div>
                <Slider value={[temperature]} onValueChange={([v]) => setTemperature(v)} min={0} max={2} step={0.01} data-testid="temperature-slider" />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Max Tokens</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">{maxTokens}</span>
                </div>
                <Slider value={[maxTokens]} onValueChange={([v]) => setMaxTokens(v)} min={1} max={4096} step={1} data-testid="max-tokens-slider" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">API Key</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="relative">
                <Input type="password" value={agentApiKey} onChange={(e) => setAgentApiKey(e.target.value)} placeholder="sk-..." autoComplete="off" className="pr-8" data-testid="api-key-input" />
                <Lock className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <p className="text-[11px] text-muted-foreground">Stays on your machine. Never sent to Chanl.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Results area */}
      {isRunning && transcript.length === 0 && (
        <Card className="mt-6">
          <CardContent className="flex items-center justify-center gap-3 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Running scenario... this may take 30-60 seconds</span>
          </CardContent>
        </Card>
      )}

      {transcript.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">Conversation</CardTitle>
              {completedExecution && (
                <div className="flex items-center gap-2">
                  <Badge variant={completedExecution.status === 'completed' ? 'default' : 'destructive'}>{completedExecution.status}</Badge>
                  {completedExecution.duration != null && (
                    <span className="text-xs tabular-nums text-muted-foreground">{formatDuration(completedExecution.duration)}</span>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="scrollbar-thin max-h-[50vh] space-y-4 overflow-y-auto pr-1">
              {transcript.map((msg, i) => (
                <MessageBubble key={`${msg.stepId ?? i}-${i}`} message={msg} />
              ))}
              <div ref={transcriptEndRef} />
            </div>
          </CardContent>
        </Card>
      )}

      {completedExecution && (
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Scorecard</CardTitle>
          </CardHeader>
          <CardContent>
            <ScorecardWidget
              metrics={buildMetricsFromExecution(completedExecution)}
              overallScorePercentage={completedExecution.overallScore ?? undefined}
            />
          </CardContent>
        </Card>
      )}
    </PageLayout>
  );
}
