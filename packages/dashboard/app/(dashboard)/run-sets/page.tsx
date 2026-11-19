'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Repeat } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import { PageLayout } from '@/components/shared/page-layout';
import { RunSetLabelBadge } from '@/components/run-sets/reliability-card';
import { useEvalConfig } from '@/lib/eval-config';

const KIND = { reliability: 'Run ×k', redteam: 'Red-team scan', compare: 'Comparison' } as const;

export default function RunSetsPage() {
  const { client } = useEvalConfig();
  const q = useQuery({ queryKey: ['run-sets'], queryFn: () => client.runSets.list() });
  const sets = q.data ?? [];

  return (
    <PageLayout icon={Repeat} title="Run sets" description="Repeated runs, red-team scans and comparisons, newest first">
      {q.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : q.isError ? (
        <Card><CardContent className="py-6 text-sm text-destructive">{(q.error as Error).message}</CardContent></Card>
      ) : sets.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={Repeat} title="No run sets yet" description="Open a scenario and choose Run ×5, or start a red-team scan from an agent."
              action={{ label: 'Go to Scenarios', href: '/scenarios' }} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kind</TableHead>
                  <TableHead>Passed</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="hidden sm:table-cell">Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sets.map((rs) => (
                  <TableRow key={rs.id}>
                    <TableCell>
                      <Link href={`/run-sets/${rs.id}`} className="font-medium underline-offset-4 hover:underline">{KIND[rs.kind]}</Link>
                      {rs.isBaseline && <Badge variant="secondary" className="ml-2">Baseline</Badge>}
                    </TableCell>
                    <TableCell className="tabular-nums">{rs.passed}/{rs.total}</TableCell>
                    <TableCell><RunSetLabelBadge label={rs.label} /></TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {rs.createdAt ? new Date(rs.createdAt).toLocaleString() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageLayout>
  );
}
