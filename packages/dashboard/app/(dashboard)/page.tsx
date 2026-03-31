'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Loader2,
  Lock,
  MoreHorizontal,
  Play,
  RotateCcw,
  Save,
  Share2,
  User,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScorecardWidget } from '@/components/scorecard/scorecard-widget';
import { BeautifulAvatar } from '@/components/shared/beautiful-avatar';
import { useEvalConfig, type AdapterType } from '@/lib/eval-config';
import type { ScoreMetric } from '@/components/scorecard/types';
import type { Execution, Scenario, Persona } from '@chanl/eval-sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TranscriptMessage {
  role: 'persona' | 'agent';
  content: string;
  stepId?: string;
  latencyMs?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    const isAgent =
      typeof step.stepId === 'string' && step.stepId.includes('agent');

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

// ---------------------------------------------------------------------------
// Model lists per provider
// ---------------------------------------------------------------------------

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
// Transcript Message Component
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: TranscriptMessage }) {
  const isAgent = message.role === 'agent';

  return (
    <div
      className={`flex gap-3 ${isAgent ? 'flex-row-reverse' : ''}`}
      data-testid={`message-${message.role}`}
    >
      <div className="shrink-0 pt-1">
        {isAgent ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
        ) : (
          <BeautifulAvatar name="Persona" platform="persona" size="sm" />
        )}
      </div>
      <div
        className={`max-w-[80%] space-y-1 ${isAgent ? 'items-end text-right' : ''}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {isAgent ? 'Agent' : 'Persona'}
          </span>
          {message.latencyMs != null && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
              {formatDuration(message.latencyMs)}
            </Badge>
          )}
        </div>
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            isAgent
              ? 'bg-primary/10 text-foreground'
              : 'bg-muted text-foreground'
          }`}
        >
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
  const {
    client,
    adapterType,
    setAdapterType,
    agentApiKey,
    setAgentApiKey,
  } = useEvalConfig();
  const queryClient = useQueryClient();

  // Form state
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a helpful customer support agent. Be friendly, concise, and professional.',
  );
  const [model, setModel] = useState('gpt-4o-mini');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(256);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('');

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [completedExecution, setCompletedExecution] = useState<Execution | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Fetch scenarios and personas
  const scenariosQuery = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => client.scenarios.list({ limit: 100 }),
  });

  const personasQuery = useQuery({
    queryKey: ['personas'],
    queryFn: () => client.personas.list({ limit: 100 }),
  });

  const scenarios = scenariosQuery.data?.scenarios ?? [];
  const personas = personasQuery.data?.personas ?? [];

  // Auto-select first scenario/persona when loaded
  useEffect(() => {
    if (scenarios.length > 0 && !selectedScenarioId) {
      setSelectedScenarioId(scenarios[0].id);
    }
  }, [scenarios, selectedScenarioId]);

  useEffect(() => {
    if (personas.length > 0 && !selectedPersonaId) {
      setSelectedPersonaId(personas[0].id);
    }
  }, [personas, selectedPersonaId]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Reset model when provider changes
  useEffect(() => {
    const models = MODEL_OPTIONS[adapterType];
    if (models.length > 0) {
      setModel(models[0].value);
    }
  }, [adapterType]);

  // Load scenario preset into system prompt
  const handleLoadScenario = useCallback(
    (scenarioId: string) => {
      const scenario = scenarios.find((s: Scenario) => s.id === scenarioId);
      if (scenario) {
        setSelectedScenarioId(scenarioId);
        toast.success(`Loaded scenario: ${scenario.name}`);
      }
    },
    [scenarios],
  );

  const handleReset = useCallback(() => {
    setTranscript([]);
    setCompletedExecution(null);
  }, []);

  const handleRun = useCallback(async () => {
    if (!agentApiKey) {
      toast.error('Enter your API key to run tests');
      return;
    }
    if (!selectedScenarioId) {
      toast.error('Select a scenario to run');
      return;
    }

    setIsRunning(true);
    setTranscript([]);
    setCompletedExecution(null);

    try {
      const execution = await client.scenarios.execute(selectedScenarioId, {
        mode: 'text',
        personaId: selectedPersonaId || undefined,
        adapterType,
        adapterConfig: {
          apiKey: agentApiKey,
          model,
          systemPrompt,
          temperature,
          maxTokens,
        },
      } as never);

      const execAny = execution as unknown as { executionId?: string; id: string };
      const execRef = execAny.executionId || execAny.id;

      if (!execRef) {
        throw new Error('No execution ID returned');
      }

      toast.success('Test started...');

      const completed = await client.executions.waitForCompletion(execRef, {
        intervalMs: 1500,
        timeoutMs: 120000,
      });

      const messages = extractTranscript(completed);
      setTranscript(messages);
      setCompletedExecution(completed);

      void queryClient.invalidateQueries({ queryKey: ['executions'] });

      if (completed.status === 'completed') {
        toast.success(
          `Test completed ${completed.overallScore != null ? `- Score: ${completed.overallScore}` : ''}`,
        );
      } else {
        toast.error(`Test ${completed.status}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setIsRunning(false);
    }
  }, [
    agentApiKey,
    selectedScenarioId,
    selectedPersonaId,
    adapterType,
    model,
    systemPrompt,
    temperature,
    maxTokens,
    client,
    queryClient,
  ]);

  const hasResults = transcript.length > 0 || completedExecution != null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      {/* ── Header row ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure your agent and run simulated conversations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Scenario preset loader */}
          <Select
            value={selectedScenarioId}
            onValueChange={handleLoadScenario}
          >
            <SelectTrigger className="w-[200px]" data-testid="scenario-preset-select">
              <SelectValue placeholder="Load a scenario..." />
            </SelectTrigger>
            <SelectContent>
              {scenariosQuery.isLoading ? (
                <div className="px-2 py-1.5">
                  <Skeleton className="h-4 w-full" />
                </div>
              ) : (
                scenarios.map((s: Scenario) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      {s.name}
                      {s.difficulty && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {s.difficulty}
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="sm" disabled>
                <Save className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save preset</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="sm" disabled>
                <Share2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Share</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="sm" disabled>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>More options</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Separator />

      {/* ── Two-column layout: prompt + settings ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Left column: System prompt + submit */}
        <div className="flex flex-col gap-4">
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="You are a helpful customer support agent..."
            className="min-h-[400px] resize-none font-mono text-sm lg:min-h-[600px]"
            data-testid="system-prompt"
          />

          {/* Submit area below textarea */}
          <div className="flex items-center gap-2">
            <Button
              onClick={handleRun}
              disabled={isRunning || !agentApiKey || !selectedScenarioId}
              data-testid="run-test-button"
            >
              {isRunning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Run Test
                </>
              )}
            </Button>

            {hasResults && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleReset}
                    data-testid="reset-button"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset results</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Right column: Settings panel */}
        <div className="space-y-6">
          {/* Provider */}
          <div className="space-y-2">
            <Label htmlFor="provider" className="text-sm">
              Provider
            </Label>
            <Select
              value={adapterType}
              onValueChange={(v) => setAdapterType(v as AdapterType)}
            >
              <SelectTrigger id="provider" data-testid="adapter-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label htmlFor="model" className="text-sm">
              Model
            </Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="model" data-testid="model-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS[adapterType].map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Temperature */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Temperature</Label>
              <span className="text-sm tabular-nums text-muted-foreground">
                {temperature.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[temperature]}
              onValueChange={([v]) => setTemperature(v)}
              min={0}
              max={2}
              step={0.01}
              data-testid="temperature-slider"
            />
          </div>

          {/* Max Tokens */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Max Tokens</Label>
              <span className="text-sm tabular-nums text-muted-foreground">
                {maxTokens}
              </span>
            </div>
            <Slider
              value={[maxTokens]}
              onValueChange={([v]) => setMaxTokens(v)}
              min={1}
              max={4096}
              step={1}
              data-testid="max-tokens-slider"
            />
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="api-key" className="text-sm">
              API Key
            </Label>
            <div className="relative">
              <Input
                id="api-key"
                type="password"
                value={agentApiKey}
                onChange={(e) => setAgentApiKey(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                className="pr-8"
                data-testid="api-key-input"
              />
              <Lock className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Stays on your machine. Never sent to Chanl.
            </p>
          </div>

          <Separator />

          {/* Test Config section */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              Test Config
            </h3>

            <div className="space-y-4">
              {/* Scenario */}
              <div className="space-y-2">
                <Label className="text-sm">Scenario</Label>
                {scenariosQuery.isLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    value={selectedScenarioId}
                    onValueChange={setSelectedScenarioId}
                  >
                    <SelectTrigger data-testid="scenario-select">
                      <SelectValue placeholder="Select a scenario..." />
                    </SelectTrigger>
                    <SelectContent>
                      {scenarios.map((s: Scenario) => (
                        <SelectItem key={s.id} value={s.id}>
                          <span className="flex items-center gap-2">
                            {s.name}
                            {s.difficulty && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {s.difficulty}
                              </Badge>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Persona */}
              <div className="space-y-2">
                <Label className="text-sm">Persona</Label>
                {personasQuery.isLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    value={selectedPersonaId}
                    onValueChange={setSelectedPersonaId}
                  >
                    <SelectTrigger data-testid="persona-select">
                      <SelectValue placeholder="Select a persona..." />
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
            </div>
          </div>
        </div>
      </div>

      {/* ── Results area (full width, below both columns) ── */}

      {/* Running indicator */}
      {isRunning && transcript.length === 0 && (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              Running scenario... this may take 30-60 seconds
            </span>
          </CardContent>
        </Card>
      )}

      {/* Transcript */}
      {transcript.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">Conversation</CardTitle>
              {completedExecution && (
                <div className="flex items-center gap-2">
                  <Badge
                    variant={completedExecution.status === 'completed' ? 'default' : 'destructive'}
                  >
                    {completedExecution.status}
                  </Badge>
                  {completedExecution.duration != null && (
                    <Badge variant="outline" className="font-mono text-xs">
                      {formatDuration(completedExecution.duration)}
                    </Badge>
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

      {/* Scorecard Results */}
      {completedExecution && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Scorecard</CardTitle>
          </CardHeader>
          <CardContent>
            <ScorecardWidget
              metrics={buildMetricsFromExecution(completedExecution)}
              overallScorePercentage={
                completedExecution.overallScore != null
                  ? completedExecution.overallScore
                  : undefined
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
