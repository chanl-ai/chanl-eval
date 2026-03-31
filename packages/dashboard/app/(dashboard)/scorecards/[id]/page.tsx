'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  const { client, apiKey } = useEvalConfig();

  const q = useQuery({
    queryKey: ['scorecard', id, apiKey],
    queryFn: () => client.scorecards.get(id),
    enabled: !!apiKey && !!id,
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

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Link href="/scorecards" className="text-muted-foreground text-sm hover:underline">
          ← Scorecards
        </Link>
        {!apiKey ? (
          <p className="text-muted-foreground text-sm">
            Configure API key in <Link href="/settings">Settings</Link>.
          </p>
        ) : q.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : q.isError ? (
          <p className="text-destructive">{(q.error as Error).message}</p>
        ) : q.data ? (
          <Card>
            <CardHeader>
              <CardTitle>Edit scorecard</CardTitle>
              <CardDescription>Metadata only — criteria editing via API for now.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">draft</SelectItem>
                    <SelectItem value="active">active</SelectItem>
                    <SelectItem value="inactive">inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pt">Passing threshold (0–100)</Label>
                <Input
                  id="pt"
                  type="number"
                  min={0}
                  max={100}
                  value={passingThreshold}
                  onChange={(e) => setPassingThreshold(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
