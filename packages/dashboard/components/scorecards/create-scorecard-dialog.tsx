'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useEvalConfig } from '@/lib/eval-config';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
  passingThreshold: z.number().min(0).max(100),
  scoringAlgorithm: z.enum(['weighted_average', 'simple_average', 'minimum_all', 'pass_fail']),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateScorecardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateScorecardDialog({ open, onOpenChange }: CreateScorecardDialogProps) {
  const { client } = useEvalConfig();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      passingThreshold: 70,
      scoringAlgorithm: 'weighted_average',
    },
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const scorecard = await client.scorecards.create({
        name: values.name,
        description: values.description || undefined,
        passingThreshold: values.passingThreshold,
        scoringAlgorithm: values.scoringAlgorithm,
        status: 'active',
      });
      toast.success(`Scorecard "${values.name}" created. Add criteria now.`);
      void queryClient.invalidateQueries({ queryKey: ['scorecards'] });
      form.reset();
      onOpenChange(false);
      // Navigate to detail page so user can add criteria
      if (scorecard?.id) {
        router.push(`/scorecards/${scorecard.id}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create scorecard';
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]" data-testid="create-scorecard-dialog">
        <DialogHeader>
          <DialogTitle>Create Scorecard</DialogTitle>
          <DialogDescription>
            Create a scorecard, then add evaluation criteria on the detail page.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sc-name">Name</Label>
            <Input
              id="sc-name"
              placeholder="e.g. Call Quality Scorecard"
              {...form.register('name')}
              data-testid="scorecard-name-input"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sc-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              id="sc-desc"
              placeholder="What does this scorecard evaluate?"
              className="min-h-[60px] resize-none"
              {...form.register('description')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Passing Threshold (%)</Label>
              <Input
                type="number"
                {...form.register('passingThreshold', { valueAsNumber: true })}
                data-testid="scorecard-threshold-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Scoring Method</Label>
              <Select
                value={form.watch('scoringAlgorithm')}
                onValueChange={(v) => form.setValue('scoringAlgorithm', v as FormValues['scoringAlgorithm'])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weighted_average">Weighted Average</SelectItem>
                  <SelectItem value="simple_average">Simple Average</SelectItem>
                  <SelectItem value="minimum_all">Minimum All</SelectItem>
                  <SelectItem value="pass_fail">Pass/Fail</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {submitError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {submitError}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} data-testid="create-scorecard-submit">
              {isSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>
              ) : (
                <><Plus className="mr-2 h-4 w-4" />Create Scorecard</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
