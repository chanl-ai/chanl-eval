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
                  <div className="flex flex-wrap gap-1.5">
                    {p.emotion && (
                      <Badge variant="secondary" className="text-[10px] capitalize">{p.emotion}</Badge>
                    )}
                    {p.behavior?.cooperationLevel && (
                      <Badge variant="outline" className="text-[10px] capitalize">{p.behavior.cooperationLevel}</Badge>
                    )}
                    {p.behavior?.patience && (
                      <Badge variant="outline" className="text-[10px] capitalize">{p.behavior.patience} patience</Badge>
                    )}
                    {p.speechStyle && p.speechStyle !== 'normal' && (
                      <Badge variant="outline" className="text-[10px] capitalize">{p.speechStyle} speech</Badge>
                    )}
                    {p.variables && Object.keys(p.variables).length > 0 && (
                      <Badge variant="outline" className="text-[10px]">{Object.keys(p.variables).length} attrs</Badge>
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
