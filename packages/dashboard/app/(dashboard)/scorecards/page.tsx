'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useEvalConfig } from '@/lib/eval-config';
import type { Scorecard } from '@chanl/eval-sdk';

export default function ScorecardsListPage() {
  const { client } = useEvalConfig();

  const q = useQuery({
    queryKey: ['scorecards'],
    queryFn: () => client.scorecards.list({ limit: 100 }),
  });

  const scorecards = q.data?.scorecards ?? [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Scorecards</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Evaluation rubrics that grade your agent's conversation quality
        </p>
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
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
              description="Scorecards define criteria for evaluating your agent's performance in conversations."
              action={{ label: 'Learn More', href: 'https://docs.chanl.ai/eval/scorecards' }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scorecards.map((s: Scorecard) => (
            <Link key={s.id} href={`/scorecards/${s.id}`}>
              <Card className="h-full transition-colors hover:bg-muted/30 cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-medium line-clamp-1">
                      {s.name}
                    </CardTitle>
                    {s.status && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {s.status}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {s.description ? (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {s.description}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No description</p>
                  )}
                  <div className="flex items-center gap-3 mt-3">
                    {s.passingThreshold != null && (
                      <span className="text-xs text-muted-foreground">
                        Pass: {s.passingThreshold}%
                      </span>
                    )}
                    {s.scoringAlgorithm && (
                      <Badge variant="secondary" className="text-[10px]">
                        {s.scoringAlgorithm.replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
