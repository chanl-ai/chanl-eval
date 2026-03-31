'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Beaker,
  BookOpen,
  CheckCircle2,
  Circle,
  ClipboardList,
  Cloud,
  Copy,
  ExternalLink,
  Settings,
  Terminal,
  UserCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig } from '@/lib/eval-config';
import { EvalClient } from '@chanl/eval-sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  href?: string;
  hrefLabel?: string;
  autoCheck?: 'server' | 'api';
}

interface FeatureCard {
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}

interface CliCommand {
  command: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'chanl-eval-onboarding';
const DISMISS_KEY = 'chanl-eval-onboarding-dismissed';

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: 'server-running',
    label: 'Server running',
    description: 'The chanl-eval server is reachable',
    autoCheck: 'server',
  },
  {
    id: 'api-connected',
    label: 'API connected',
    description: 'Dashboard can communicate with the server',
    autoCheck: 'api',
  },
  {
    id: 'api-key',
    label: 'Set your API key',
    description: 'Add your LLM provider key so tests can run',
    href: '/settings',
    hrefLabel: 'Go to Settings',
  },
  {
    id: 'first-test',
    label: 'Run your first test',
    description: 'Execute a scenario in the playground',
    href: '/',
    hrefLabel: 'Open Playground',
  },
  {
    id: 'browse-results',
    label: 'Browse results',
    description: 'View your test execution history',
    href: '/executions',
    hrefLabel: 'View Runs',
  },
];

const FEATURE_CARDS: FeatureCard[] = [
  {
    icon: Beaker,
    title: 'Test Agent',
    description:
      'Paste a system prompt, pick a persona, and run a simulated conversation to see how your agent handles it.',
    href: '/',
    linkLabel: 'Try it',
  },
  {
    icon: UserCircle,
    title: 'Personas',
    description:
      'Configure simulated users with traits like emotion, patience level, and communication style.',
    href: '/personas',
    linkLabel: 'Learn more',
  },
  {
    icon: ClipboardList,
    title: 'Scoring',
    description:
      'Define pass/fail criteria with scorecards to automatically grade agent responses after each test.',
    href: '/scorecards',
    linkLabel: 'Learn more',
  },
];

