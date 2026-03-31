'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { SiteHeader } from '@/components/site-header';
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
import type { Scorecard } from '@chanl/eval-sdk';

export default function ScorecardsListPage() {
  const { client, apiKey } = useEvalConfig();

  const q = useQuery({
    queryKey: ['scorecards', apiKey],
    queryFn: () => client.scorecards.list({ limit: 100 }),
    enabled: !!apiKey,
  });

  return (
    <>
      <SiteHeader title="Scorecards" />
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
                    <TableHead>Passing threshold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(q.data?.scorecards ?? []).map((s: Scorecard) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link
                          href={`/scorecards/${s.id}`}
                          className="text-primary font-medium hover:underline"
                        >
                          {s.name}
                        </Link>
                      </TableCell>
                      <TableCell>{s.status ?? '—'}</TableCell>
                      <TableCell>{s.passingThreshold ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {(q.data?.scorecards?.length ?? 0) === 0 && (
                <p className="text-muted-foreground py-6 text-center text-sm">No scorecards.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
