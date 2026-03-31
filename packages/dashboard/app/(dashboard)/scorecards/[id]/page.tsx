'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useEvalConfig } from '@/lib/eval-config';
import { toast } from 'sonner';

export default function ScorecardDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
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
  const [passingThreshold, setPassingThreshold] = useState('');

  useEffect(() => {
    if (q.data) {
      setName(q.data.name);
      setDescription(q.data.description ?? '');
      setStatus(q.data.status ?? 'active');
      setPassingThreshold(
        q.data.passingThreshold != null ? String(q.data.passingThreshold) : '',
      );
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
      });
    },
    onSuccess: () => {
      toast.success('Scorecard saved');
      void qc.invalidateQueries({ queryKey: ['scorecard', id] });
      void qc.invalidateQueries({ queryKey: ['scorecards'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scorecard = q.data;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <Link
        href="/scorecards"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
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
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{scorecard.name}</h1>
            {scorecard.status && (
              <Badge variant="outline">{scorecard.status}</Badge>
            )}
            {scorecard.passingThreshold != null && (
              <Badge variant="secondary">Pass: {scorecard.passingThreshold}%</Badge>
            )}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">Edit Scorecard</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="scorecard-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pt">Passing Threshold (0-100)</Label>
                <Input
                  id="pt"
                  type="number"
                  min={0}
                  max={100}
                  value={passingThreshold}
                  onChange={(e) => setPassingThreshold(e.target.value)}
                  className="max-w-[200px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this scorecard evaluates..."
                  rows={4}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  data-testid="save-scorecard"
                >
                  {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
