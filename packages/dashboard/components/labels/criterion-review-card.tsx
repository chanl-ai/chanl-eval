'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, ThumbsUp, UserCheck, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useEvalConfig } from '@/lib/eval-config';
import type { HumanLabel } from '@chanl/eval-sdk';

const REVIEWER_STORAGE_KEY = 'chanl-eval-reviewer-name';

interface CriterionRow {
  criteriaId: string;
  criteriaKey: string;
  criteriaName?: string;
  result: boolean | number | null;
  passed: boolean;
  reasoning?: string;
  confidence?: number;
  notApplicable?: boolean;
}

/**
 * Human review of an LLM judge's verdicts — the labelling half of judge benchmarking.
 *
 * Deliberately a separate card rather than controls inside ScorecardWidget: the widget is a pure
 * presentation component shared with other surfaces, and grading the grader is a different job from
 * displaying a score.
 */
export function CriterionReviewCard({
  scorecardResultId,
  criteria,
}: {
  scorecardResultId: string;
  criteria: CriterionRow[];
}) {
  const { client } = useEvalConfig();
  const qc = useQueryClient();
  const [reviewer, setReviewer] = useState('');

  useEffect(() => {
    try {
      setReviewer(localStorage.getItem(REVIEWER_STORAGE_KEY) || '');
    } catch {
      /* ignore */
    }
  }, []);

  function updateReviewer(v: string) {
    setReviewer(v);
    try {
      localStorage.setItem(REVIEWER_STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  }

  const labelsQ = useQuery({
    queryKey: ['labels', scorecardResultId],
    queryFn: () => client.labels.listForResult(scorecardResultId),
    enabled: !!scorecardResultId,
  });

  const labelsByCriterion = useMemo(() => {
    const map = new Map<string, HumanLabel>();
    for (const l of labelsQ.data ?? []) {
      // Show this reviewer's own label when there is one, else anybody's.
      const existing = map.get(l.criteriaId);
      if (!existing || l.labeledBy === reviewer) map.set(l.criteriaId, l);
    }
    return map;
  }, [labelsQ.data, reviewer]);

  const saveLabel = useMutation({
    mutationFn: (input: {
      criteriaId: string;
      humanResult: boolean | number;
      note?: string;
    }) =>
      client.labels.create({
        scorecardResultId,
        criteriaId: input.criteriaId,
        humanResult: input.humanResult,
        labeledBy: reviewer.trim() || 'anonymous',
        note: input.note,
      }),
    onSuccess: (label) => {
      void qc.invalidateQueries({ queryKey: ['labels', scorecardResultId] });
      void qc.invalidateQueries({ queryKey: ['agreement'] });
      toast.success(
        label.agreed
          ? 'Recorded: you agree with the judge'
          : 'Recorded: you disagree with the judge',
      );
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save label'),
  });

  const scorable = criteria.filter((c) => !c.notApplicable && c.result !== null);
  const labelledCount = scorable.filter((c) =>
    labelsByCriterion.has(c.criteriaId),
  ).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <UserCheck className="h-4 w-4" />
              Human review
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Grade the grader. Your verdicts become the ground truth the LLM judge is measured
              against on the benchmark page.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="tabular-nums">
              {labelledCount}/{scorable.length} reviewed
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="reviewer" className="shrink-0 text-xs text-muted-foreground">
            Reviewing as
          </Label>
          <Input
            id="reviewer"
            value={reviewer}
            onChange={(e) => updateReviewer(e.target.value)}
            placeholder="your name"
            className="h-8 max-w-[200px]"
            data-testid="reviewer-name"
          />
          <p className="text-[11px] text-muted-foreground">
            Labels are per reviewer, so two people can grade the same run independently.
          </p>
        </div>

        {scorable.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No scored criteria to review on this run.
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {scorable.map((c) => (
              <CriterionRowItem
                key={c.criteriaId}
                criterion={c}
                label={labelsByCriterion.get(c.criteriaId)}
                saving={saveLabel.isPending}
                onSave={(humanResult, note) =>
                  saveLabel.mutate({ criteriaId: c.criteriaId, humanResult, note })
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CriterionRowItem({
  criterion,
  label,
  saving,
  onSave,
}: {
  criterion: CriterionRow;
  label?: HumanLabel;
  saving: boolean;
  onSave: (humanResult: boolean | number, note?: string) => void;
}) {
  const isScore = typeof criterion.result === 'number';
  const [overriding, setOverriding] = useState(false);
  const [value, setValue] = useState<string>(
    isScore ? String(criterion.result ?? 5) : 'false',
  );
  const [note, setNote] = useState('');

  const judgeText = isScore
    ? `${criterion.result}/10`
    : criterion.result
      ? 'true'
      : 'false';

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {criterion.criteriaName || criterion.criteriaKey}
            </span>
            <Badge variant={criterion.passed ? 'default' : 'destructive'} className="text-[10px]">
              judge: {judgeText}
            </Badge>
            {criterion.confidence !== undefined && (
              <Badge variant="outline" className="text-[10px] tabular-nums">
                confidence {Math.round(criterion.confidence * 100)}%
              </Badge>
            )}
          </div>
          {criterion.reasoning && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {criterion.reasoning}
            </p>
          )}
        </div>

        {label && !overriding ? (
          <Badge
            variant={label.agreed ? 'secondary' : 'destructive'}
            className="shrink-0 gap-1"
            data-testid={`label-state-${criterion.criteriaKey}`}
          >
            {label.agreed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            you said{' '}
            {typeof label.humanResult === 'number'
              ? `${label.humanResult}/10`
              : String(label.humanResult)}
          </Badge>
        ) : null}
      </div>

      {overriding ? (
        <div className="space-y-2 rounded-md bg-muted/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs">Your verdict</Label>
            {isScore ? (
              <Select value={value} onValueChange={(v) => v && setValue(v)}>
                <SelectTrigger className="h-8 w-[110px]" data-testid={`override-value-${criterion.criteriaKey}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 11 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {i}/10
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={value} onValueChange={(v) => v && setValue(v)}>
                <SelectTrigger className="h-8 w-[110px]" data-testid={`override-value-${criterion.criteriaKey}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">true (pass)</SelectItem>
                  <SelectItem value="false">false (fail)</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why does the judge have this wrong? (optional, but this is the note that improves the rubric)"
            className="min-h-[60px] text-sm"
            data-testid={`override-note-${criterion.criteriaKey}`}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOverriding(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={saving}
              onClick={() => {
                onSave(isScore ? Number(value) : value === 'true', note.trim() || undefined);
                setOverriding(false);
              }}
              data-testid={`override-save-${criterion.criteriaKey}`}
            >
              {saving ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
              Save verdict
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => onSave(criterion.result as boolean | number)}
            data-testid={`agree-${criterion.criteriaKey}`}
            className={cn(label?.agreed && 'border-primary/50')}
          >
            <ThumbsUp className="mr-1.5 h-3 w-3" />
            Judge is right
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => setOverriding(true)}
            data-testid={`disagree-${criterion.criteriaKey}`}
          >
            <X className="mr-1.5 h-3 w-3" />
            I disagree
          </Button>
        </div>
      )}
    </div>
  );
}
