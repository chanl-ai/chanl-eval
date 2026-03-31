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
import type { Persona } from '@chanl/eval-sdk';

export default function PersonasListPage() {
  const { client, apiKey } = useEvalConfig();

  const q = useQuery({
    queryKey: ['personas', apiKey],
    queryFn: () => client.personas.list({ limit: 100 }),
    enabled: !!apiKey,
  });

  return (
    <>
      <SiteHeader title="Personas" />
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
                    <TableHead>Emotion</TableHead>
                    <TableHead>Style</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(q.data?.personas ?? []).map((p: Persona) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/personas/${p.id}`} className="text-primary font-medium hover:underline">
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell>{p.emotion}</TableCell>
                      <TableCell>{p.speechStyle}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {(q.data?.personas?.length ?? 0) === 0 && (
                <p className="text-muted-foreground py-6 text-center text-sm">No personas.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
