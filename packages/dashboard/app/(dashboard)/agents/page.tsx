'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bot } from 'lucide-react';
import type { Prompt } from '@chanl/eval-sdk';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig } from '@/lib/eval-config';

export default function AgentsListPage() {
  const { client } = useEvalConfig();
  const q = useQuery({ queryKey: ['prompts'], queryFn: () => client.prompts.list({ limit: 100 }) });
  const agents = (q.data?.prompts ?? []) as Prompt[];

  return (
    <PageLayout icon={Bot} title="Agents" description="The agents under test: a system prompt plus a model">
      {q.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : q.isError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">{(q.error as Error).message}</CardContent>
        </Card>
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Bot}
              title="No agents yet"
              description="Create an agent in the Playground by writing a system prompt and saving it."
              action={{ label: 'Go to Playground', href: '/playground' }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((a) => (
            <Link key={a.id} href={`/agents/${a.id}`} className="group">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium truncate">{a.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-2">{a.description || a.content}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {a.adapterConfig?.model && <Badge variant="secondary" className="text-[10px]">{a.adapterConfig.model}</Badge>}
                    {a.status && a.status !== 'active' && <Badge variant="outline" className="text-[10px] capitalize">{a.status}</Badge>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
