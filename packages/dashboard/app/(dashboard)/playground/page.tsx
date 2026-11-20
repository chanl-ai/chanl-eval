'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUp,
  Beaker,
  Bot,
  BookOpen,
  FileText,
  Loader2,
  Plus,
  MessageSquare,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { BeautifulAvatar } from '@/components/shared/beautiful-avatar';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig, type AdapterType } from '@/lib/eval-config';
import type { Execution, Scenario, Persona, Prompt, ToolFixture } from '@chanl/eval-sdk';
import { ToolCallList } from '@/components/shared/tool-call-list';
import { agentForScenario, scenarioForAgent, scorecardPercent, stepsToLines, type ToolCallView } from '@/lib/workshop';
import { readLastAgent, rememberLastAgent } from '@/lib/playground-link';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface TranscriptMessage {
  role: 'persona' | 'agent' | 'tool';
  content: string;
  stepId?: string;
  latencyMs?: number;
  toolCalls?: ToolCallView[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function extractTranscript(execution: Execution): TranscriptMessage[] {
  return stepsToLines((execution.stepResults ?? []) as Array<Record<string, unknown>>);
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
  if (!message.toolCalls?.length) return null;
  return <ToolCallList calls={message.toolCalls} />;
}

// ---------------------------------------------------------------------------
// Main Playground Page
// ---------------------------------------------------------------------------

export default function PlaygroundPage() {
  // useSearchParams needs a Suspense boundary or the static build bails out of the page.
  return (
    <Suspense>
      <Playground />
    </Suspense>
  );
}

function Playground() {
  const { client, adapterType, setAdapterType, room } = useEvalConfig();
  const searchParams = useSearchParams();
  // What the page was opened to run (scenario page "Run", agent page "Playground", run "Run again").
  const linked = {
    scenario: searchParams.get('scenario') ?? '',
    agent: searchParams.get('agent') ?? '',
    persona: searchParams.get('persona') ?? '',
    scorecard: searchParams.get('scorecard') ?? '',
  };
  const hasLink = !!(linked.scenario || linked.agent);
  const queryClient = useQueryClient();
  const router = useRouter();

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
  const [selectedScorecardId, setSelectedScorecardId] = useState<string>('');
  const [sidebarTab, setSidebarTab] = useState('config');

  // Chat state
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<TranscriptMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [endChatOpen, setEndChatOpen] = useState(false);
  const [deletePromptOpen, setDeletePromptOpen] = useState(false);
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
        const session = await client.chat.createSession({
          promptId: savedPromptId,
          toolFixtureIds: selectedToolIds.length > 0 ? selectedToolIds : undefined,
        });
        sid = session.sessionId;
        setChatSessionId(sid);
      }

      const response = await client.chat.sendMessage(sid, msg);
      const calls = stepsToLines([{ role: 'agent', toolCalls: response.toolCalls }])[0]?.toolCalls ?? [];
      setChatMessages((prev) => [
        ...prev,
        ...(calls.length > 0 ? [{ role: 'tool' as const, content: '', toolCalls: calls }] : []),
        { role: 'agent', content: response.content, latencyMs: response.latencyMs },
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send message');
      // Remove the user message on error
      setChatMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsChatLoading(false);
      chatInputRef.current?.focus();
    }
  }, [chatInput, isChatLoading, chatSessionId, savedPromptId, selectedToolIds, systemPrompt, adapterType, model, temperature, maxTokens, client]);

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

  // Load last active chat session on mount. A link to a scenario or agent starts fresh instead:
  // the old session is bound to whichever agent and tools it was created with.
  const [chatRestored, setChatRestored] = useState(false);
  const [restoredPromptId, setRestoredPromptId] = useState<string | null>(null);
  useEffect(() => {
    if (chatRestored) return;
    client.chat.getActiveSession().then((result) => {
      if (!result?.sessionId || !result?.execution) return;
      if (hasLink) {
        client.chat.endSession(result.sessionId).catch(() => {});
        return;
      }
      setChatSessionId(result.sessionId);
      const pid = result.execution.promptId;
      if (pid) setRestoredPromptId(String(pid));
      const msgs = stepsToLines(result.execution.stepResults || []);
      if (msgs.length > 0) setChatMessages(msgs);
    }).catch(() => {}).finally(() => setChatRestored(true));
  }, [chatRestored, client, hasLink]);

  /** A chat session keeps the agent and tools it started with, so changing either starts a new one. */
  const restartChatFor = useCallback(() => {
    if (chatSessionId) client.chat.endSession(chatSessionId).catch(() => {});
    setChatSessionId(null);
    setChatMessages([]);
  }, [chatSessionId, client]);

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

  function handlePromptChange(value: string) {
    setSystemPrompt(value);
    setPromptDirty(true);
  }

  function applyPrompt(promptId: string) {
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

  function handleSelectPrompt(promptId: string) {
    if (promptId !== savedPromptId) restartChatFor();
    applyPrompt(promptId);
    rememberLastAgent(promptId);
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

  // Pick the scenario, its persona, scorecard and agent once everything has loaded: from the link
  // when there is one, else the restored chat's agent or the last agent picked.
  const [initialized, setInitialized] = useState(false);
  const dataReady = promptsQuery.isSuccess && scenariosQuery.isSuccess && personasQuery.isSuccess && chatRestored;
  useEffect(() => {
    if (initialized || !dataReady) return;
    setInitialized(true);
    const linkedAgent = savedPrompts.find((p) => p.id === linked.agent);
    const scenarioId = linked.scenario || scenarioForAgent(linkedAgent, scenarios);
    const scenario = scenarios.find((s: Scenario) => s.id === scenarioId) ?? scenarios[0];
    if (scenario) setSelectedScenarioId(scenario.id);
    const personaId = linked.persona || scenario?.personaIds?.[0] || personas[0]?.id;
    if (personaId) setSelectedPersonaId(personaId);
    setSelectedScorecardId(linked.scorecard || scenario?.scorecardId || '');
    const last = readLastAgent();
    const has = (id: string | null | undefined) => !!id && savedPrompts.some((p) => p.id === id);
    const agentId = has(linked.agent) ? linked.agent
      : linked.scenario ? agentForScenario(scenario, savedPrompts, last) ?? savedPrompts[0]?.id
      : has(restoredPromptId) ? restoredPromptId!
      : has(last) ? last! : savedPrompts[0]?.id;
    if (agentId) applyPrompt(agentId);
    if (has(linked.agent)) rememberLastAgent(linked.agent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, dataReady]);

  // Every mock tool starts ticked; the lesson is watching which ones the agent chooses to call.
  const [toolsInitialized, setToolsInitialized] = useState(false);
  useEffect(() => {
    if (toolsInitialized || !toolFixturesQuery.isSuccess) return;
    setToolsInitialized(true);
    setSelectedToolIds(toolFixtures.map((t: ToolFixture) => t.id));
  }, [toolsInitialized, toolFixturesQuery.isSuccess, toolFixtures]);

  function handleSelectScenario(id: string) {
    setSelectedScenarioId(id);
    const scenario = scenarios.find((s: Scenario) => s.id === id);
    if (scenario?.personaIds?.[0]) setSelectedPersonaId(scenario.personaIds[0]);
    setSelectedScorecardId(scenario?.scorecardId ?? '');
    const agentId = agentForScenario(scenario, savedPrompts, readLastAgent());
    if (agentId && agentId !== savedPromptId && !promptDirty) handleSelectPrompt(agentId);
  }

  // Auto-scroll transcript
  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcript]);

  // Reset model when provider changes
  useEffect(() => { const models = MODEL_OPTIONS[adapterType]; if (models.length > 0) setModel(models[0].value); }, [adapterType]);

  const handleReset = useCallback(() => { setTranscript([]); setCompletedExecution(null); }, []);

  const handleRun = useCallback(async () => {
    if (!selectedScenarioId) { toast.error('Select a scenario to run'); return; }
    if (!savedPromptId) { toast.error('Save your prompt first before running a test'); return; }

    setIsRunning(true); setTranscript([]); setCompletedExecution(null);

    try {
      // Save prompt with current adapter config before executing
      await client.prompts.update(savedPromptId, {
        content: systemPrompt,
        adapterConfig: { adapterType, model, temperature, maxTokens },
      } as any);

      // Execute with promptId only — server resolves adapter config + API key from Prompt + Settings
      const execution = await client.scenarios.execute(selectedScenarioId, {
        promptId: savedPromptId,
        personaId: selectedPersonaId || undefined,
        toolFixtureIds: selectedToolIds.length > 0 ? selectedToolIds : undefined,
        scorecardId: selectedScorecardId || undefined,
      });

      const execAny = execution as unknown as { executionId?: string; id: string };
      const execRef = execAny.executionId || execAny.id;
      if (!execRef) throw new Error('No execution ID returned');
      toast.success('Test started...');

      const completed = await client.executions.waitForCompletion(execRef, { intervalMs: 1500, timeoutMs: 120000 });
      setTranscript(extractTranscript(completed));
      setCompletedExecution(completed);
      void queryClient.invalidateQueries({ queryKey: ['executions'] });

      if (completed.status === 'completed') {
        const score = (completed as Execution & { scorePercent?: number | null }).scorePercent
          ?? scorecardPercent(completed as { scorecardResults?: { overallScore?: number } });
        toast.success(`Test completed${score != null ? ` — Score: ${score}%` : ''}`);
      } else { toast.error(`Test ${completed.status}`); }
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Execution failed'); }
    finally { setIsRunning(false); }
  }, [selectedScenarioId, savedPromptId, selectedPersonaId, selectedToolIds, selectedScorecardId, adapterType, model, systemPrompt, temperature, maxTokens, client, queryClient]);

  const hasResults = transcript.length > 0 || completedExecution != null;

  return (
    <PageLayout
      icon={Beaker}
      title="Playground"
      description="Configure your agent prompt and run simulated conversations"
      actions={
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Scenario</Label>
            {scenariosQuery.isLoading ? (
              <Skeleton className="h-9 w-[180px]" />
            ) : (
              <Select value={selectedScenarioId} onValueChange={handleSelectScenario}>
                <SelectTrigger className="w-[180px] h-9" data-testid="scenario-select">
                  <SelectValue placeholder="Select..." />
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
          <div className="space-y-1">
            <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Persona</Label>
            {personasQuery.isLoading ? (
              <Skeleton className="h-9 w-[160px]" />
            ) : (
              <Select value={selectedPersonaId} onValueChange={setSelectedPersonaId}>
                <SelectTrigger className="w-[160px] h-9" data-testid="persona-select">
                  <SelectValue placeholder="Select..." />
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
          {!room.cloud && <div className="w-px h-9 bg-border" />}
          {!room.cloud && <Button
            variant="outline"
            onClick={() => {
              const prompt = encodeURIComponent(systemPrompt);
              router.push(`/generate?prompt=${prompt}`);
            }}
            disabled={!systemPrompt.trim()}
            data-testid="generate-scenarios-button"
          >
            <Sparkles className="mr-2 h-4 w-4" />Generate Scenarios
          </Button>}
        </div>
      }
    >
      {/* Getting Started banner */}
      {showBanner && !room.cloud && (
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

      {/* Two-column layout: System prompt + Config/Chat */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Left: System prompt */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">System Prompt</CardTitle>
              <div className="flex items-center gap-2">
                {/* Prompt actions: save + clear */}
                <div className="flex items-center gap-1">
                  {hasResults && (
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={handleReset} data-testid="reset-button">
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />Clear
                    </Button>
                  )}
                  <Button
                    variant={promptDirty ? 'default' : 'ghost'}
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={handleSavePrompt}
                    disabled={!promptDirty || isSaving}
                    data-testid="save-prompt-button"
                  >
                    {isSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                    {promptDirty ? 'Save' : 'Saved'}
                  </Button>
                </div>

                <div className="w-px h-6 bg-border" />

                {/* Prompt selector + new + delete */}
                <div className="flex items-center gap-1">
                  {promptsQuery.isLoading ? (
                    <Skeleton className="h-8 w-[140px]" />
                  ) : (
                    <Select value={savedPromptId ?? ''} onValueChange={handleSelectPrompt}>
                      <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="prompt-select">
                        <SelectValue placeholder="Prompt..." />
                      </SelectTrigger>
                      <SelectContent>
                        {savedPrompts.map((p: Prompt) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleCreatePrompt} data-testid="new-prompt-button" title="New prompt">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  {savedPromptId && savedPrompts.length > 1 && (
                    <>
                      <div className="w-px h-4 bg-border" />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeletePromptOpen(true)}
                        data-testid="delete-prompt-button"
                        title="Delete prompt"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
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
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Model</CardTitle>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
                    <Link href="/settings">API Keys</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Provider</Label>
                  <Select value={adapterType} onValueChange={(v) => { setAdapterType(v as AdapterType); setPromptDirty(true); }}>
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
                  <Select value={model} onValueChange={(v) => { setModel(v); setPromptDirty(true); }}>
                    <SelectTrigger data-testid="model-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODEL_OPTIONS[adapterType]?.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          <span>{m.label}</span>
                          {m.description && <span className="ml-2 text-muted-foreground text-xs">{m.description}</span>}
                        </SelectItem>
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
                  <Slider value={[temperature]} onValueChange={([v]) => { setTemperature(v); setPromptDirty(true); }} min={0} max={2} step={0.01} data-testid="temperature-slider" />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Max Tokens</Label>
                    <span className="text-xs tabular-nums text-muted-foreground">{maxTokens}</span>
                  </div>
                  <Slider value={[maxTokens]} onValueChange={([v]) => { setMaxTokens(v); setPromptDirty(true); }} min={1} max={4096} step={1} data-testid="max-tokens-slider" />
                </div>
              </CardContent>
            </Card>

            {/* Tools */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Mock tools</CardTitle>
              </CardHeader>
              <CardContent>
                {toolFixturesQuery.isLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : toolFixtures.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No mock tools yet. <Link href="/tool-fixtures" className="text-primary hover:underline">Create one</Link></p>
                ) : (
                  <div className="space-y-1.5">
                    {toolFixtures.map((tf: ToolFixture) => (
                      <label
                        key={tf.id}
                        className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={selectedToolIds.includes(tf.id)}
                          onCheckedChange={(checked) => {
                            restartChatFor();
                            setSelectedToolIds((prev) =>
                              checked ? [...prev, tf.id] : prev.filter((id) => id !== tf.id)
                            );
                          }}
                          data-testid={`tool-checkbox-${tf.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-xs">{tf.name}</p>
                        </div>
                      </label>
                    ))}
                    {selectedToolIds.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs h-7 mt-1"
                        onClick={() => { restartChatFor(); setSelectedToolIds([]); }}
                        data-testid="clear-tools"
                      >
                        Clear all
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>}

          {/* Chat Tab */}
          {sidebarTab === 'chat' && <div className="flex flex-col mt-3 min-h-0" style={{ height: 'calc(100vh - 18rem)' }}>
            <Card className="flex flex-col flex-1 min-h-0 overflow-hidden gap-0 py-0">
              {/* Chat header */}
              <CardHeader className="px-3 py-2 shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Chat</CardTitle>
                  <div className="flex items-center gap-1">
                    {chatMessages.length > 0 && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEndChatOpen(true)}
                        data-testid="chat-restart"
                        title="Restart chat"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
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
                      msg.role === 'tool' && msg.toolCalls?.length ? (
                        <div key={i} className="flex gap-2">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarFallback className="bg-accent text-accent-foreground">
                              <Wrench className="h-3 w-3" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <ToolCallList calls={msg.toolCalls} compact />
                          </div>
                        </div>
                      ) : (
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
                      )
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
      <AlertDialog open={endChatOpen} onOpenChange={setEndChatOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End chat and restart?</AlertDialogTitle>
            <AlertDialogDescription>
              This will end the current conversation and save the transcript. You can start a new chat after.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (chatSessionId) {
                  handleEndChat();
                } else {
                  handleChatReset();
                }
                setEndChatOpen(false);
              }}
            >
              End &amp; Restart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletePromptOpen} onOpenChange={setDeletePromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{savedPrompts.find((p) => p.id === savedPromptId)?.name}&rdquo;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!savedPromptId) return;
                try {
                  await client.prompts.remove(savedPromptId);
                  toast.success('Prompt deleted');
                  setSavedPromptId(null);
                  setSystemPrompt(DEFAULT_PROMPT);
                  setPromptDirty(false);
                  void queryClient.invalidateQueries({ queryKey: ['prompts'] });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to delete prompt');
                }
                setDeletePromptOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}
