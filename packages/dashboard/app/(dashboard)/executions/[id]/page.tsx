'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useEvalConfig } from '@/lib/eval-config';
import { SPEAKER_COLORS } from '@/lib/utils';
import type { ExecutionDetail, ExecutionStepResult } from '@/lib/execution-types';

function Transcript({ steps }: { steps: ExecutionStepResult[] }) {
  return (
    <div className="scrollbar-thin max-h-[60vh] space-y-4 overflow-y-auto pr-1">
      {steps.map((step, i) => {
        const text = step.actualResponse;
        if (!text) return null;
        const isAgent =
          typeof step.stepId === 'string' && step.stepId.includes('agent');
        const label = isAgent ? 'Agent' : 'Persona';
        const border = isAgent ? SPEAKER_COLORS.agent : SPEAKER_COLORS.persona;
        return (
          <div
            key={`${step.stepId}-${i}`}
            className="rounded-lg border-l-4 bg-card p-3 text-sm shadow-sm"
            style={{ borderLeftColor: border }}
          >
            <div className="text-muted-foreground mb-1 flex items-center gap-2 text-xs">
              <span className="font-semibold text-foreground">{label}</span>
              <span className="font-mono">{step.stepId}</span>
            </div>
            <p className="whitespace-pre-wrap">{text}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function ExecutionDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const { client, apiKey } = useEvalConfig();

  const q = useQuery({
    queryKey: ['execution', id, apiKey],
    queryFn: async () => {
      const ex = await client.executions.get(id);
      return ex as unknown as ExecutionDetail;
    },
    enabled: !!apiKey && !!id,
  });

  const e = q.data;

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Link href="/executions" className="text-muted-foreground text-sm hover:underline">
          ← Executions
        </Link>
        {!apiKey ? (
          <p className="text-muted-foreground text-sm">
            Configure API key in <Link href="/settings">Settings</Link>.
          </p>
        ) : q.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : q.isError ? (
          <p className="text-destructive">{(q.error as Error).message}</p>
        ) : e ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <code className="bg-muted rounded px-2 py-1 font-mono text-xs">{id}</code>
              <Badge>{e.status}</Badge>
              {e.overallScore != null && <Badge variant="secondary">Score {e.overallScore}</Badge>}
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Transcript</CardTitle>
              </CardHeader>
              <CardContent>
                {e.stepResults && e.stepResults.length > 0 ? (
                  <Transcript steps={e.stepResults} />
                ) : (
                  <p className="text-muted-foreground text-sm">No transcript steps yet.</p>
                )}
              </CardContent>
            </Card>
            {e.errorMessages && e.errorMessages.length > 0 && (
              <Card className="border-destructive/50">
                <CardHeader>
                  <CardTitle className="text-destructive text-base">Errors</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc pl-5 text-sm">
                    {e.errorMessages.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    </>
  );
}
