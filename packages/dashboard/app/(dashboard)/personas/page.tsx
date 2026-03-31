'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { UserCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { BeautifulAvatar } from '@/components/shared/beautiful-avatar';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig } from '@/lib/eval-config';
import type { Persona } from '@chanl/eval-sdk';

export default function PersonasListPage() {
  const { client } = useEvalConfig();

  const q = useQuery({
    queryKey: ['personas'],
    queryFn: () => client.personas.list({ limit: 100 }),
  });

  const personas = q.data?.personas ?? [];

  return (
    <PageLayout
      icon={UserCircle}
      title="Personas"
      description="Simulated customers that test your agent with different personalities and behaviors"
    >
      {q.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : q.isError ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-destructive text-sm">{(q.error as Error).message}</p>
          </CardContent>
        </Card>
      ) : personas.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={UserCircle}
              title="No personas yet"
              description="Personas simulate real customers with different emotions, speech styles, and behaviors."
              action={{ label: 'Learn More', href: 'https://docs.chanl.ai/eval/personas' }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {personas.map((p: Persona) => (
            <Link key={p.id} href={`/personas/${p.id}`}>
              <Card className="h-full transition-colors hover:bg-muted/30 cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <BeautifulAvatar name={p.name} platform="persona" size="md" />
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base font-medium truncate">
                        {p.name}
                      </CardTitle>
                      {p.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {p.description}
                        </p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {p.emotion && (
                      <Badge variant="secondary" className="text-[10px]">
                        {p.emotion}
                      </Badge>
                    )}
                    {p.behavior?.cooperationLevel && (
                      <Badge variant="outline" className="text-[10px]">
                        {p.behavior.cooperationLevel} cooperation
                      </Badge>
                    )}
                    {p.behavior?.patience && (
                      <Badge variant="outline" className="text-[10px]">
                        {p.behavior.patience} patience
                      </Badge>
                    )}
                    {p.speechStyle && (
                      <Badge variant="outline" className="text-[10px]">
                        {p.speechStyle}
                      </Badge>
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
