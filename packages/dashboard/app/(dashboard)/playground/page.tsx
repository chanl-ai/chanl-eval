'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUp,
  Beaker,
  Bot,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  MessageSquare,
  Play,
  RotateCcw,
  Save,
  Square,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { BeautifulAvatar } from '@/components/shared/beautiful-avatar';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig, type AdapterType } from '@/lib/eval-config';
import type { Execution, Scenario, Persona, Prompt, ToolFixture } from '@chanl/eval-sdk';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface TranscriptMessage {
  role: 'persona' | 'agent' | 'tool';
  content: string;
  stepId?: string;
  latencyMs?: number;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result: unknown;
  }>;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function extractTranscript(execution: Execution): TranscriptMessage[] {
  if (!execution.stepResults) return [];
  const messages: TranscriptMessage[] = [];
  for (const step of execution.stepResults) {
    const stepAny = step as Record<string, unknown>;
    const role = stepAny.role as string | undefined;
    const isAgent = role === 'agent' || (typeof step.stepId === 'string' && step.stepId.includes('agent'));
    const isTool = role === 'tool';

    if (isTool) {
      // Use structured toolCalls array from API if available, fall back to parsing JSON
      const apiToolCalls = stepAny.toolCalls as Array<{ name: string; arguments: Record<string, unknown>; result: unknown }> | undefined;
      if (apiToolCalls?.length) {
        messages.push({
          role: 'tool',
          content: '',
          stepId: step.stepId,
          toolCalls: apiToolCalls.map((tc) => ({ name: tc.name, arguments: tc.arguments, result: tc.result })),
        });
      } else {
        try {
          const parsed = JSON.parse(stepAny.actualResponse as string || '{}');
          messages.push({
            role: 'tool',
            content: '',
            stepId: step.stepId,
            toolCalls: [{ name: parsed.name, arguments: parsed.arguments, result: parsed.result }],
          });
        } catch {
          messages.push({ role: 'tool', content: stepAny.actualResponse as string || '', stepId: step.stepId });
        }
      }
      continue;
    }

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

// Shared model options — imported from lib/model-options.ts
import { MODEL_OPTIONS } from '@/lib/model-options';

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
// Tool call block
// ---------------------------------------------------------------------------

function ToolCallBlock({ message }: { message: TranscriptMessage }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const call = message.toolCalls?.[0];
  if (!call) return null;

  return (
    <Card
      className="overflow-hidden border-primary/20"
      data-testid="message-tool"
    >
      <CardHeader
        className="cursor-pointer select-none bg-primary/5 py-2.5 px-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium font-mono">{call.name}</span>
          </div>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-primary">
            completed
          </Badge>
        </div>
        {!isExpanded && call.arguments && (
          <p className="mt-1 text-xs text-muted-foreground truncate pl-8">
            {JSON.stringify(call.arguments)}
          </p>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-3 pb-3 space-y-3">
          {call.arguments && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Arguments</p>
              <pre className="text-xs font-mono bg-muted p-2 rounded-md overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(call.arguments, null, 2)}
              </pre>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Result</p>
            <pre className="text-xs font-mono bg-muted p-2 rounded-md overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
              {typeof call.result === 'string' ? call.result : JSON.stringify(call.result, null, 2)}
            </pre>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Playground Page
// ---------------------------------------------------------------------------

export default function PlaygroundPage() {
  const { client, adapterType, setAdapterType, simApiKey, simModel } = useEvalConfig();
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
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const [sidebarTab, setSidebarTab] = useState('config');

  // Chat state
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<TranscriptMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll chat messages
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Auto-resize chat textarea
  useEffect(() => {
    const ta = chatInputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [chatInput]);

  const handleChatSend = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || isChatLoading) return;

    if (!savedPromptId) {
      toast.error('Save your prompt first before chatting');
      return;
    }

    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'persona', content: msg }]);
    setIsChatLoading(true);

    try {
      // Save prompt with current adapter config before first message
      let sid = chatSessionId;
      if (!sid) {
        await client.prompts.update(savedPromptId, {
          content: systemPrompt,
          adapterConfig: { adapterType, model, temperature, maxTokens },
        } as any);
        const session = await client.chat.createSession({ promptId: savedPromptId });
        sid = session.sessionId;
        setChatSessionId(sid);
      }

      const response = await client.chat.sendMessage(sid, msg);
      setChatMessages((prev) => [...prev, {
        role: 'agent',
        content: response.content,
        latencyMs: response.latencyMs,
      }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send message');
      // Remove the user message on error
      setChatMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, isChatLoading, chatSessionId, savedPromptId, systemPrompt, adapterType, model, temperature, maxTokens, client]);

  const handleChatKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleChatSend();
      }
    },
    [handleChatSend],
  );

  const handleChatReset = useCallback(() => {
    if (chatSessionId) {
      client.chat.endSession(chatSessionId).catch(() => {});
    }
    setChatSessionId(null);
    setChatMessages([]);
    setChatInput('');
  }, [chatSessionId, client]);

  // Load last active chat session on mount
  const [chatRestored, setChatRestored] = useState(false);
  useEffect(() => {
    if (chatRestored) return;
    client.chat.getActiveSession().then((result) => {
      if (result?.sessionId && result?.execution) {
        setChatSessionId(result.sessionId);
        // Restore messages from execution stepResults
        const steps = result.execution.stepResults || [];
        const msgs: TranscriptMessage[] = steps
          .filter((s: any) => s.role === 'persona' || s.role === 'agent')
          .map((s: any) => ({
            role: s.role as 'persona' | 'agent',
            content: s.actualResponse || '',
            latencyMs: s.role === 'agent' ? s.duration : undefined,
          }));
        if (msgs.length > 0) {
          setChatMessages(msgs);
        }
      }
    }).catch(() => {}).finally(() => setChatRestored(true));
  }, [chatRestored, client]);

  // End chat session (keeps transcript, marks execution complete)
  const handleEndChat = useCallback(async () => {
    if (!chatSessionId) return;
    try {
      await client.chat.endSession(chatSessionId);
      toast.success('Chat ended. Transcript saved.');
    } catch {
      // Session may have expired server-side, still clean up locally
    }
    setChatSessionId(null);
    setChatMessages([]);
    setChatInput('');
  }, [chatSessionId, client]);

  // Create new prompt
  async function handleCreatePrompt() {
    try {
      const created = await client.prompts.create({
        name: `Prompt ${savedPrompts.length + 1}`,
        content: DEFAULT_PROMPT,
        adapterConfig: { adapterType, model, temperature, maxTokens },
      } as any);
      setSavedPromptId(created.id);
      setSystemPrompt(DEFAULT_PROMPT);
      setPromptDirty(false);
      handleChatReset();
      void queryClient.invalidateQueries({ queryKey: ['prompts'] });
      toast.success('New prompt created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create prompt');
    }
  }

  // Load prompts from API
  const promptsQuery = useQuery({
    queryKey: ['prompts'],
    queryFn: () => client.prompts.list({ limit: 50 }),
  });
  const savedPrompts = promptsQuery.data?.prompts ?? [];

  // Load first saved prompt on mount
  useEffect(() => {
    if (savedPrompts.length > 0 && !savedPromptId) {
      const first = savedPrompts[0] as any;
      setSavedPromptId(first.id);
      setSystemPrompt(first.content);
      setPromptDirty(false);
      if (first.adapterConfig) {
        if (first.adapterConfig.adapterType) setAdapterType(first.adapterConfig.adapterType as AdapterType);
        if (first.adapterConfig.model) setModel(first.adapterConfig.model);
        if (first.adapterConfig.temperature != null) setTemperature(first.adapterConfig.temperature);
        if (first.adapterConfig.maxTokens != null) setMaxTokens(first.adapterConfig.maxTokens);
      }
    }
  }, [savedPrompts, savedPromptId]);

  function handlePromptChange(value: string) {
    setSystemPrompt(value);
    setPromptDirty(true);
  }

  function handleSelectPrompt(promptId: string) {
    const p = savedPrompts.find((sp) => sp.id === promptId) as any;
    if (p) {
      setSavedPromptId(p.id);
      setSystemPrompt(p.content);
      setPromptDirty(false);
      // Restore adapter config from prompt
      if (p.adapterConfig) {
        if (p.adapterConfig.adapterType) setAdapterType(p.adapterConfig.adapterType as AdapterType);
        if (p.adapterConfig.model) setModel(p.adapterConfig.model);
        if (p.adapterConfig.temperature != null) setTemperature(p.adapterConfig.temperature);
        if (p.adapterConfig.maxTokens != null) setMaxTokens(p.adapterConfig.maxTokens);
      }
    }
  }

  async function handleSavePrompt() {
    setIsSaving(true);
    const configPayload = {
      content: systemPrompt,
      adapterConfig: { adapterType, model, temperature, maxTokens },
    };
    try {
      if (savedPromptId) {
        await client.prompts.update(savedPromptId, configPayload as any);
        toast.success('Prompt saved');
      } else {
        const created = await client.prompts.create({
          name: 'My Prompt',
          ...configPayload,
        } as any);
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
  const toolFixturesQuery = useQuery({ queryKey: ['tool-fixtures'], queryFn: () => client.toolFixtures.list({ limit: 100, isActive: true }) });
  const scenarios = scenariosQuery.data?.scenarios ?? [];
  const personas = personasQuery.data?.personas ?? [];
  const toolFixtures = toolFixturesQuery.data?.toolFixtures ?? [];

  // Auto-select first scenario/persona
  useEffect(() => { if (scenarios.length > 0 && !selectedScenarioId) setSelectedScenarioId(scenarios[0].id); }, [scenarios, selectedScenarioId]);
  useEffect(() => { if (personas.length > 0 && !selectedPersonaId) setSelectedPersonaId(personas[0].id); }, [personas, selectedPersonaId]);

  // Auto-scroll transcript
  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcript]);

  // Reset model when provider changes
  useEffect(() => { const models = MODEL_OPTIONS[adapterType]; if (models.length > 0) setModel(models[0].value); }, [adapterType]);

  const handleReset = useCallback(() => { setTranscript([]); setCompletedExecution(null); }, []);

  const handleRun = useCallback(async () => {
    if (!selectedScenarioId) { toast.error('Select a scenario to run'); return; }

    setIsRunning(true); setTranscript([]); setCompletedExecution(null);

    try {
      // Fetch API key from server-side Settings
      let apiKey: string;
      try {
        apiKey = await client.settings.getApiKey(adapterType);
      } catch {
        toast.error(`No API key configured for ${adapterType}. Set it via PUT /settings.`);
        setIsRunning(false);
        return;
      }

      const execution = await client.scenarios.execute(selectedScenarioId, {
        mode: 'text', personaId: selectedPersonaId || undefined, adapterType,
        adapterConfig: { apiKey, model, systemPrompt, temperature, maxTokens, simulationApiKey: simApiKey || undefined, simulationModel: simModel || undefined },
        toolFixtureIds: selectedToolIds.length > 0 ? selectedToolIds : undefined,
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
  }, [selectedScenarioId, selectedPersonaId, selectedToolIds, adapterType, model, systemPrompt, temperature, maxTokens, client, queryClient]);

  const hasResults = transcript.length > 0 || completedExecution != null;

  return (
    <PageLayout
      icon={Beaker}
      title="Playground"
      description="Configure your agent prompt and run simulated conversations"
      actions={
        <div className="flex items-center gap-2">
          {/* Prompt selector — always visible */}
          {promptsQuery.isLoading ? (
            <Skeleton className="h-8 w-[180px]" />
          ) : (
            <div className="flex items-center gap-1">
              <Select value={savedPromptId ?? ''} onValueChange={handleSelectPrompt}>
                <SelectTrigger className="w-[180px] h-8 text-sm" data-testid="prompt-select">
                  <FileText className="h-3.5 w-3.5 mr-1 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder="Select prompt..." />
                </SelectTrigger>
                <SelectContent>
                  {savedPrompts.map((p: Prompt) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleCreatePrompt}
                data-testid="new-prompt-button"
                title="New prompt"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
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
            disabled={isRunning || !selectedScenarioId}
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

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Tools</Label>
          {toolFixturesQuery.isLoading ? (
            <Skeleton className="h-9 w-[200px]" />
          ) : toolFixtures.length === 0 ? (
            <Button variant="outline" size="sm" className="w-[200px] justify-start text-muted-foreground" disabled>
              <Wrench className="mr-2 h-3.5 w-3.5" />No tools yet
            </Button>
          ) : (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-[200px] justify-between" data-testid="tools-select">
                  <span className="flex items-center gap-2 truncate">
                    <Wrench className="h-3.5 w-3.5 shrink-0" />
                    {selectedToolIds.length === 0
                      ? 'Select tools...'
                      : `${selectedToolIds.length} tool${selectedToolIds.length > 1 ? 's' : ''} selected`}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[260px] p-2" align="start">
                <div className="space-y-1">
                  {toolFixtures.map((tf: ToolFixture) => (
                    <label
                      key={tf.id}
                      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={selectedToolIds.includes(tf.id)}
                        onCheckedChange={(checked) => {
                          setSelectedToolIds((prev) =>
                            checked ? [...prev, tf.id] : prev.filter((id) => id !== tf.id)
                          );
                        }}
                        data-testid={`tool-checkbox-${tf.id}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{tf.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{tf.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {selectedToolIds.length > 0 && (
                  <>
                    <Separator className="my-2" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => setSelectedToolIds([])}
                      data-testid="clear-tools"
                    >
                      Clear all
                    </Button>
                  </>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>

      </div>

      <Separator className="my-2" />

      {/* Two-column layout: System prompt + Model settings */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Left: System prompt */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">System Prompt</CardTitle>
              {hasResults && (
                <Button variant="outline" size="sm" onClick={handleReset} data-testid="reset-button">
                  <RotateCcw className="mr-2 h-3.5 w-3.5" />Clear Results
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <Textarea
              value={systemPrompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              placeholder="You are a helpful customer support agent..."
              className="min-h-[360px] resize-none border-0 bg-transparent p-0 font-mono text-sm shadow-none focus-visible:ring-0 lg:min-h-[460px]"
              data-testid="system-prompt"
            />
          </CardContent>
        </Card>

        {/* Right: Tabbed panel — Config + Chat */}
        <div className="flex flex-col">
          <div className="inline-flex w-full items-center justify-center rounded-lg bg-muted p-[3px] h-9">
            <button
              type="button"
              onClick={() => setSidebarTab('config')}
              className={`relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium transition-all ${sidebarTab === 'config' ? 'bg-background text-foreground shadow-sm' : 'text-foreground/60 hover:text-foreground'}`}
              data-testid="tab-config"
            >
              <Wrench className="h-3.5 w-3.5" />Config
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('chat')}
              className={`relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium transition-all ${sidebarTab === 'chat' ? 'bg-background text-foreground shadow-sm' : 'text-foreground/60 hover:text-foreground'}`}
              data-testid="tab-chat"
            >
              <MessageSquare className="h-3.5 w-3.5" />Chat
            </button>
          </div>

          {/* Config Tab */}
          {sidebarTab === 'config' && <div className="space-y-4 mt-3">
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
                      <SelectItem value="http">Custom HTTP</SelectItem>
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

          </div>}

          {/* Chat Tab */}
          {sidebarTab === 'chat' && <div className="flex flex-col mt-0 min-h-0" style={{ height: 'calc(100vh - 24rem)' }}>
            <Card className="flex flex-col flex-1 min-h-0 overflow-hidden gap-0 py-0">
              {/* Chat header */}
              <CardHeader className="px-3 py-2 shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Chat</CardTitle>
                  <div className="flex items-center gap-1">
                    {chatSessionId && chatMessages.length > 0 && (
                      <Button variant="outline" size="sm" onClick={handleEndChat} className="h-7 px-2 text-xs text-destructive hover:text-destructive" data-testid="chat-end">
                        <Square className="mr-1 h-3 w-3" />End Chat
                      </Button>
                    )}
                    {chatMessages.length > 0 && !chatSessionId && (
                      <Button variant="ghost" size="sm" onClick={handleChatReset} className="h-7 px-2 text-xs" data-testid="chat-new">
                        <Plus className="mr-1 h-3 w-3" />New Chat
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              {/* Messages area */}
              <div className="flex-1 min-h-0 overflow-y-auto px-3" ref={chatScrollRef}>
                {chatMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-8">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
                      <MessageSquare className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Test your prompt</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                      Chat directly with your configured model. Messages are saved as a run.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 py-2">
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex gap-2 ${msg.role === 'persona' ? 'flex-row-reverse' : 'flex-row'}`}
                      >
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarFallback className={msg.role === 'agent' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}>
                            {msg.role === 'agent' ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`flex flex-col gap-0.5 min-w-0 max-w-[85%] ${msg.role === 'persona' ? 'items-end' : 'items-start'}`}>
                          <div className={`rounded-lg px-2.5 py-1.5 text-xs ${
                            msg.role === 'persona' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                          }`}>
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          </div>
                          {msg.latencyMs != null && (
                            <span className="text-[10px] tabular-nums text-muted-foreground px-1">{formatDuration(msg.latencyMs)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {isChatLoading && (
                      <div className="flex gap-2">
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            <Bot className="h-3 w-3" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="rounded-lg bg-muted px-2.5 py-1.5">
                          <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-pulse" />
                            <div className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-pulse [animation-delay:0.2s]" />
                            <div className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-pulse [animation-delay:0.4s]" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Input area */}
              <div className="shrink-0 px-3 pb-3 pt-2">
                <div className="rounded-lg border bg-background p-1.5 flex flex-col gap-1.5">
                  <Textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    placeholder="Type a message..."
                    disabled={isChatLoading || !savedPromptId}
                    className="min-h-[32px] max-h-[120px] resize-none border-0 bg-transparent p-1.5 text-xs shadow-none focus-visible:ring-0"
                    rows={1}
                    data-testid="chat-input"
                  />
                  <div className="flex items-center justify-end">
                    <Button
                      size="icon"
                      className="h-6 w-6 rounded-full shrink-0"
                      disabled={!chatInput.trim() || isChatLoading || !savedPromptId}
                      onClick={handleChatSend}
                      data-testid="chat-send"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {!savedPromptId && (
                  <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Save your prompt first to start chatting</p>
                )}
              </div>
            </Card>
          </div>}
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
              {transcript.map((msg, i) =>
                msg.role === 'tool' ? (
                  <ToolCallBlock key={`${msg.stepId ?? i}-${i}`} message={msg} />
                ) : (
                  <MessageBubble key={`${msg.stepId ?? i}-${i}`} message={msg} />
                )
              )}
              <div ref={transcriptEndRef} />
            </div>
          </CardContent>
        </Card>
      )}

      {completedExecution && (
        <Card className="mt-6">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <Badge variant={completedExecution.status === 'completed' ? 'default' : 'destructive'}>
                {completedExecution.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {completedExecution.stepResults?.length ?? 0} steps
              </span>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/executions/${completedExecution.id}`}>
                View Full Results & Evaluate
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </PageLayout>
  );
}
