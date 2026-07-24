'use client';

import { useState } from 'react';
import { Pencil, ThumbsDown, ThumbsUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  CriterionReview,
  ScorecardCriterionDisplay,
  ScorecardReviewOptions,
} from './types';

/**
 * Human verdict on a single criterion, rendered beside the judge's verdict.
 *
 * Agreement is one click, since it is the common case and carries no extra information. Disagreement
 * opens a popover for the corrected value and an optional note, because that is where the useful
 * signal is: the note is what tells a rubric author why the criterion reads wrong.
 */
export function CriterionReviewControl({
  criterion,
  review,
  options,
}: {
  criterion: ScorecardCriterionDisplay;
  review?: CriterionReview;
  options: ScorecardReviewOptions;
}) {
  const [open, setOpen] = useState(false);
  const judgeVerdict = normalizeVerdict(criterion.result, criterion.passed);
  const isScore = typeof judgeVerdict === 'number';
  const [value, setValue] = useState(String(isScore ? judgeVerdict : criterion.passed));
  const [note, setNote] = useState('');

  if (!criterion.criteriaId) return null;
  const id = criterion.criteriaId;

  const reviewed = review !== undefined;

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 transition-opacity',
        // Progressive disclosure: the controls stay out of the way until the row is hovered, but a
        // recorded verdict is always visible so the review state can be read at a glance.
        reviewed ? 'opacity-100' : 'opacity-0 group-hover/criterion:opacity-100 focus-within:opacity-100',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={options.pending}
        title={review?.agreed ? 'You agreed with the judge' : 'Judge is right'}
        aria-label="Agree with the judge"
        data-testid={`review-agree-${id}`}
        className={cn('size-6', review?.agreed && 'text-success')}
        onClick={() => options.onReview(id, judgeVerdict)}
      >
        <ThumbsUp className="size-3" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={options.pending}
            title={
              reviewed && !review?.agreed
                ? `You said ${formatVerdict(review!.humanResult)}`
                : 'Disagree'
            }
            aria-label="Disagree with the judge"
            data-testid={`review-disagree-${id}`}
            className={cn('size-6', reviewed && !review?.agreed && 'text-destructive')}
          >
            <ThumbsDown className="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Your verdict</p>
            <p className="text-xs text-muted-foreground">
              Judge said {formatVerdict(judgeVerdict)}.
            </p>
          </div>

          <Select value={value} onValueChange={(v) => v && setValue(v)}>
            <SelectTrigger className="h-8" data-testid={`review-value-${id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {isScore ? (
                Array.from({ length: 11 }, (_, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {i}/10
                  </SelectItem>
                ))
              ) : (
                <>
                  <SelectItem value="true">Pass</SelectItem>
                  <SelectItem value="false">Fail</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>

          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this wrong? (optional)"
            className="min-h-[60px] text-sm"
            data-testid={`review-note-${id}`}
          />

          <div className="flex items-center justify-between">
            {options.onEditCriterion ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setOpen(false);
                  options.onEditCriterion?.(id);
                }}
                data-testid={`review-edit-${id}`}
              >
                <Pencil className="mr-1 size-3" />
                Edit criterion
              </Button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              size="sm"
              className="h-7"
              disabled={options.pending}
              onClick={() => {
                options.onReview(id, isScore ? Number(value) : value === 'true', note.trim() || undefined);
                setNote('');
                setOpen(false);
              }}
              data-testid={`review-save-${id}`}
            >
              Save
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * `result` is stored loosely: numeric scores, booleans, and the strings "pass"/"fail" all appear in
 * it depending on which producer wrote the row. Only a boolean or a number is a valid verdict, so
 * anything else falls back to `passed`, which is always boolean.
 */
function normalizeVerdict(
  result: boolean | number | undefined,
  passed: boolean,
): boolean | number {
  if (typeof result === 'number' && Number.isFinite(result)) return result;
  if (typeof result === 'boolean') return result;
  return passed;
}

function formatVerdict(v: boolean | number | undefined): string {
  if (typeof v === 'number') return `${v}/10`;
  if (typeof v === 'boolean') return v ? 'pass' : 'fail';
  return 'n/a';
}
