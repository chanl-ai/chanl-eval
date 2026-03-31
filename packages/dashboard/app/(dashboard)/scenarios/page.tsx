'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { SiteHeader } from '@/components/site-header';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useEvalConfig } from '@/lib/eval-config';
import type { Scenario } from '@chanl/eval-sdk';

export default function ScenariosListPage() {
  const { client, apiKey } = useEvalConfig();

  const q = useQuery({
    queryKey: ['scenarios', apiKey],
    queryFn: () => client.scenarios.list({ limit: 100 }),
    enabled: !!apiKey,
  });

  return (
    <>
      <SiteHeader title="Scenarios" />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        {!apiKey ? (
          <p className="text-muted-foreground text-sm">
            Set API key in <Link href="/settings" className="text-primary underline">Settings</Link>.
          </p>
        ) : q.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : q.isError ? (
          <p className="text-destructive text-sm">{(q.error as Error).message}</p>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Difficulty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(q.data?.scenarios ?? []).map((s: Scenario) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link href={`/scenarios/${s.id}`} className="text-primary font-medium hover:underline">
                          {s.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.status ?? '—'}</Badge>
                      </TableCell>
                      <TableCell>{s.difficulty ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {(q.data?.scenarios?.length ?? 0) === 0 && (
                <p className="text-muted-foreground py-6 text-center text-sm">No scenarios.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