const CLI_COMMANDS: CliCommand[] = [
  { command: 'chanl init', description: 'Scaffold a project' },
  { command: 'chanl run <scenario>', description: 'Run a test scenario' },
  { command: 'chanl test scenarios/', description: 'Run with assertions' },
  { command: 'chanl compare --model-a ...', description: 'A/B model comparison' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadOnboardingState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveOnboardingState(state: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Checklist Item Component
// ---------------------------------------------------------------------------

function ChecklistRow({
  item,
  checked,
  onToggle,
}: {
  item: ChecklistItem;
  checked: boolean;
  onToggle: (id: string, value: boolean) => void;
}) {
  return (
    <div
      className="flex items-start gap-3 py-2.5 group"
      data-testid={`checklist-${item.id}`}
    >
      <div className="pt-0.5">
        {checked ? (
          <CheckCircle2
            className="h-5 w-5 text-primary cursor-pointer transition-colors"
            onClick={() => onToggle(item.id, false)}
            aria-label={`Uncheck ${item.label}`}
          />
        ) : (
          <Circle
            className="h-5 w-5 text-muted-foreground/40 cursor-pointer hover:text-muted-foreground transition-colors"
            onClick={() => onToggle(item.id, true)}
            aria-label={`Check ${item.label}`}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium transition-colors ${
            checked ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
        >
          {item.label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {item.description}
        </p>
      </div>
      {item.href && !checked && (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Link href={item.href}>
            {item.hrefLabel}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature Card Component
// ---------------------------------------------------------------------------

function FeatureCardItem({ card }: { card: FeatureCard }) {
  const Icon = card.icon;
  return (
    <Card className="group hover:shadow-md transition-shadow" data-testid={`feature-card-${card.title.toLowerCase().replace(/\s/g, '-')}`}>
      <CardHeader className="pb-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-2">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <CardTitle className="text-base font-medium">{card.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <CardDescription className="text-sm text-muted-foreground line-clamp-3">
          {card.description}
        </CardDescription>
        <Button asChild variant="link" className="h-auto p-0 text-sm">
          <Link href={card.href}>
            {card.linkLabel}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// CLI Reference Component
// ---------------------------------------------------------------------------

function CliReference({ commands }: { commands: CliCommand[] }) {
  const codeText = commands
    .map((c) => `${c.command.padEnd(32)}${c.description}`)
    .join('\n');

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(
      commands.map((c) => c.command).join('\n'),
    );
    toast.success('Commands copied to clipboard');
  }, [commands]);

  return (
    <Card data-testid="cli-reference">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-medium">
              CLI Quick Reference
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-8"
            data-testid="copy-cli-commands"
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto rounded-md bg-muted p-4 text-sm font-mono">
          <code>{codeText}</code>
        </pre>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cloud CTA Component
// ---------------------------------------------------------------------------

function CloudCta() {
  return (
    <Card
      className="bg-primary/5 border-primary/20"
      data-testid="cloud-cta"
    >
      <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Cloud className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">chanl cloud</p>
            <p className="text-sm text-muted-foreground">
              Voice testing, dashboard trends, team workspaces
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <a href="https://chanl.ai" target="_blank" rel="noreferrer">
            Try chanl cloud
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function GettingStartedPage() {
  const { baseUrl, apiKey, agentApiKey } = useEvalConfig();

  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    const saved = loadOnboardingState();
    setCheckedItems(saved);
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === 'true');
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Auto-check: server running + API connected
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    async function probe() {
      try {
        const c = new EvalClient({ baseUrl, apiKey });
        const h = await c.health();
        if (cancelled) return;
        if (h && h.status) {
          setCheckedItems((prev) => {
            const next = { ...prev, 'server-running': true, 'api-connected': true };
            saveOnboardingState(next);
            return next;
          });
        }
      } catch {
        if (cancelled) return;
        setCheckedItems((prev) => {
          const next = { ...prev, 'server-running': false, 'api-connected': false };
          saveOnboardingState(next);
          return next;
        });
      }
    }

    void probe();
    return () => { cancelled = true; };
  }, [hydrated, baseUrl, apiKey]);

  // Auto-check: API key set
  useEffect(() => {
    if (!hydrated) return;
    if (agentApiKey && agentApiKey.length > 2) {
      setCheckedItems((prev) => {
        if (prev['api-key']) return prev;
        const next = { ...prev, 'api-key': true };
        saveOnboardingState(next);
        return next;
      });
    }
  }, [hydrated, agentApiKey]);

  const handleToggle = useCallback((id: string, value: boolean) => {
    setCheckedItems((prev) => {
      const next = { ...prev, [id]: value };
      saveOnboardingState(next);
      return next;
    });
  }, []);

  const handleDismissChange = useCallback((checked: boolean | 'indeterminate') => {
    const value = checked === true;
    setDismissed(value);
    try {
      localStorage.setItem(DISMISS_KEY, String(value));
    } catch {
      /* ignore */
    }
  }, []);

  const completedCount = useMemo(
    () => CHECKLIST_ITEMS.filter((item) => checkedItems[item.id]).length,
    [checkedItems],
  );

  const progressPercent = Math.round(
    (completedCount / CHECKLIST_ITEMS.length) * 100,
  );

  return (
    <PageLayout
      icon={BookOpen}
      title="Welcome to chanl-eval"
      description="Open-source AI agent testing with simulated personas"
    >
      <div className="space-y-6">
        {/* Quick Setup Checklist */}
        <Card data-testid="quick-setup-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">
                Quick Setup
              </CardTitle>
              <Badge variant="secondary" className="tabular-nums">
                {completedCount}/{CHECKLIST_ITEMS.length}
              </Badge>
            </div>
            <Progress
              value={progressPercent}
              className="mt-2 h-1.5"
              aria-label={`${completedCount} of ${CHECKLIST_ITEMS.length} steps complete`}
            />
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {CHECKLIST_ITEMS.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  checked={!!checkedItems[item.id]}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURE_CARDS.map((card) => (
            <FeatureCardItem key={card.title} card={card} />
          ))}
        </div>

        {/* CLI Quick Reference */}
        <CliReference commands={CLI_COMMANDS} />

        {/* Cloud CTA */}
        <CloudCta />

        {/* Dismiss toggle */}
        <div className="flex items-center gap-2" data-testid="dismiss-toggle">
          <Checkbox
            id="dismiss-onboarding"
            checked={dismissed}
            onCheckedChange={handleDismissChange}
          />
          <label
            htmlFor="dismiss-onboarding"
            className="text-sm text-muted-foreground cursor-pointer select-none"
          >
            Don&apos;t show on startup
          </label>
        </div>
      </div>
    </PageLayout>
  );
}
