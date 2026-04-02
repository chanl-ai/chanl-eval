'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig } from '@/lib/eval-config';
import { columns, type ExecutionRow } from './columns';
import type { Execution } from '@chanl/eval-sdk';

export default function RunsListPage() {
  const { client } = useEvalConfig();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = React.useState('all');

  const q = useQuery({
    queryKey: ['executions'],
    queryFn: () => client.executions.list({ limit: 100 }),
  });

  const rows: ExecutionRow[] = React.useMemo(() => {
    const executions = q.data?.executions ?? [];
    const mapped = executions.map((e: Execution) => ({
      id: e.id,
      scenarioName: e.scenarioId
        ? `Scenario ${e.scenarioId.slice(-6)}`
        : 'Unnamed run',
      score: e.overallScore,
      status: e.status,
      duration: e.duration,
      createdAt: e.createdAt,
    }));

    if (statusFilter !== 'all') {
      return mapped.filter((r) => r.status === statusFilter);
    }
    return mapped;
  }, [q.data, statusFilter]);

  function handleRowClick(row: ExecutionRow) {
    router.push(`/executions/${encodeURIComponent(row.id)}`);
  }

  return (
    <PageLayout
      icon={ScrollText}
      title="Test Runs"
      description="History of all scenario executions"
    >
      {q.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-destructive text-sm">
              {(q.error as Error).message}
            </p>
          </CardContent>
        </Card>
      ) : (q.data?.executions ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ScrollText}
              title="No test runs yet"
              description="Run your first scenario test from the playground to see results here."
              action={{ label: 'Go to Playground', href: '/playground' }}
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          filterColumn="scenarioName"
          filterPlaceholder="Search runs..."
          toolbarRight={
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger size="sm" className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          }
          onRowClick={handleRowClick}
          emptyState={
            <EmptyState
              icon={ScrollText}
              title="No matching runs"
              description="Try adjusting your filters."
            />
          }
        />
      )}
    </PageLayout>
  );
}
