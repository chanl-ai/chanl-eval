'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bug, Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import type { Execution } from '@chanl/eval-sdk';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { TranscriptMessage } from '@/components/transcript/transcript-view';
import { useEvalConfig } from '@/lib/eval-config';
import type { RunSet } from '@chanl/eval-sdk';

export interface FailedCheckInfo {
  name: string;
  reason?: string;
  evidence?: string[];
  needsReview?: boolean;
}

const CAUSES = [
  { value: 'prompt', label: 'Prompt (instructions)' },
  { value: 'tool', label: 'Tool (call, arguments or result)' },
  { value: 'knowledge', label: 'Knowledge (missing or wrong facts)' },
  { value: 'model', label: 'Model (capability or randomness)' },
  { value: 'test', label: 'Test (the check or scenario is wrong)' },
] as const;

const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'] as const;

interface ReportInput {
  scenarioName: string;
  personaName: string;
  agentName: string;
  runSet: RunSet | null;
  failedChecks: FailedCheckInfo[];
  messages: TranscriptMessage[];
  link: string;
  cause: string;
  severity: string;
}

const EXCERPT_TURNS = 8;

export function buildBugReport(r: ReportInput): string {
  const causeLabel = CAUSES.find((c) => c.value === r.cause)?.label ?? r.cause;
  const lines: string[] = [
    `# Bug: ${r.scenarioName} fails with ${r.personaName}`,
    '',
    `- **Severity:** ${r.severity}`,
    `- **Suspected cause:** ${causeLabel}`,
    `- **Scenario:** ${r.scenarioName}`,
    `- **Persona:** ${r.personaName}`,
    `- **Agent:** ${r.agentName}`,
  ];
  if (r.runSet) {
    const label = r.runSet.label ? ` (${r.runSet.label})` : '';
    lines.push(`- **Run set:** passed ${r.runSet.passed}/${r.runSet.total}${label}`);
    if (r.runSet.mostFailedCheck) {
      lines.push(`- **Most-failed check:** ${r.runSet.mostFailedCheck.name} (${r.runSet.mostFailedCheck.failed}×)`);
    }
  }
  lines.push(`- **Run:** ${r.link}`, '', '## Failed checks', '');
  if (r.failedChecks.length === 0) lines.push('_No scorecard check failed; the run itself failed._', '');
  for (const c of r.failedChecks) {
    lines.push(`### ${c.name}${c.needsReview ? ' (needs review)' : ''}`, '');
    if (c.reason) lines.push(`Judge: ${c.reason}`, '');
    for (const q of c.evidence ?? []) lines.push(`> ${q.replace(/\n/g, ' ')}`, '');
  }
  const excerpt = r.messages.slice(-EXCERPT_TURNS);
  lines.push('## Transcript excerpt', '');
  if (r.messages.length > excerpt.length) lines.push(`_Last ${excerpt.length} of ${r.messages.length} turns._`, '');
  for (const m of excerpt) {
    const who = m.role === 'agent' ? 'Agent' : m.role === 'tool' ? 'Tool' : 'Customer';
    const text = m.role === 'tool' && m.toolCalls?.length
      ? m.toolCalls.map((t) => `${t.name}(${JSON.stringify(t.arguments)})`).join('; ')
      : m.content;
    lines.push(`**${who}:** ${text.replace(/\n+/g, ' ')}`, '');
  }
  return lines.join('\n').trimEnd() + '\n';
}

export function BugReportButton({ execution, scenarioName, failedChecks, messages }: {
  execution: Execution; scenarioName?: string; failedChecks: FailedCheckInfo[]; messages: TranscriptMessage[];
}) {
  const { client } = useEvalConfig();
  const { runSets } = useEvalConfig().client;
  const [open, setOpen] = useState(false);
  const [cause, setCause] = useState<string>('prompt');
  const [severity, setSeverity] = useState<string>('High');
  const runSetId = (execution as Execution & { runSetId?: string }).runSetId;

  const persona = useQuery({
    queryKey: ['persona', execution.personaId],
    queryFn: () => client.personas.get(execution.personaId!),
    enabled: open && !!execution.personaId,
  });
  const prompt = useQuery({
    queryKey: ['prompt', execution.promptId],
    queryFn: () => client.prompts.get(execution.promptId!),
    enabled: open && !!execution.promptId,
  });
  const runSet = useQuery({
    queryKey: ['run-set', runSetId],
    queryFn: () => runSets.get(runSetId!),
    enabled: open && !!runSetId,
  });

  const markdown = useMemo(
    () =>
      buildBugReport({
        scenarioName: scenarioName ?? 'Scenario',
        personaName: persona.data?.name ?? (execution.personaId ? '…' : 'None'),
        agentName: prompt.data?.name ?? (execution.promptId ? '…' : 'Unknown'),
        runSet: runSet.data ?? null,
        failedChecks,
        messages,
        link: typeof window !== 'undefined' ? `${window.location.origin}/executions/${execution.executionId ?? execution.id}` : '',
        cause,
        severity,
      }),
    [scenarioName, persona.data, prompt.data, runSet.data, failedChecks, messages, execution, cause, severity],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success('Bug report copied');
    } catch {
      toast.error('Copy failed. Select the text and copy it by hand.');
    }
  }

  function download() {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bug-${(scenarioName ?? 'run').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="create-bug-report">
        <Bug className="mr-2 h-3.5 w-3.5" />
        Create bug report
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[680px] max-h-[90svh] overflow-y-auto" data-testid="bug-report-dialog">
          <DialogHeader>
            <DialogTitle>Bug report</DialogTitle>
            <DialogDescription>Markdown you can paste into your tracker. Pick the suspected cause and severity first.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Suspected cause</Label>
              <Select value={cause} onValueChange={setCause}>
                <SelectTrigger className="w-full" data-testid="bug-cause"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAUSES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="w-full" data-testid="bug-severity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea readOnly value={markdown} className="font-mono text-xs min-h-[300px]" data-testid="bug-markdown" />
          <DialogFooter>
            <Button variant="outline" onClick={download} data-testid="bug-download">
              <Download className="mr-2 h-4 w-4" />
              Download .md
            </Button>
            <Button onClick={copy} data-testid="bug-copy">
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
