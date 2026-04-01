'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { PageLayout } from '@/components/shared/page-layout';
import { CreateScorecardDialog } from '@/components/scorecards/create-scorecard-dialog';
import { useEvalConfig } from '@/lib/eval-config';
import type { Scorecard } from '@chanl/eval-sdk';

export default function ScorecardsListPage() {
  const { client } = useEvalConfig();
  const [createOpen, setCreateOpen] = useState(false);

  const q = useQuery({
    queryKey: ['scorecards'],
    queryFn: () => client.scorecards.list({ limit: 100 }),
  });

  const scorecards = q.data?.scorecards ?? [];

  return (
    <PageLayout
      icon={ClipboardList}
      title="Scorecards"
      description="Evaluation rubrics that grade your agent's conversation quality"
      actions={
        <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="create-scorecard-button">
          <Plus className="mr-2 h-3.5 w-3.5" />
          Create Scorecard
        </Button>
      }
    >
      {q.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : q.isError ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-destructive text-sm">{(q.error as Error).message}</p>
          </CardContent>
        </Card>
      ) : scorecards.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ClipboardList}
              title="No scorecards yet"
              description="Import scorecards via CLI or create them through the API."
              action={{ label: 'Go to Playground', href: '/' }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scorecards.map((s: Scorecard) => (
            <Link key={s.id} href={`/scorecards/${s.id}`} className="group">
              <Card className="h-full transition-shadow hover:shadow-md cursor-pointer select-none">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-medium line-clamp-1">
                      {s.name}
                    </CardTitle>
                    {s.status && (
                      <Badge
                        variant={s.status === 'active' ? 'default' : 'outline'}
                        className="text-[10px] shrink-0"
                      >
                        {s.status}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {s.description ? (
                    <p className="text-sm text-muted-foreground line-clamp-2">{s.description}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No description</p>
                  )}

                  <Separator className="my-3" />

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {s.passingThreshold != null && (
                      <div>
                        <span className="text-[10px] font-medium uppercase tracking-wider">Pass</span>
                        <p className="tabular-nums">{s.passingThreshold}%</p>
                      </div>
                    )}
                    {s.scoringAlgorithm && (
                      <div>
                        <span className="text-[10px] font-medium uppercase tracking-wider">Method</span>
                        <p className="capitalize">{s.scoringAlgorithm.replace(/_/g, ' ')}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <CreateScorecardDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PageLayout>
  );
}
