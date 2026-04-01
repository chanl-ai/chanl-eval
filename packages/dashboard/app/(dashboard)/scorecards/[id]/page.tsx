'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  ClipboardList,
  Edit,
  Loader2,
  Plus,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
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
// Text-only criteria types (no voice-specific ones)
// ---------------------------------------------------------------------------

const CRITERIA_TYPES = [
  { value: 'keyword', label: 'Keyword', description: 'Check for specific words or phrases in agent responses', icon: '🔤' },
  { value: 'prompt', label: 'LLM Judge', description: 'Use an LLM to evaluate agent quality against a rubric', icon: '🧠' },
  { value: 'response_time', label: 'Response Time', description: 'Check that agent responds within a time limit', icon: '⏱️' },
  { value: 'tool_call', label: 'Tool Call', description: 'Verify the agent called a specific tool during the conversation', icon: '🔧' },
];

function getTypeLabel(type: string): string {
  return CRITERIA_TYPES.find((t) => t.value === type)?.label ?? type;
}

function getTypeIcon(type: string): string {
  return CRITERIA_TYPES.find((t) => t.value === type)?.icon ?? '📋';
}

// ---------------------------------------------------------------------------
// Add/Edit Criterion Dialog
// ---------------------------------------------------------------------------

function CriterionDialog({
  open,
  onOpenChange,
  scorecardId,
  categoryId,
  editingCriterion,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scorecardId: string;
  categoryId: string;
  editingCriterion?: ScorecardCriteria | null;
  onSaved: () => void;
}) {
  const { client } = useEvalConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('keyword');

  // Type-specific config
  const [keywords, setKeywords] = useState('');
  const [matchType, setMatchType] = useState('any');
  const [rubric, setRubric] = useState('');
  const [maxMs, setMaxMs] = useState('5000');
  const [toolName, setToolName] = useState('');

  // Populate form when editing
  useEffect(() => {
    if (editingCriterion) {
      setName(editingCriterion.name);
      setDescription(editingCriterion.description ?? '');
      setType(editingCriterion.type ?? 'keyword');
      const s = (editingCriterion.settings ?? {}) as Record<string, unknown>;
      setKeywords(((s.keywords as string[]) ?? []).join(', '));
      setMatchType((s.matchType as string) ?? 'any');
      setRubric((s.rubric as string) ?? '');
      setMaxMs(String((s.maxMs as number) ?? 5000));
      setToolName((s.toolName as string) ?? '');
    } else {
      setName(''); setDescription(''); setType('keyword');
      setKeywords(''); setMatchType('any'); setRubric(''); setMaxMs('5000'); setToolName('');
    }
  }, [editingCriterion, open]);

  function buildSettings(): Record<string, unknown> {
    switch (type) {
      case 'keyword':
        return { keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean), matchType };
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
      if (editingCriterion) {
        await client.scorecards.updateCriterion(scorecardId, editingCriterion.id, {
          name, description: description || undefined, type, settings: buildSettings(),
        });
        toast.success(`Criterion "${name}" updated`);
      } else {
        await client.scorecards.createCriterion(scorecardId, {
          categoryId, name, description: description || undefined, type, settings: buildSettings(),
        });
        toast.success(`Criterion "${name}" added`);
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save criterion');
    } finally {
      setIsSubmitting(false);
    }
  }

  const isEditing = !!editingCriterion;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]" data-testid="criterion-dialog">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Criterion' : 'Add Criterion'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update this evaluation rule.' : 'Define a new evaluation rule for this scorecard.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
                      <span className="flex items-center gap-2">
                        <span>{t.icon}</span>
                        <span>{t.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this criterion evaluate?" />
          </div>

          <Separator />

          {/* Type-specific config */}
          {type === 'keyword' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Keywords (comma-separated)</Label>
                <Textarea value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="hello, welcome, thank you, sorry" className="min-h-[60px] resize-none" />
              </div>
              <div className="space-y-2">
                <Label>Match Type</Label>
                <Select value={matchType} onValueChange={setMatchType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any keyword (OR)</SelectItem>
                    <SelectItem value="all">All keywords (AND)</SelectItem>
                    <SelectItem value="must_not_contain">Must NOT contain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {type === 'prompt' && (
            <div className="space-y-2">
              <Label>Evaluation Rubric</Label>
              <Textarea
                value={rubric}
                onChange={(e) => setRubric(e.target.value)}
                placeholder="Evaluate whether the agent showed empathy, acknowledged the customer's feelings, and maintained a professional tone. Score 0-10."
                className="min-h-[120px] resize-none"
              />
              <p className="text-xs text-muted-foreground">The LLM will use this rubric to evaluate the conversation and provide a score.</p>
            </div>
          )}
          {type === 'response_time' && (
            <div className="space-y-2">
              <Label>Max Response Time (milliseconds)</Label>
              <Input type="number" value={maxMs} onChange={(e) => setMaxMs(e.target.value)} />
              <p className="text-xs text-muted-foreground">Agent responses slower than this threshold will fail.</p>
            </div>
          )}
          {type === 'tool_call' && (
            <div className="space-y-2">
              <Label>Expected Tool Name</Label>
              <Input value={toolName} onChange={(e) => setToolName(e.target.value)} placeholder="e.g. check_order_status, process_refund" />
              <p className="text-xs text-muted-foreground">The agent must call this tool at least once during the conversation.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} data-testid="criterion-submit">
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : isEditing ? 'Save Changes' : <><Plus className="mr-2 h-4 w-4" />Add Criterion</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Criterion Card — matches chanl-admin pattern
// ---------------------------------------------------------------------------

function CriterionCard({
  criterion,
  scorecardId,
  onEdit,
  onDeleted,
}: {
  criterion: ScorecardCriteria;
  scorecardId: string;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { client } = useEvalConfig();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await client.scorecards.removeCriterion(scorecardId, criterion.id);
      toast.success('Criterion removed');
      setDeleteOpen(false);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setIsDeleting(false);
    }
  }

  const settings = (criterion.settings ?? {}) as Record<string, unknown>;
  const typeLabel = getTypeLabel(criterion.type ?? '');
  const typeIcon = getTypeIcon(criterion.type ?? '');

  // Build settings summary
  let settingsSummary = '';
  switch (criterion.type) {
    case 'keyword': {
      const kws = (settings.keywords as string[]) ?? [];
      const mt = (settings.matchType as string) ?? 'any';
      settingsSummary = `${mt === 'must_not_contain' ? 'Must NOT contain' : mt === 'all' ? 'All of' : 'Any of'}: ${kws.join(', ')}`;
      break;
    }
    case 'prompt':
      settingsSummary = ((settings.rubric as string) ?? '').slice(0, 120);
      if ((settings.rubric as string)?.length > 120) settingsSummary += '...';
      break;
    case 'response_time':
      settingsSummary = `Max ${settings.maxMs}ms`;
      break;
    case 'tool_call':
      settingsSummary = `Tool: ${settings.toolName}`;
      break;
  }

  return (
    <>
      <Card className="hover:shadow-sm transition-shadow border-l-4 border-l-primary/30" data-testid={`criterion-card-${criterion.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">{typeIcon}</span>
                <span className="text-sm font-medium">{criterion.name}</span>
                <Badge variant="secondary" className="text-[10px]">{typeLabel}</Badge>
              </div>
              {criterion.description && (
                <p className="text-xs text-muted-foreground mb-1">{criterion.description}</p>
              )}
              {settingsSummary && (
                <p className="text-xs text-muted-foreground font-mono truncate">{settingsSummary}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit} data-testid={`edit-criterion-${criterion.id}`}>
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityType="Criterion"
        entityName={criterion.name}
        onConfirm={handleDelete}
        isLoading={isDeleting}
        testIdPrefix="criterion"
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Category Section — groups criteria under a category header
// ---------------------------------------------------------------------------

function CategorySection({
  category,
  criteria,
  scorecardId,
  onAddCriterion,
  onEditCriterion,
  onRefresh,
}: {
  category: ScorecardCategory;
  criteria: ScorecardCriteria[];
  scorecardId: string;
  onAddCriterion: (categoryId: string) => void;
  onEditCriterion: (criterion: ScorecardCriteria) => void;
  onRefresh: () => void;
}) {
  const categoryCriteria = criteria.filter((c) => c.categoryId === category.id);

  return (
    <div className="space-y-3" data-testid={`category-section-${category.id}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{category.name}</h3>
          <Badge variant="outline" className="text-[10px]">{categoryCriteria.length} criteria</Badge>
          {category.weight != null && category.weight !== 1 && (
            <Badge variant="secondary" className="text-[10px]">Weight: {category.weight}</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-7" onClick={() => onAddCriterion(category.id)}>
          <Plus className="mr-1 h-3 w-3" />
          <span className="text-xs">Add</span>
        </Button>
      </div>

      {category.description && (
        <p className="text-xs text-muted-foreground">{category.description}</p>
      )}

      {categoryCriteria.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center">
          <p className="text-xs text-muted-foreground">No criteria in this category yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {categoryCriteria.map((c) => (
            <CriterionCard
              key={c.id}
              criterion={c}
              scorecardId={scorecardId}
              onEdit={() => onEditCriterion(c)}
              onDeleted={onRefresh}
            />
          ))}
        </div>
      )}
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

  const q = useQuery({ queryKey: ['scorecard', id], queryFn: () => client.scorecards.get(id), enabled: !!id });
  const categoriesQ = useQuery({ queryKey: ['scorecard-categories', id], queryFn: () => client.scorecards.listCategories(id), enabled: !!id });
  const criteriaQ = useQuery({ queryKey: ['scorecard-criteria', id], queryFn: () => client.scorecards.listCriteria(id), enabled: !!id });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [passingThreshold, setPassingThreshold] = useState('70');
  const [scoringAlgorithm, setScoringAlgorithm] = useState('weighted_average');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [criterionDialogOpen, setCriterionDialogOpen] = useState(false);
  const [editingCriterion, setEditingCriterion] = useState<ScorecardCriteria | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState('');

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
        name, description: description || undefined,
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

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['scorecard-criteria', id] });
    void qc.invalidateQueries({ queryKey: ['scorecard-categories', id] });
  }, [qc, id]);

  function handleAddCriterion(categoryId: string) {
    setActiveCategoryId(categoryId);
    setEditingCriterion(null);
    setCriterionDialogOpen(true);
  }

  function handleEditCriterion(criterion: ScorecardCriteria) {
    setActiveCategoryId(criterion.categoryId);
    setEditingCriterion(criterion);
    setCriterionDialogOpen(true);
  }

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
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => handleAddCriterion(defaultCategoryId)} disabled={!defaultCategoryId} data-testid="add-criterion-top">
              <Plus className="mr-2 h-3.5 w-3.5" />Add Criterion
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeleteOpen(true)} data-testid="delete-scorecard-button">
              <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
            </Button>
          </div>
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
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Left: Criteria by category */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-medium">Evaluation Criteria</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {criteria.length} criterion{criteria.length !== 1 ? 'a' : ''} across {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {criteriaQ.isLoading || categoriesQ.isLoading ? (
                  <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
                ) : categories.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">No categories yet. Criteria will be organized into categories.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {categories.map((cat) => (
                      <CategorySection
                        key={cat.id}
                        category={cat}
                        criteria={criteria}
                        scorecardId={id}
                        onAddCriterion={handleAddCriterion}
                        onEditCriterion={handleEditCriterion}
                        onRefresh={refresh}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Scorecard settings */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="scorecard-name" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this evaluate?" className="min-h-[60px] resize-none text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Passing Threshold (%)</Label>
                  <Input type="number" min={0} max={100} value={passingThreshold} onChange={(e) => setPassingThreshold(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Scoring Method</Label>
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
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full" data-testid="save-scorecard">
                  {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      <DeleteDialog open={deleteOpen} onOpenChange={setDeleteOpen} entityType="Scorecard" entityName={scorecard?.name} onConfirm={handleDelete} isLoading={isDeleting} />

      <CriterionDialog
        open={criterionDialogOpen}
        onOpenChange={setCriterionDialogOpen}
        scorecardId={id}
        categoryId={activeCategoryId || defaultCategoryId}
        editingCriterion={editingCriterion}
        onSaved={refresh}
      />
    </PageLayout>
  );
}
