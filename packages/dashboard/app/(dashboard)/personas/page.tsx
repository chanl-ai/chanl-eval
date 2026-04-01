'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, UserCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { BeautifulAvatar } from '@/components/shared/beautiful-avatar';
import { PageLayout } from '@/components/shared/page-layout';
import { CreatePersonaDialog } from '@/components/personas/create-persona-dialog';
import { useEvalConfig } from '@/lib/eval-config';
import type { Persona } from '@chanl/eval-sdk';

export default function PersonasListPage() {
  const { client } = useEvalConfig();
  const [createOpen, setCreateOpen] = useState(false);

  const q = useQuery({
    queryKey: ['personas'],
    queryFn: () => client.personas.list({ limit: 100 }),
  });

  const personas = q.data?.personas ?? [];

  return (
    <PageLayout
      icon={UserCircle}
      title="Personas"
      description="Simulated customers that test your agent with different personalities"
      actions={
        <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="create-persona-button">
          <Plus className="mr-2 h-3.5 w-3.5" />
          Create Persona
        </Button>
      }
    >
      {q.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
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
              description="Import personas via CLI or create them through the API."
              action={{ label: 'Go to Playground', href: '/' }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {personas.map((p: Persona) => (
            <Link key={p.id} href={`/personas/${p.id}`} className="group">
              <Card className="h-full transition-shadow hover:shadow-md cursor-pointer select-none">
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
                  <Separator className="mb-3" />

                  {/* Metadata row — matches chanl-admin's label/value pairs */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {p.emotion && (
                      <div>
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Emotion</span>
                        <p className="text-xs capitalize">{p.emotion}</p>
                      </div>
                    )}
                    {p.behavior?.cooperationLevel && (
                      <div>
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Cooperation</span>
                        <p className="text-xs capitalize">{p.behavior.cooperationLevel}</p>
                      </div>
                    )}
                    {p.behavior?.patience && (
                      <div>
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Patience</span>
                        <p className="text-xs capitalize">{p.behavior.patience}</p>
                      </div>
                    )}
                    {p.speechStyle && (
                      <div>
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Speech</span>
                        <p className="text-xs capitalize">{p.speechStyle}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <CreatePersonaDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PageLayout>
  );
}
