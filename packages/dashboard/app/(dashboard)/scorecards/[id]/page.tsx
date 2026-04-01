'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardList,
  Edit,
  FolderOpen,
  Layers,
  Loader2,
  MessageSquareText,
  Plus,
  Search,
  Timer,
  Trash2,
  Type,
  Wrench,
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
import { cn } from '@/lib/utils';
import type { ScorecardCategory, ScorecardCriteria } from '@chanl/eval-sdk';

// ---------------------------------------------------------------------------
// Criteria type config — Lucide icons, text-only types
// ---------------------------------------------------------------------------

const CRITERIA_TYPE_MAP: Record<string, { label: string; icon: typeof Type; description: string }> = {
  keyword:       { label: 'Keyword',       icon: Type,               description: 'Check for specific words or phrases' },
  prompt:        { label: 'LLM Judge',     icon: MessageSquareText,  description: 'LLM evaluates against a rubric' },
  response_time: { label: 'Response Time', icon: Timer,              description: 'Check agent responds within time limit' },
  tool_call:     { label: 'Tool Call',     icon: Wrench,             description: 'Verify agent called a specific tool' },
};

const CRITERIA_TYPES = Object.entries(CRITERIA_TYPE_MAP).map(([value, meta]) => ({ value, ...meta }));

function getTypeInfo(type: string) {
  return CRITERIA_TYPE_MAP[type] ?? { label: type, icon: ClipboardList, description: '' };
}

// ---------------------------------------------------------------------------
// Add/Edit Criterion Dialog
// ---------------------------------------------------------------------------

