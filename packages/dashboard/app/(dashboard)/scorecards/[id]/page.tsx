'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ClipboardList, Loader2, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DeleteDialog } from '@/components/shared/delete-dialog';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig } from '@/lib/eval-config';
import { toast } from 'sonner';
import type { ScorecardCategory, ScorecardCriteria } from '@chanl/eval-sdk';

// ---------------------------------------------------------------------------
// Criteria type metadata
// ---------------------------------------------------------------------------

const CRITERIA_TYPES = [
  { value: 'keyword', label: 'Keyword', description: 'Check for specific words/phrases' },
  { value: 'prompt', label: 'Prompt (LLM Judge)', description: 'LLM evaluates against a rubric' },
  { value: 'response_time', label: 'Response Time', description: 'Check agent latency' },
  { value: 'tool_call', label: 'Tool Call', description: 'Check if agent called a tool' },
  { value: 'talk_time', label: 'Talk Time', description: 'Measure talk ratio' },
  { value: 'silence_duration', label: 'Silence Duration', description: 'Detect dead air' },
  { value: 'interruptions', label: 'Interruptions', description: 'Count overlapping messages' },
];

function getTypeLabel(type: string): string {
  return CRITERIA_TYPES.find((t) => t.value === type)?.label ?? type;
}

// ---------------------------------------------------------------------------
// Add Criterion Dialog
// ---------------------------------------------------------------------------

