'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Beaker,
  BookOpen,
  ClipboardList,
  Cloud,
  ExternalLink,
  FileText,
  GitCompare,
  Key,
  Play,
  ScrollText,
  Settings,
  Terminal,
  UserCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig } from '@/lib/eval-config';
import { EvalClient } from '@chanl/eval-sdk';

// ---------------------------------------------------------------------------
// Feature card type
// ---------------------------------------------------------------------------

interface FeatureItem {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
  href: string;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'outline';
}

// ---------------------------------------------------------------------------
// Feature sections
// ---------------------------------------------------------------------------

const GETTING_STARTED: FeatureItem[] = [
  {
    icon: Key,
    iconColor: 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400',
    title: 'Set Up API Key',
    description: 'Connect your OpenAI or Anthropic key to power test conversations',
    href: '/settings',
    badge: 'Start Here',
    badgeVariant: 'default',
  },
  {
    icon: Beaker,
    iconColor: 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400',
    title: 'Run Your First Test',
    description: 'Paste a system prompt, pick a persona, and see how your agent handles it',
    href: '/playground',
    badge: 'Required',
    badgeVariant: 'outline',
  },
  {
    icon: ScrollText,
    iconColor: 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400',
    title: 'Review Results',
    description: 'Browse test run history with transcripts and scorecard evaluations',
    href: '/executions',
  },
  {
    icon: Settings,
    iconColor: 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400',
    title: 'Configure Server',
    description: 'Set the eval server URL and optional API key for shared deployments',
    href: '/settings',
  },
];

const TEST_AND_VALIDATE: FeatureItem[] = [
  {
    icon: FileText,
    iconColor: 'bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400',
    title: 'Browse Scenarios',
    description: 'Pre-built test scenarios for common agent interactions',
    href: '/scenarios',
    badge: 'Templates',
    badgeVariant: 'outline',
  },
  {
    icon: UserCircle,
    iconColor: 'bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400',
    title: 'Create Personas',
    description: 'Define customer personas with behaviors, emotions, and styles',
    href: '/personas',
  },
  {
    icon: ClipboardList,
    iconColor: 'bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400',
    title: 'Build Scorecards',
    description: 'Define evaluation criteria tailored to your quality standards',
    href: '/scorecards',
  },
  {
    icon: Play,
    iconColor: 'bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400',
    title: 'Run Simulations',
    description: 'Execute tests with multiple scenarios and personas at once',
    href: '/playground',
    badge: 'Advanced',
    badgeVariant: 'outline',
  },
];

const CLI_AND_TOOLS: FeatureItem[] = [
  {
    icon: Terminal,
    iconColor: 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
    title: 'CLI: chanl run',
    description: 'Run scenarios from your terminal — great for CI/CD pipelines',
    href: '/playground',
  },
  {
    icon: GitCompare,
    iconColor: 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
    title: 'CLI: chanl compare',
    description: 'A/B compare two models or prompts side-by-side',
    href: '/playground',
    badge: 'Compare',
    badgeVariant: 'outline',
  },
];

// ---------------------------------------------------------------------------
// Feature card component
// ---------------------------------------------------------------------------

function FeatureCard({ item }: { item: FeatureItem }) {
  const Icon = item.icon;
  return (
    <Link href={item.href}>
      <Card className="h-full transition-shadow hover:shadow-md cursor-pointer select-none relative">
        {item.badge && (
          <div className="absolute top-3 right-3">
            <Badge variant={item.badgeVariant ?? 'outline'} className="text-[10px]">
              {item.badge}
            </Badge>
          </div>
        )}
        <CardContent className="flex items-start gap-3 py-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.iconColor}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 pr-12">
            <p className="text-sm font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Section component
// ---------------------------------------------------------------------------

function FeatureSection({ title, description, items }: {
  title: string;
  description: string;
  items: FeatureItem[];
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((item) => (
          <FeatureCard key={item.title} item={item} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function HomePage() {
  const { baseUrl, apiKey } = useEvalConfig();
  const [serverOk, setServerOk] = useState<boolean | null>(null);

  // Probe server health
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = new EvalClient({ baseUrl, apiKey });
        const h = await c.health();
        if (!cancelled) setServerOk(!!h?.status);
      } catch {
        if (!cancelled) setServerOk(false);
      }
    })();
    return () => { cancelled = true; };
  }, [baseUrl, apiKey]);

  return (
    <PageLayout
      icon={BookOpen}
      title="Getting Started"
      description="Build. Test. Evaluate. Open-source AI agent testing."
      actions={
        <Button asChild variant="outline" size="sm">
          <a href="https://github.com/chanl-ai/chanl-eval" target="_blank" rel="noreferrer">
            <BookOpen className="mr-2 h-3.5 w-3.5" />
            View Documentation
          </a>
        </Button>
      }
    >
      {/* Hero banner */}
      <Card className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-primary/20">
        <CardContent className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Play className="h-6 w-6 text-primary" />
            </div>
            <div>
              <Badge variant="secondary" className="mb-1 text-[10px]">AI-powered testing</Badge>
              <h2 className="text-xl font-semibold tracking-tight">Test & Simulate</h2>
              <p className="text-sm text-muted-foreground max-w-lg">
                Create realistic test personas, run simulated conversations against your agent, and score the results with custom scorecards.
              </p>
            </div>
          </div>
          <Button asChild className="shrink-0">
            <Link href="/playground">
              Open Playground
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Server status indicator */}
      {serverOk === false && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">
            Server not reachable at <code className="font-mono text-xs">{baseUrl}</code>.{' '}
            <Link href="/settings" className="font-medium underline underline-offset-4">Check settings</Link>
          </p>
        </div>
      )}

      {/* Feature sections */}
      <div className="space-y-8 mt-2">
        <FeatureSection
          title="Getting Started"
          description="Connect your API key and start testing agent performance"
          items={GETTING_STARTED}
        />

        <FeatureSection
          title="Test & Validate"
          description="Generate scenarios, create personas, and run simulations"
          items={TEST_AND_VALIDATE}
        />

        <FeatureSection
          title="Developer Tools"
          description="CLI commands for automation and CI/CD integration"
          items={CLI_AND_TOOLS}
        />
      </div>

      {/* Cloud CTA */}
      <Card className="bg-primary/5 border-primary/20 mt-2">
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Cloud className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">chanl cloud</p>
              <p className="text-sm text-muted-foreground">Voice testing, dashboard trends, team workspaces, emotional personas</p>
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
    </PageLayout>
  );
}
