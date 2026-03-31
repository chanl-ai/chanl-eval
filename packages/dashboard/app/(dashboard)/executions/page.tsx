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
import { getExecutionRef, type ExecutionDetail } from '@/lib/execution-types';

export default function ExecutionsListPage() {
  const { client, apiKey, baseUrl } = useEvalConfig();

  const q = useQuery({
    queryKey: ['executions', baseUrl, apiKey],
    queryFn: async () => client.executions.list({ limit: 50 }),
    enabled: !!apiKey,
  });

  return (
    <>
      <SiteHeader title="Executions" />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        {!apiKey ? (
          <p className="text-muted-foreground text-sm">
            Set your server API key in <Link href="/settings" className="text-primary underline">Settings</Link> to
            load executions.
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
                    <TableHead>Execution</TableHead>
                    <TableHead>Scenario</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(q.data?.executions ?? []).map((raw) => {
                    const e = raw as unknown as ExecutionDetail;
                    const ref = getExecutionRef(e);
                    return (
                      <TableRow key={ref}>
                        <TableCell>
                          <Link
                            href={`/executions/${encodeURIComponent(ref)}`}
                            className="text-primary font-mono text-xs hover:underline"
                          >
                            {ref}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate font-mono text-xs">
                          {e.scenarioId ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{e.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {e.overallScore != null ? `${e.overallScore}` : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {(q.data?.executions?.length ?? 0) === 0 && (
                <p className="text-muted-foreground py-6 text-center text-sm">No executions yet.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