function AddCriterionDialog({
  open,
  onOpenChange,
  scorecardId,
  categoryId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scorecardId: string;
  categoryId: string;
  onCreated: () => void;
}) {
  const { client } = useEvalConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('keyword');
  const [rubric, setRubric] = useState('');
  const [keywords, setKeywords] = useState('');
  const [maxMs, setMaxMs] = useState('5000');
  const [toolName, setToolName] = useState('');

  function buildSettings(): Record<string, unknown> {
    switch (type) {
      case 'keyword':
        return { keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean), matchType: 'any' };
      case 'prompt':
        return { rubric };
      case 'response_time':
        return { maxMs: parseInt(maxMs) || 5000 };
      case 'tool_call':
        return { toolName };
      default:
        return {};
    }
  }

  async function handleSubmit() {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setIsSubmitting(true);
    try {
      await client.scorecards.createCriterion(scorecardId, {
        categoryId,
        name,
        type,
        settings: buildSettings(),
      });
      toast.success(`Criterion "${name}" added`);
      setName(''); setType('keyword'); setRubric(''); setKeywords(''); setMaxMs('5000'); setToolName('');
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create criterion');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="add-criterion-dialog">
        <DialogHeader>
          <DialogTitle>Add Criterion</DialogTitle>
          <DialogDescription>Define an evaluation rule for this scorecard.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Greeting Check" data-testid="criterion-name" />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger data-testid="criterion-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CRITERIA_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="flex flex-col">
                      <span>{t.label}</span>
                      <span className="text-xs text-muted-foreground">{t.description}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Type-specific config */}
          {type === 'keyword' && (
            <div className="space-y-2">
              <Label>Keywords (comma-separated)</Label>
              <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="hello, welcome, thank you" />
            </div>
          )}
          {type === 'prompt' && (
            <div className="space-y-2">
              <Label>Evaluation Rubric</Label>
              <Textarea value={rubric} onChange={(e) => setRubric(e.target.value)} placeholder="Evaluate whether the agent..." className="min-h-[100px] resize-none" />
            </div>
          )}
          {type === 'response_time' && (
            <div className="space-y-2">
              <Label>Max Response Time (ms)</Label>
              <Input type="number" value={maxMs} onChange={(e) => setMaxMs(e.target.value)} />
            </div>
          )}
          {type === 'tool_call' && (
            <div className="space-y-2">
              <Label>Expected Tool Name</Label>
              <Input value={toolName} onChange={(e) => setToolName(e.target.value)} placeholder="e.g. check_order_status" />
            </div>
          )}
          {['talk_time', 'silence_duration', 'interruptions'].includes(type) && (
            <p className="text-sm text-muted-foreground">No additional configuration needed for this type.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} data-testid="add-criterion-submit">
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding...</> : <><Plus className="mr-2 h-4 w-4" />Add Criterion</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Criterion row
// ---------------------------------------------------------------------------

function CriterionRow({ criterion, scorecardId, onDeleted }: {
  criterion: ScorecardCriteria;
  scorecardId: string;
  onDeleted: () => void;
}) {
  const { client } = useEvalConfig();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await client.scorecards.removeCriterion(scorecardId, criterion.id);
      toast.success('Criterion removed');
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setIsDeleting(false);
    }
  }

  const settings = criterion.settings as Record<string, unknown> | undefined;

  return (
    <div className="flex items-start justify-between gap-3 py-3 group" data-testid={`criterion-${criterion.id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] shrink-0">{getTypeLabel(criterion.type ?? '')}</Badge>
          <span className="text-sm font-medium truncate">{criterion.name}</span>
        </div>
        {settings && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {criterion.type === 'keyword' && `Keywords: ${(settings.keywords as string[] ?? []).join(', ')}`}
            {criterion.type === 'prompt' && `Rubric: ${(settings.rubric as string ?? '').slice(0, 80)}...`}
            {criterion.type === 'response_time' && `Max: ${settings.maxMs}ms`}
            {criterion.type === 'tool_call' && `Tool: ${settings.toolName}`}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        onClick={handleDelete}
        disabled={isDeleting}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ScorecardDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const qc = useQueryClient();
  const { client } = useEvalConfig();

  // Scorecard data
  const q = useQuery({ queryKey: ['scorecard', id], queryFn: () => client.scorecards.get(id), enabled: !!id });

  // Categories + criteria
  const categoriesQ = useQuery({ queryKey: ['scorecard-categories', id], queryFn: () => client.scorecards.listCategories(id), enabled: !!id });
  const criteriaQ = useQuery({ queryKey: ['scorecard-criteria', id], queryFn: () => client.scorecards.listCriteria(id), enabled: !!id });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [passingThreshold, setPassingThreshold] = useState('70');
  const [scoringAlgorithm, setScoringAlgorithm] = useState('weighted_average');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [addCriterionOpen, setAddCriterionOpen] = useState(false);

  useEffect(() => {
    if (q.data) {
      setName(q.data.name);
      setDescription(q.data.description ?? '');
      setStatus(q.data.status ?? 'active');
      setPassingThreshold(q.data.passingThreshold != null ? String(q.data.passingThreshold) : '70');
      setScoringAlgorithm(q.data.scoringAlgorithm ?? 'weighted_average');
    }
  }, [q.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const pt = passingThreshold === '' ? undefined : Number(passingThreshold);
      await client.scorecards.update(id, {
        name,
        description: description || undefined,
        status: status as 'active' | 'inactive' | 'draft',
        passingThreshold: Number.isFinite(pt as number) ? pt : undefined,
        scoringAlgorithm: scoringAlgorithm as 'weighted_average' | 'simple_average' | 'minimum_all' | 'pass_fail',
      });
    },
    onSuccess: () => {
      toast.success('Scorecard saved');
      void qc.invalidateQueries({ queryKey: ['scorecard', id] });
      void qc.invalidateQueries({ queryKey: ['scorecards'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await client.scorecards.remove(id);
      toast.success('Scorecard deleted');
      void qc.invalidateQueries({ queryKey: ['scorecards'] });
      router.push('/scorecards');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally { setIsDeleting(false); setDeleteOpen(false); }
  }

  const refreshCriteria = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['scorecard-criteria', id] });
  }, [qc, id]);

  const scorecard = q.data;
  const categories = categoriesQ.data ?? [];
  const criteria = criteriaQ.data ?? [];
  const defaultCategoryId = categories.length > 0 ? categories[0].id : '';

  return (
    <PageLayout
      icon={ClipboardList}
      title={scorecard?.name ?? 'Scorecard'}
      description={scorecard?.description ?? 'Loading...'}
      actions={
        scorecard ? (
          <Button size="sm" variant="outline" onClick={() => setDeleteOpen(true)} data-testid="delete-scorecard-button">
            <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
          </Button>
        ) : undefined
      }
    >
      <Link href="/scorecards" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit -mt-2 mb-2">
        <ArrowLeft className="h-3.5 w-3.5" />Back to Scorecards
      </Link>

      {q.isLoading ? (
        <div className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>
      ) : q.isError ? (
        <Card><CardContent className="py-6"><p className="text-destructive text-sm">{(q.error as Error).message}</p></CardContent></Card>
      ) : scorecard ? (
        <div className="max-w-2xl space-y-6">
          {/* Basic info */}
          <Card>
            <CardHeader><CardTitle className="text-base font-medium">Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="scorecard-name" />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what this scorecard evaluates..." className="min-h-[80px] resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Passing Threshold (%)</Label>
                  <Input type="number" min={0} max={100} value={passingThreshold} onChange={(e) => setPassingThreshold(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Scoring Method</Label>
                  <Select value={scoringAlgorithm} onValueChange={setScoringAlgorithm}>
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
              <div className="flex justify-end">
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="save-scorecard">
                  {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Criteria */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-medium">Criteria</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{criteria.length} evaluation rule{criteria.length !== 1 ? 's' : ''}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setAddCriterionOpen(true)} disabled={!defaultCategoryId} data-testid="add-criterion-button">
                  <Plus className="mr-2 h-3.5 w-3.5" />Add Criterion
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {criteriaQ.isLoading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : criteria.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No criteria yet. Add your first evaluation rule.</p>
                  {!defaultCategoryId && (
                    <p className="text-xs text-muted-foreground mt-1">A default category will be created automatically.</p>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {criteria.map((c) => (
                    <CriterionRow key={c.id} criterion={c} scorecardId={id} onDeleted={refreshCriteria} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <DeleteDialog open={deleteOpen} onOpenChange={setDeleteOpen} entityType="Scorecard" entityName={scorecard?.name} onConfirm={handleDelete} isLoading={isDeleting} />

      {defaultCategoryId && (
        <AddCriterionDialog
          open={addCriterionOpen}
          onOpenChange={setAddCriterionOpen}
          scorecardId={id}
          categoryId={defaultCategoryId}
          onCreated={refreshCriteria}
        />
      )}
    </PageLayout>
  );
}
