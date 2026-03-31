'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig } from '@/lib/eval-config';
import type { Scenario } from '@chanl/eval-sdk';

function getDifficultyVariant(difficulty: string | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (difficulty) {
    case 'easy': return 'secondary';
    case 'medium': return 'default';
    case 'hard': return 'destructive';
    default: return 'outline';
  }
}

export default function ScenariosListPage() {
  const { client } = useEvalConfig();

  const q = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => client.scenarios.list({ limit: 100 }),
  });

  const scenarios = q.data?.scenarios ?? [];

  return (
    <PageLayout
      icon={FileText}
      title="Scenarios"
      description="Test scenarios that define how personas interact with your agent"
      actions={
        scenarios.length > 0 ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/scenarios">
              <Plus className="mr-2 h-3.5 w-3.5" />
              Create Scenario
            </Link>
          </Button>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : q.isError ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-destructive text-sm">{(q.error as Error).message}</p>
          </CardContent>
        </Card>
      ) : scenarios.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={FileText}
              title="No scenarios yet"
              description="Create your first test scenario to define how AI personas should interact with your agent."
              action={{ label: 'Create Scenario', href: '/scenarios' }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenarios.map((s: Scenario) => (
            <Link key={s.id} href={`/scenarios/${s.id}`}>
              <Card className="h-full transition-colors hover:bg-muted/30 cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-medium line-clamp-1">
                      {s.name}
                    </CardTitle>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {s.difficulty && (
                        <Badge variant={getDifficultyVariant(s.difficulty)} className="text-[10px]">
                          {s.difficulty}
                        </Badge>
                      )}
                      {s.status && (
                        <Badge variant="outline" className="text-[10px]">
                          {s.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {s.description ? (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {s.description}
                    </p>
                  ) : s.prompt ? (
                    <p className="text-sm text-muted-foreground line-clamp-2 font-mono">
                      {s.prompt}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No description</p>
                  )}
                  <div className="flex items-center gap-3 mt-3">
                    {s.category && (
                      <Badge variant="secondary" className="text-[10px]">
                        {s.category}
                      </Badge>
                    )}
                    {s.personaIds && s.personaIds.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {s.personaIds.length} persona{s.personaIds.length !== 1 ? 's' : ''}
                      </span>
                    )}
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