function CriterionDialog({
  open, onOpenChange, scorecardId, categoryId, editingCriterion, onSaved,
}: {
  open: boolean; onOpenChange: (open: boolean) => void;
  scorecardId: string; categoryId: string;
  editingCriterion?: ScorecardCriteria | null; onSaved: () => void;
}) {
  const { client } = useEvalConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('keyword');
  const [keywords, setKeywords] = useState('');
  const [matchType, setMatchType] = useState('any');
  const [rubric, setRubric] = useState('');
  const [maxMs, setMaxMs] = useState('5000');
  const [toolName, setToolName] = useState('');

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
      case 'keyword': return { keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean), matchType };
      case 'prompt': return { rubric };
      case 'response_time': return { maxMs: parseInt(maxMs) || 5000 };
      case 'tool_call': return { toolName };
      default: return {};
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
    } finally { setIsSubmitting(false); }
  }

  const isEditing = !!editingCriterion;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]" data-testid="criterion-dialog">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Criterion' : 'Add Criterion'}</DialogTitle>
          <DialogDescription>{isEditing ? 'Update this evaluation rule.' : 'Define a new evaluation rule.'}</DialogDescription>
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
                  {CRITERIA_TYPES.map((t) => {
                    const Icon = t.icon;
                    return (
                      <SelectItem key={t.value} value={t.value}>
                        <span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" />{t.label}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this criterion evaluate?" />
          </div>
          <Separator />
          {type === 'keyword' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Keywords (comma-separated)</Label>
                <Textarea value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="hello, welcome, thank you" className="min-h-[60px] resize-none" />
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
              <Textarea value={rubric} onChange={(e) => setRubric(e.target.value)} placeholder="Evaluate whether the agent showed empathy..." className="min-h-[120px] resize-none" />
              <p className="text-xs text-muted-foreground">The LLM will use this rubric to score the conversation.</p>
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
// Category Dialog — create/edit categories
// ---------------------------------------------------------------------------

function CategoryDialog({
  open, onOpenChange, scorecardId, editingCategory, onSaved,
}: {
  open: boolean; onOpenChange: (open: boolean) => void;
  scorecardId: string; editingCategory?: ScorecardCategory | null; onSaved: () => void;
}) {
  const { client } = useEvalConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catWeight, setCatWeight] = useState('1');

  useEffect(() => {
    if (editingCategory) {
      setCatName(editingCategory.name);
      setCatDesc(editingCategory.description ?? '');
      setCatWeight(String(editingCategory.weight ?? 1));
    } else {
      setCatName(''); setCatDesc(''); setCatWeight('1');
    }
  }, [editingCategory, open]);

  async function handleSubmit() {
    if (!catName.trim()) { toast.error('Name is required'); return; }
    setIsSubmitting(true);
    try {
      if (editingCategory) {
        await client.scorecards.updateCategory(scorecardId, editingCategory.id, {
          name: catName, description: catDesc || undefined, weight: parseInt(catWeight) || 1,
        });
        toast.success(`Category "${catName}" updated`);
      } else {
        await client.scorecards.createCategory(scorecardId, {
          name: catName, description: catDesc || undefined, weight: parseInt(catWeight) || 1,
        });
        toast.success(`Category "${catName}" created`);
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save category');
    } finally { setIsSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]" data-testid="category-dialog">
        <DialogHeader>
          <DialogTitle>{editingCategory ? 'Edit Category' : 'Add Category'}</DialogTitle>
          <DialogDescription>Categories group related evaluation criteria.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="e.g. Communication Quality" data-testid="category-name" />
          </div>
          <div className="space-y-2">
            <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input value={catDesc} onChange={(e) => setCatDesc(e.target.value)} placeholder="What does this category measure?" />
          </div>
          <div className="space-y-2">
            <Label>Weight</Label>
            <Input type="number" min={1} max={10} value={catWeight} onChange={(e) => setCatWeight(e.target.value)} className="w-20" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} data-testid="category-submit">
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : editingCategory ? 'Save' : <><Plus className="mr-2 h-4 w-4" />Add Category</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Criterion Card
// ---------------------------------------------------------------------------

function CriterionCard({ criterion, scorecardId, onEdit, onDeleted }: {
  criterion: ScorecardCriteria; scorecardId: string; onEdit: () => void; onDeleted: () => void;
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
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Delete failed'); }
    finally { setIsDeleting(false); }
  }

  const { label, icon: TypeIcon } = getTypeInfo(criterion.type ?? '');
  const settings = (criterion.settings ?? {}) as Record<string, unknown>;

  let summary = '';
  switch (criterion.type) {
    case 'keyword': {
      const kws = (settings.keywords as string[]) ?? [];
      const mt = (settings.matchType as string) ?? 'any';
      summary = `${mt === 'must_not_contain' ? 'Excludes' : mt === 'all' ? 'All of' : 'Any of'}: ${kws.join(', ')}`;
      break;
    }
    case 'prompt': summary = ((settings.rubric as string) ?? '').slice(0, 100) + ((settings.rubric as string)?.length > 100 ? '...' : ''); break;
    case 'response_time': summary = `Max ${settings.maxMs}ms`; break;
    case 'tool_call': summary = `Tool: ${settings.toolName}`; break;
  }

  return (
    <>
      <Card className="hover:shadow-sm transition-shadow" data-testid={`criterion-card-${criterion.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                <TypeIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium">{criterion.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{label}</Badge>
                </div>
                {criterion.description && <p className="text-xs text-muted-foreground mb-1">{criterion.description}</p>}
                {summary && <p className="text-xs text-muted-foreground font-mono truncate">{summary}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit}><Edit className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <DeleteDialog open={deleteOpen} onOpenChange={setDeleteOpen} entityType="Criterion" entityName={criterion.name} onConfirm={handleDelete} isLoading={isDeleting} testIdPrefix="criterion" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page — 3-column: categories sidebar | criteria | settings
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
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ScorecardCategory | null>(null);
  const [deleteCategoryOpen, setDeleteCategoryOpen] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState('');
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);

  useEffect(() => {
    if (q.data) {
      setName(q.data.name); setDescription(q.data.description ?? '');
      setStatus(q.data.status ?? 'active');
      setPassingThreshold(q.data.passingThreshold != null ? String(q.data.passingThreshold) : '70');
      setScoringAlgorithm(q.data.scoringAlgorithm ?? 'weighted_average');
    }
  }, [q.data]);

  // Auto-select first category
  useEffect(() => {
    const cats = categoriesQ.data ?? [];
    if (cats.length > 0 && !selectedCategoryId) setSelectedCategoryId(cats[0].id);
  }, [categoriesQ.data, selectedCategoryId]);

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
    onSuccess: () => { toast.success('Scorecard saved'); void qc.invalidateQueries({ queryKey: ['scorecard', id] }); void qc.invalidateQueries({ queryKey: ['scorecards'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleDelete() {
    setIsDeleting(true);
    try { await client.scorecards.remove(id); toast.success('Scorecard deleted'); void qc.invalidateQueries({ queryKey: ['scorecards'] }); router.push('/scorecards'); }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Delete failed'); }
    finally { setIsDeleting(false); setDeleteOpen(false); }
  }

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['scorecard-criteria', id] });
    void qc.invalidateQueries({ queryKey: ['scorecard-categories', id] });
  }, [qc, id]);

  async function handleDeleteCategory() {
    if (!deletingCategoryId) return;
    setIsDeletingCategory(true);
    try {
      await client.scorecards.removeCategory(id, deletingCategoryId);
      toast.success('Category deleted');
      if (selectedCategoryId === deletingCategoryId) setSelectedCategoryId(null);
      setDeleteCategoryOpen(false);
      refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Delete failed'); }
    finally { setIsDeletingCategory(false); }
  }

  const scorecard = q.data;
  const categories = categoriesQ.data ?? [];
  const criteria = criteriaQ.data ?? [];
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) ?? null;
  const filteredCriteria = selectedCategoryId ? criteria.filter((c) => c.categoryId === selectedCategoryId) : criteria;

  return (
    <PageLayout
      backHref="/scorecards"
      title={scorecard?.name ?? 'Scorecard'}
      description={scorecard?.description ?? 'Loading...'}
      actions={scorecard ? (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => { setActiveCategoryId(selectedCategoryId ?? categories[0]?.id ?? ''); setEditingCriterion(null); setCriterionDialogOpen(true); }} disabled={categories.length === 0} data-testid="add-criterion-top">
            <Plus className="mr-2 h-3.5 w-3.5" />Add Criterion
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDeleteOpen(true)} data-testid="delete-scorecard-button">
            <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
          </Button>
        </div>
      ) : undefined}
    >
      {q.isLoading ? (
        <div className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>
      ) : q.isError ? (
        <Card><CardContent className="py-6"><p className="text-destructive text-sm">{(q.error as Error).message}</p></CardContent></Card>
      ) : scorecard ? (
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_280px] gap-4 h-[calc(100vh-250px)]">

          {/* Col 1: Category sidebar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Categories</span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditingCategory(null); setCategoryDialogOpen(true); }} data-testid="add-category-button">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {categoriesQ.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : categories.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground mb-2">No categories yet</p>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => { setEditingCategory(null); setCategoryDialogOpen(true); }}>
                  <Plus className="mr-1 h-3 w-3" />Add Category
                </Button>
              </div>
            ) : (
              categories.map((cat) => {
                const count = criteria.filter((c) => c.categoryId === cat.id).length;
                const isSelected = selectedCategoryId === cat.id;
                return (
                  <div key={cat.id} className="group relative">
                    <button
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={cn(
                        'flex flex-col w-full rounded-lg border px-3 py-3 text-left select-none transition-all',
                        isSelected ? 'border-primary/30 bg-primary/5 shadow-sm' : 'border-transparent hover:border-border hover:bg-muted/50'
                      )}
                      data-testid={`category-${cat.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Layers className={cn('h-4 w-4 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                        <span className={cn('text-sm truncate', isSelected ? 'font-medium text-primary' : 'text-foreground')}>{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 ml-6">
                        <Badge variant="secondary" className="text-[10px]">{count} criteria</Badge>
                        {cat.weight != null && cat.weight !== 1 && (
                          <span className="text-[10px] text-muted-foreground">Weight: {cat.weight}</span>
                        )}
                      </div>
                      {cat.description && (
                        <p className="text-[11px] text-muted-foreground mt-1 ml-6 truncate">{cat.description}</p>
                      )}
                    </button>
                    {/* Hover actions */}
                    <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-0.5 bg-background rounded-md shadow-sm border px-0.5">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); setEditingCategory(cat); setCategoryDialogOpen(true); }}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeletingCategoryId(cat.id); setDeleteCategoryOpen(true); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Col 2: Criteria for selected category */}
          <div className="overflow-y-auto pr-2">
            {selectedCategory ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-medium">{selectedCategory.name}</h3>
                    {selectedCategory.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{selectedCategory.description}</p>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setActiveCategoryId(selectedCategory.id); setEditingCriterion(null); setCriterionDialogOpen(true); }}>
                    <Plus className="mr-1.5 h-3 w-3" />Add
                  </Button>
                </div>

                {criteriaQ.isLoading ? (
                  <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
                ) : filteredCriteria.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <ClipboardList className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No criteria in this category.</p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => { setActiveCategoryId(selectedCategory.id); setEditingCriterion(null); setCriterionDialogOpen(true); }}>
                      <Plus className="mr-1.5 h-3 w-3" />Add Criterion
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredCriteria.map((c) => (
                      <CriterionCard
                        key={c.id}
                        criterion={c}
                        scorecardId={id}
                        onEdit={() => { setActiveCategoryId(c.categoryId); setEditingCriterion(c); setCriterionDialogOpen(true); }}
                        onDeleted={refresh}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <FolderOpen className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-sm">Select a category to view criteria</p>
                </div>
              </div>
            )}
          </div>

          {/* Col 3: Settings sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" data-testid="scorecard-name" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[50px] resize-none text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Pass Threshold (%)</Label>
                  <Input type="number" min={0} max={100} value={passingThreshold} onChange={(e) => setPassingThreshold(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Scoring Method</Label>
                  <Select value={scoringAlgorithm} onValueChange={setScoringAlgorithm}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weighted_average">Weighted Avg</SelectItem>
                      <SelectItem value="simple_average">Simple Avg</SelectItem>
                      <SelectItem value="minimum_all">Min All</SelectItem>
                      <SelectItem value="pass_fail">Pass/Fail</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full h-8 text-sm" data-testid="save-scorecard">
                  {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      <DeleteDialog open={deleteOpen} onOpenChange={setDeleteOpen} entityType="Scorecard" entityName={scorecard?.name} onConfirm={handleDelete} isLoading={isDeleting} />
      <DeleteDialog open={deleteCategoryOpen} onOpenChange={setDeleteCategoryOpen} entityType="Category" entityName={categories.find((c) => c.id === deletingCategoryId)?.name} onConfirm={handleDeleteCategory} isLoading={isDeletingCategory} testIdPrefix="category" />
      <CategoryDialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen} scorecardId={id} editingCategory={editingCategory} onSaved={refresh} />
      <CriterionDialog
        open={criterionDialogOpen} onOpenChange={setCriterionDialogOpen}
        scorecardId={id} categoryId={activeCategoryId || categories[0]?.id || ''}
        editingCriterion={editingCriterion} onSaved={refresh}
      />
    </PageLayout>
  );
}
