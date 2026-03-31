'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useEvalConfig } from '@/lib/eval-config';
import { toast } from 'sonner';

export default function PersonaDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const qc = useQueryClient();
  const { client, apiKey } = useEvalConfig();

  const q = useQuery({
    queryKey: ['persona', id, apiKey],
    queryFn: () => client.personas.get(id),
    enabled: !!apiKey && !!id,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emotion, setEmotion] = useState('');
  const [speechStyle, setSpeechStyle] = useState('');

  useEffect(() => {
    if (q.data) {
      setName(q.data.name);
      setDescription(q.data.description ?? '');
      setEmotion(q.data.emotion);
      setSpeechStyle(q.data.speechStyle);
    }
  }, [q.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await client.personas.update(id, {
        name,
        description: description || undefined,
        emotion,
        speechStyle,
      });
    },
    onSuccess: () => {
      toast.success('Persona saved');
      void qc.invalidateQueries({ queryKey: ['persona', id] });
      void qc.invalidateQueries({ queryKey: ['personas'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <SiteHeader title="Persona" />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Link href="/personas" className="text-muted-foreground text-sm hover:underline">
          ← Personas
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
              <CardTitle>Edit persona</CardTitle>
              <CardDescription>Adjust a subset of fields. Full trait editing can use the API.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emotion">Emotion</Label>
                <Input id="emotion" value={emotion} onChange={(e) => setEmotion(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="speechStyle">Speech style</Label>
                <Input id="speechStyle" value={speechStyle} onChange={(e) => setSpeechStyle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
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
