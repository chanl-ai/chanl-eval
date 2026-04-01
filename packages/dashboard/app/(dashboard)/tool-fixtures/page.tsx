'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { PageLayout } from '@/components/shared/page-layout';
import { CreateToolFixtureDialog } from '@/components/tool-fixtures/create-tool-fixture-dialog';
import { useEvalConfig } from '@/lib/eval-config';
import type { ToolFixture } from '@chanl/eval-sdk';

function countParams(parameters: Record<string, any> | undefined): number {
  if (!parameters) return 0;
  // JSON Schema: count properties
  if (parameters.properties && typeof parameters.properties === 'object') {
    return Object.keys(parameters.properties).length;
  }
  // Flat object: count keys
  return Object.keys(parameters).length;
}

export default function ToolFixturesListPage() {
  const { client } = useEvalConfig();
  const [createOpen, setCreateOpen] = useState(false);

  const q = useQuery({
    queryKey: ['tool-fixtures'],
    queryFn: () => client.toolFixtures.list({ limit: 100 }),
  });

  const toolFixtures = q.data?.toolFixtures ?? [];

  return (
    <PageLayout
      icon={Wrench}
      title="Tool Fixtures"
      description="Define tools with mock responses for deterministic agent testing"
      actions={
        <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="create-tool-fixture-button">
          <Plus className="mr-2 h-3.5 w-3.5" />
          Create Tool Fixture
        </Button>
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
      ) : toolFixtures.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Wrench}
              title="No tool fixtures yet"
              description="Create your first tool fixture to start testing tool-calling behavior."
              action={{ label: 'Create Tool Fixture', onClick: () => setCreateOpen(true) }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {toolFixtures.map((tf: ToolFixture) => {
            const paramCount = countParams(tf.parameters);
            const mockCount = tf.mockResponses?.length ?? 0;

            return (
              <Link key={tf.id} href={`/tool-fixtures/${tf.id}`} className="group">
                <Card className="h-full transition-shadow hover:shadow-md cursor-pointer select-none">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-medium line-clamp-1">
                        {tf.name}
                      </CardTitle>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          variant={tf.isActive ? 'default' : 'secondary'}
                          className="text-[10px]"
                        >
                          {tf.isActive ? 'active' : 'inactive'}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {tf.description ? (
                      <p className="text-sm text-muted-foreground line-clamp-2">{tf.description}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No description</p>
                    )}

                    <Separator className="my-3" />

                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        {paramCount} param{paramCount !== 1 ? 's' : ''}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {mockCount} mock{mockCount !== 1 ? 's' : ''}
                      </Badge>
                      {tf.tags && tf.tags.length > 0 && tf.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                      {tf.tags && tf.tags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{tf.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      <CreateToolFixtureDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PageLayout>
  );
}
