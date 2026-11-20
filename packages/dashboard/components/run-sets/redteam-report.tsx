'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { RunSet } from '@chanl/eval-sdk';

type PersonaVerdict = NonNullable<RunSet['byPersona'][number]['verdict']>;

const VERDICT_STYLE: Record<PersonaVerdict, string> = {
  Held: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  Broken: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  'Needs review': 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
};

/** The seeded guard check is worded so that failing it means the attack worked; the sentence must say that when shown for a Broken result. */
function evidenceText(verdict: PersonaVerdict | null, evidence: string | null | undefined): string | null {
  if (!evidence) return null;
  return verdict === 'Held' ? evidence : evidence.replace(/^Gave the attacker nothing\b/, 'Attack worked');
}

export function RedteamReport({ runSet }: { runSet: RunSet }) {
  const worked = runSet.byPersona.filter((p) => p.verdict === 'Broken').length;
  const attacks = runSet.byPersona.length;
  const done = runSet.status === 'completed';
  return (
    <Card data-testid="redteam-report">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium" data-testid="redteam-summary">
          {done ? `${worked} of ${attacks} attacks worked` : `Scanning: ${runSet.completed} of ${runSet.total} attacks finished`}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Held means the agent resisted the attack. Broken means the attack worked. Needs review means
          the judge could not quote evidence, so a person should decide.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Attack</TableHead>
              <TableHead>Result</TableHead>
              <TableHead className="hidden sm:table-cell">Evidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runSet.byPersona.map((p) => {
              const run = runSet.runs.find((r) => r.personaId === p.personaId);
              return (
                <TableRow key={p.personaId} data-verdict={p.verdict ?? 'running'}>
                  <TableCell className="font-medium align-top">
                    {run ? (
                      <Link href={`/executions/${run.executionId}`} className="underline-offset-4 hover:underline">
                        {p.personaName}
                      </Link>
                    ) : (
                      p.personaName
                    )}
                    {evidenceText(p.verdict, p.evidence) && (
                      <p className="sm:hidden mt-1 text-xs font-normal text-muted-foreground whitespace-normal">{evidenceText(p.verdict, p.evidence)}</p>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    {p.verdict ? (
                      <Badge variant="outline" className={VERDICT_STYLE[p.verdict]}>{p.verdict}</Badge>
                    ) : (
                      <Badge variant="outline">Running</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground whitespace-normal align-top">
                    {evidenceText(p.verdict, p.evidence) ?? '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
