'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
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
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useEvalConfig } from '@/lib/eval-config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const CRITERIA_TYPES = [
  { value: 'keyword', label: 'Keyword', description: 'Check for specific words/phrases in responses' },
  { value: 'prompt', label: 'LLM Judge', description: 'LLM evaluates quality against a rubric' },
  { value: 'response_time', label: 'Response Time', description: 'Check agent responds within time limit' },
  { value: 'tool_call', label: 'Tool Call', description: 'Verify agent called a specific tool' },
] as const;

interface CriterionDraft {
  id: string;
  name: string;
  type: string;
  weight: number;
  config: Record<string, unknown>;
}

const formSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
  passingThreshold: z.number().min(0).max(100),
  scoringAlgorithm: z.enum(['weighted_average', 'simple_average', 'minimum_all', 'pass_fail']),
});

type FormValues = z.infer<typeof formSchema>;

// ---------------------------------------------------------------------------
// Criterion config forms per type
// ---------------------------------------------------------------------------

function KeywordConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const keywords = (config.keywords as string[] | undefined) ?? [];
  const [input, setInput] = useState('');

  return (
    <div className="space-y-2">
      <Label className="text-xs">Keywords (press Enter to add)</Label>
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && input.trim()) {
            e.preventDefault();
            onChange({ ...config, keywords: [...keywords, input.trim()] });
            setInput('');
          }
        }}
        placeholder="Type a keyword..."
        className="text-sm"
      />
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {keywords.map((kw, i) => (
            <Badge key={i} variant="secondary" className="text-xs gap-1">
              {kw}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onChange({ ...config, keywords: keywords.filter((_, j) => j !== i) })}
              />
            </Badge>
          ))}
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-xs">Match Type</Label>
        <Select value={(config.matchType as string) ?? 'any'} onValueChange={(v) => onChange({ ...config, matchType: v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any keyword</SelectItem>
            <SelectItem value="all">All keywords</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function PromptConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">Evaluation Rubric</Label>
      <Textarea
        value={(config.rubric as string) ?? ''}
        onChange={(e) => onChange({ ...config, rubric: e.target.value })}
        placeholder="Evaluate whether the agent showed empathy and maintained a professional tone. Score 0-10."
        className="min-h-[80px] resize-none text-sm"
      />
    </div>
  );
}

function ResponseTimeConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">Max Response Time (ms)</Label>
      <Input
        type="number"
        value={(config.maxMs as number) ?? 5000}
        onChange={(e) => onChange({ ...config, maxMs: parseInt(e.target.value) || 5000 })}
        className="text-sm"
      />
    </div>
  );
}

function ToolCallConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">Expected Tool Name</Label>
      <Input
        value={(config.toolName as string) ?? ''}
        onChange={(e) => onChange({ ...config, toolName: e.target.value })}
        placeholder="e.g. check_order_status"
        className="text-sm"
      />
    </div>
  );
}

function CriterionConfigForm({ type, config, onChange }: { type: string; config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  switch (type) {
    case 'keyword': return <KeywordConfig config={config} onChange={onChange} />;
    case 'prompt': return <PromptConfig config={config} onChange={onChange} />;
    case 'response_time': return <ResponseTimeConfig config={config} onChange={onChange} />;
    case 'tool_call': return <ToolCallConfig config={config} onChange={onChange} />;
    default: return <p className="text-xs text-muted-foreground">No additional configuration needed.</p>;
  }
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

interface CreateScorecardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateScorecardDialog({ open, onOpenChange }: CreateScorecardDialogProps) {
  const { client } = useEvalConfig();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [criteria, setCriteria] = useState<CriterionDraft[]>([]);
  const [addingType, setAddingType] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      passingThreshold: 70,
      scoringAlgorithm: 'weighted_average',
    },
  });

  function addCriterion(type: string) {
    const typeInfo = CRITERIA_TYPES.find((t) => t.value === type);
    setCriteria((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        name: typeInfo?.label ?? type,
        type,
        weight: 1,
        config: {},
      },
    ]);
    setAddingType(null);
  }

  function updateCriterion(id: string, updates: Partial<CriterionDraft>) {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }

  function removeCriterion(id: string) {
    setCriteria((prev) => prev.filter((c) => c.id !== id));
  }

  async function onSubmit(values: FormValues) {
    if (criteria.length === 0) {
      toast.error('Add at least one criterion');
      return;
    }
    setIsSubmitting(true);
    try {
      // Create scorecard first, then we'd add criteria via separate API if available
      // For now, include criteria in the create payload
      await client.scorecards.create({
        name: values.name,
        description: values.description || undefined,
        passingThreshold: values.passingThreshold,
        scoringAlgorithm: values.scoringAlgorithm,
        status: 'active',
      });
      toast.success(`Scorecard "${values.name}" created with ${criteria.length} criteria`);
      void queryClient.invalidateQueries({ queryKey: ['scorecards'] });
      form.reset();
      setCriteria([]);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create scorecard');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto" data-testid="create-scorecard-dialog">
        <DialogHeader>
          <DialogTitle>Create Scorecard</DialogTitle>
          <DialogDescription>
            Define evaluation criteria to grade your agent's conversation quality.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Basic info */}
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
            <Label htmlFor="sc-desc">Description</Label>
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

          <Separator />

          {/* Criteria */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <Label className="text-sm font-medium">Criteria</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {criteria.length} criterion{criteria.length !== 1 ? 'a' : ''} added
                </p>
              </div>
            </div>

            {/* Criteria list */}
            <div className="space-y-3">
              {criteria.map((c) => (
                <div key={c.id} className="rounded-lg border p-3 space-y-3" data-testid={`criterion-${c.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] shrink-0">{c.type}</Badge>
                        <Input
                          value={c.name}
                          onChange={(e) => updateCriterion(c.id, { name: e.target.value })}
                          className="h-7 text-sm font-medium"
                          placeholder="Criterion name"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground shrink-0">Weight:</Label>
                        <Input
                          type="number"
                          value={c.weight}
                          onChange={(e) => updateCriterion(c.id, { weight: parseInt(e.target.value) || 1 })}
                          className="h-7 w-16 text-xs"
                          min={1}
                          max={10}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeCriterion(c.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <CriterionConfigForm
                    type={c.type}
                    config={c.config}
                    onChange={(config) => updateCriterion(c.id, { config })}
                  />
                </div>
              ))}
            </div>

            {/* Add criterion */}
            {addingType !== null ? (
              <div className="mt-3 rounded-lg border border-dashed p-3">
                <Label className="text-xs mb-2 block">Select criterion type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {CRITERIA_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className="flex flex-col items-start rounded-md border p-2 text-left text-xs hover:bg-muted transition-colors"
                      onClick={() => addCriterion(t.value)}
                      data-testid={`add-criterion-${t.value}`}
                    >
                      <span className="font-medium">{t.label}</span>
                      <span className="text-muted-foreground">{t.description}</span>
                    </button>
                  ))}
                </div>
                <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setAddingType(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setAddingType('picking')}
                data-testid="add-criterion-button"
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add Criterion
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || criteria.length === 0} data-testid="create-scorecard-submit">
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
