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

const EMOTIONS = ['friendly', 'polite', 'neutral', 'calm', 'concerned', 'stressed', 'annoyed', 'frustrated', 'irritated', 'curious', 'distracted'] as const;
const COOPERATION_LEVELS = ['very cooperative', 'cooperative', 'neutral', 'difficult', 'hostile'] as const;
const PATIENCE_LEVELS = ['high', 'medium', 'low'] as const;
const SPEECH_STYLES = ['fast', 'slow', 'normal', 'moderate'] as const;
const INTENT_CLARITY = ['very clear', 'slightly unclear', 'unclear', 'mumbled'] as const;

const formSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
  emotion: z.string().min(1, 'Emotion is required'),
  cooperationLevel: z.string().min(1, 'Cooperation level is required'),
  patience: z.string().min(1, 'Patience is required'),
  speechStyle: z.string().min(1, 'Speech style is required'),
  intentClarity: z.string().optional(),
  backstory: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CreatePersonaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePersonaDialog({ open, onOpenChange }: CreatePersonaDialogProps) {
  const { client } = useEvalConfig();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      emotion: 'neutral',
      cooperationLevel: 'cooperative',
      patience: 'medium',
      speechStyle: 'normal',
      intentClarity: 'very clear',
      backstory: '',
    },
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await client.personas.create({
        name: values.name,
        description: values.description || undefined,
        emotion: values.emotion,
        gender: 'neutral',
        language: 'English',
        accent: 'American',
        intentClarity: values.intentClarity || 'very clear',
        speechStyle: values.speechStyle,
        backgroundNoise: false,
        allowInterruptions: false,
        backstory: values.backstory || undefined,
        behavior: {
          cooperationLevel: values.cooperationLevel,
          patience: values.patience,
        },
      });
      toast.success(`Persona "${values.name}" created`);
      void queryClient.invalidateQueries({ queryKey: ['personas'] });
      form.reset();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create persona';
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]" data-testid="create-persona-dialog">
        <DialogHeader>
          <DialogTitle>Create Persona</DialogTitle>
          <DialogDescription>
            Define a simulated customer with specific personality traits and behaviors.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="persona-name">Name</Label>
            <Input
              id="persona-name"
              placeholder="e.g. Frustrated Karen"
              {...form.register('name')}
              data-testid="persona-name-input"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="persona-desc">Description</Label>
            <Input
              id="persona-desc"
              placeholder="Brief description of this persona..."
              {...form.register('description')}
              data-testid="persona-description-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="persona-backstory">Backstory <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              id="persona-backstory"
              placeholder='e.g. You are a longtime customer who has had multiple frustrating support experiences. You have a low tolerance for scripted responses...'
              className="min-h-[160px] resize-none font-mono text-sm"
              {...form.register('backstory')}
              data-testid="persona-backstory-input"
            />
            <p className="text-[11px] text-muted-foreground">
              Who is this person? Write in second person: &quot;You are...&quot;
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Emotion</Label>
              <Select value={form.watch('emotion')} onValueChange={(v) => form.setValue('emotion', v)}>
                <SelectTrigger data-testid="persona-emotion-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMOTIONS.map((e) => (
                    <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Cooperation</Label>
              <Select value={form.watch('cooperationLevel')} onValueChange={(v) => form.setValue('cooperationLevel', v)}>
                <SelectTrigger data-testid="persona-cooperation-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COOPERATION_LEVELS.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Patience</Label>
              <Select value={form.watch('patience')} onValueChange={(v) => form.setValue('patience', v)}>
                <SelectTrigger data-testid="persona-patience-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PATIENCE_LEVELS.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Speech Style</Label>
              <Select value={form.watch('speechStyle')} onValueChange={(v) => form.setValue('speechStyle', v)}>
                <SelectTrigger data-testid="persona-speech-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPEECH_STYLES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Intent Clarity</Label>
            <Select value={form.watch('intentClarity')} onValueChange={(v) => form.setValue('intentClarity', v)}>
              <SelectTrigger data-testid="persona-clarity-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INTENT_CLARITY.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Button type="submit" disabled={isSubmitting} data-testid="create-persona-submit">
              {isSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>
              ) : (
                <><Plus className="mr-2 h-4 w-4" />Create Persona</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
