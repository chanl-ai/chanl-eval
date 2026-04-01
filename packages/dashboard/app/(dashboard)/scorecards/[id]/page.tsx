'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ArrowLeft, ClipboardList, Plus, Trash2, X } from 'lucide-react';
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
import { DeleteDialog } from '@/components/shared/delete-dialog';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig } from '@/lib/eval-config';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Criteria types (shared with create dialog)
// ---------------------------------------------------------------------------

const CRITERIA_TYPES = [
  { value: 'keyword', label: 'Keyword' },
  { value: 'prompt', label: 'Prompt (LLM Judge)' },
  { value: 'response_time', label: 'Response Time' },
  { value: 'tool_call', label: 'Tool Call' },
  { value: 'talk_time', label: 'Talk Time' },
  { value: 'silence_duration', label: 'Silence Duration' },
  { value: 'interruptions', label: 'Interruptions' },
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ScorecardDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const qc = useQueryClient();
  const { client } = useEvalConfig();

  const q = useQuery({
    queryKey: ['scorecard', id],
    queryFn: () => client.scorecards.get(id),
    enabled: !!id,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [passingThreshold, setPassingThreshold] = useState('70');
  const [scoringAlgorithm, setScoringAlgorithm] = useState('weighted_average');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  }

  const scorecard = q.data;

  return (
    <PageLayout
      icon={ClipboardList}
      title={scorecard?.name ?? 'Scorecard'}
      description={scorecard?.description ?? 'Loading...'}
      actions={
        scorecard ? (
          <Button size="sm" variant="outline" onClick={() => setDeleteOpen(true)} data-testid="delete-scorecard-button">
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </Button>
        ) : undefined
      }
    >
      <Link
        href="/scorecards"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit -mt-2 mb-2"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Scorecards
      </Link>

      {q.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : q.isError ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-destructive text-sm">{(q.error as Error).message}</p>
          </CardContent>
        </Card>
      ) : scorecard ? (
        <div className="max-w-2xl space-y-6">
          {/* Basic info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} data-testid="scorecard-name" />
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
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this scorecard evaluates..."
                  className="min-h-[80px] resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Passing Threshold (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={passingThreshold}
                    onChange={(e) => setPassingThreshold(e.target.value)}
                    data-testid="scorecard-threshold"
                  />
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
            </CardContent>
          </Card>

          {/* Criteria section — placeholder until criteria API is wired */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-medium">Criteria</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Evaluation rules that determine the score
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground py-4 text-center">
                Criteria management is available when creating a new scorecard. Editing existing criteria coming soon.
              </p>
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex justify-end">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="save-scorecard">
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      ) : null}

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityType="Scorecard"
        entityName={scorecard?.name}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </PageLayout>
  );
}
