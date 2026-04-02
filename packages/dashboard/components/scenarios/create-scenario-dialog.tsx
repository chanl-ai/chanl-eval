'use client';

import { useState } from 'react';
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
  prompt: z.string().min(1, 'Prompt is required'),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  category: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateScenarioDialog({ open, onOpenChange }: CreateScenarioDialogProps) {
  const { client } = useEvalConfig();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      prompt: '',
      difficulty: 'medium',
      category: '',
    },
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      await client.scenarios.create({
        name: values.name,
        description: values.description || undefined,
        prompt: values.prompt,
        difficulty: values.difficulty,
        category: values.category || undefined,
        status: 'active',
        personaIds: [],
      });
      toast.success(`Scenario "${values.name}" created`);
      void queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      form.reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create scenario');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]" data-testid="create-scenario-dialog">
        <DialogHeader>
          <DialogTitle>Create Scenario</DialogTitle>
          <DialogDescription>
            Define a test scenario that describes how a persona should interact with your agent.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g. Angry Customer Refund"
              {...form.register('name')}
              data-testid="scenario-name-input"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe the scenario context..."
              className="min-h-[80px] resize-none"
              {...form.register('description')}
              data-testid="scenario-description-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt">
              Prompt <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="prompt"
              placeholder="e.g. Handle this customer who was double-charged $49.99..."
              className="min-h-[120px] resize-none font-mono text-sm"
              {...form.register('prompt')}
              data-testid="scenario-prompt-input"
            />
            {form.formState.errors.prompt && (
              <p className="text-xs text-destructive">{form.formState.errors.prompt.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select
                value={form.watch('difficulty')}
                onValueChange={(v) => form.setValue('difficulty', v as 'easy' | 'medium' | 'hard')}
              >
                <SelectTrigger data-testid="scenario-difficulty-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                placeholder="e.g. support, sales"
                {...form.register('category')}
                data-testid="scenario-category-input"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} data-testid="create-scenario-submit">
              {isSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>
              ) : (
                <><Plus className="mr-2 h-4 w-4" />Create Scenario</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
