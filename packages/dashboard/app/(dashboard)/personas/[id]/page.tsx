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
import { Skeleton } from '@/components/ui/skeleton';
import { BeautifulAvatar } from '@/components/shared/beautiful-avatar';
import { useEvalConfig } from '@/lib/eval-config';
import { toast } from 'sonner';

export default function PersonaDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const qc = useQueryClient();
  const { client } = useEvalConfig();

  const q = useQuery({
    queryKey: ['persona', id],
    queryFn: () => client.personas.get(id),
    enabled: !!id,
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

  const persona = q.data;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <Link
        href="/personas"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Personas
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
      ) : persona ? (
        <>
          {/* Header */}
          <div className="flex items-center gap-4">
            <BeautifulAvatar name={persona.name} platform="persona" size="lg" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{persona.name}</h1>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {persona.emotion && (
                  <Badge variant="secondary">{persona.emotion}</Badge>
                )}
                {persona.speechStyle && (
                  <Badge variant="outline">{persona.speechStyle}</Badge>
                )}
                {persona.language && (
                  <Badge variant="outline">{persona.language}</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Trait summary */}
          {(persona.behavior || persona.conversationTraits) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Traits</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {persona.behavior?.cooperationLevel && (
                    <div>
                      <p className="text-xs text-muted-foreground">Cooperation</p>
                      <p className="text-sm font-medium">{persona.behavior.cooperationLevel}</p>
                    </div>
                  )}
                  {persona.behavior?.patience && (
                    <div>
                      <p className="text-xs text-muted-foreground">Patience</p>
                      <p className="text-sm font-medium">{persona.behavior.patience}</p>
                    </div>
                  )}
                  {persona.behavior?.personality && (
                    <div>
                      <p className="text-xs text-muted-foreground">Personality</p>
                      <p className="text-sm font-medium">{persona.behavior.personality}</p>
                    </div>
                  )}
                  {persona.behavior?.communicationStyle && (
                    <div>
                      <p className="text-xs text-muted-foreground">Communication</p>
                      <p className="text-sm font-medium">{persona.behavior.communicationStyle}</p>
                    </div>
                  )}
                  {persona.intentClarity && (
                    <div>
                      <p className="text-xs text-muted-foreground">Intent Clarity</p>
                      <p className="text-sm font-medium">{persona.intentClarity}</p>
                    </div>
                  )}
                  {persona.gender && (
                    <div>
                      <p className="text-xs text-muted-foreground">Gender</p>
                      <p className="text-sm font-medium">{persona.gender}</p>
                    </div>
                  )}
                  {persona.accent && (
                    <div>
                      <p className="text-xs text-muted-foreground">Accent</p>
                      <p className="text-sm font-medium">{persona.accent}</p>
                    </div>
                  )}
                  {persona.conversationTraits?.goesOffTopic != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Goes Off Topic</p>
                      <p className="text-sm font-medium">
                        {persona.conversationTraits.goesOffTopic ? 'Yes' : 'No'}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Edit Form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">Edit Persona</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="persona-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emotion">Emotion</Label>
                  <Input
                    id="emotion"
                    value={emotion}
                    onChange={(e) => setEmotion(e.target.value)}
                    placeholder="e.g. frustrated, neutral, happy"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="speechStyle">Speech Style</Label>
                <Input
                  id="speechStyle"
                  value={speechStyle}
                  onChange={(e) => setSpeechStyle(e.target.value)}
                  placeholder="e.g. formal, casual, verbose"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this persona's background and behavior..."
                  rows={5}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  data-testid="save-persona"
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
