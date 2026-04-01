'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, UserCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { BeautifulAvatar } from '@/components/shared/beautiful-avatar';
import { DeleteDialog } from '@/components/shared/delete-dialog';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig } from '@/lib/eval-config';
import { toast } from 'sonner';

const EMOTIONS = ['friendly', 'polite', 'neutral', 'calm', 'concerned', 'stressed', 'annoyed', 'frustrated', 'irritated', 'curious', 'distracted'];
const COOPERATION_LEVELS = ['very cooperative', 'cooperative', 'neutral', 'difficult', 'hostile'];
const PATIENCE_LEVELS = ['high', 'medium', 'low'];
const SPEECH_STYLES = ['fast', 'slow', 'normal', 'moderate'];
const INTENT_CLARITY = ['very clear', 'slightly unclear', 'unclear', 'mumbled'];

export default function PersonaDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const qc = useQueryClient();
  const { client } = useEvalConfig();

  const q = useQuery({
    queryKey: ['persona', id],
    queryFn: () => client.personas.get(id),
    enabled: !!id,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emotion, setEmotion] = useState('neutral');
  const [speechStyle, setSpeechStyle] = useState('normal');
  const [intentClarity, setIntentClarity] = useState('very clear');
  const [cooperationLevel, setCooperationLevel] = useState('cooperative');
  const [patience, setPatience] = useState('medium');
  const [backstory, setBackstory] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (q.data) {
      setName(q.data.name);
      setDescription(q.data.description ?? '');
      setEmotion(q.data.emotion || 'neutral');
      setSpeechStyle(q.data.speechStyle || 'normal');
      setIntentClarity(q.data.intentClarity || 'very clear');
      setCooperationLevel(q.data.behavior?.cooperationLevel || 'cooperative');
      setPatience(q.data.behavior?.patience || 'medium');
      setBackstory(q.data.backstory ?? '');
      setVariables(q.data.variables ?? {});
    }
  }, [q.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Filter out empty-key entries
      const cleanVars: Record<string, string> = {};
      for (const [k, v] of Object.entries(variables)) {
        if (k.trim()) cleanVars[k.trim()] = v;
      }
      await client.personas.update(id, {
        name,
        description: description || undefined,
        emotion,
        speechStyle,
        intentClarity,
        backstory: backstory || undefined,
        variables: Object.keys(cleanVars).length > 0 ? cleanVars : undefined,
        behavior: {
          cooperationLevel,
          patience,
        },
      });
    },
    onSuccess: () => {
      toast.success('Persona saved');
      void qc.invalidateQueries({ queryKey: ['persona', id] });
      void qc.invalidateQueries({ queryKey: ['personas'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await client.personas.remove(id);
      toast.success('Persona deleted');
      void qc.invalidateQueries({ queryKey: ['personas'] });
      router.push('/personas');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  }

  const persona = q.data;

  return (
    <PageLayout
      backHref="/personas"
      title={persona?.name ?? 'Persona'}
      description={persona?.description ?? 'Loading...'}
      actions={
        persona ? (
          <Button size="sm" variant="outline" onClick={() => setDeleteOpen(true)} data-testid="delete-persona-button">
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </Button>
        ) : undefined
      }
    >
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
        <div className="max-w-2xl space-y-6">
          {/* Identity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 mb-2">
                <BeautifulAvatar name={persona.name} platform="persona" size="lg" />
                <div className="flex-1 space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} data-testid="persona-name" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description..." />
              </div>
            </CardContent>
          </Card>

          {/* Traits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Traits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Emotion</Label>
                  <Select value={emotion} onValueChange={setEmotion}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMOTIONS.map((e) => <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cooperation</Label>
                  <Select value={cooperationLevel} onValueChange={setCooperationLevel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COOPERATION_LEVELS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Patience</Label>
                  <Select value={patience} onValueChange={setPatience}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PATIENCE_LEVELS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Speech Style</Label>
                  <Select value={speechStyle} onValueChange={setSpeechStyle}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SPEECH_STYLES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Intent Clarity</Label>
                  <Select value={intentClarity} onValueChange={setIntentClarity}>
                    <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INTENT_CLARITY.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Backstory */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Backstory</CardTitle>
              <p className="text-sm text-muted-foreground">Additional context about this persona's situation</p>
            </CardHeader>
            <CardContent>
              <Textarea
                value={backstory}
                onChange={(e) => setBackstory(e.target.value)}
                placeholder="e.g. Long-time customer who recently experienced a service outage..."
                className="min-h-[100px] resize-none"
                data-testid="persona-backstory"
              />
            </CardContent>
          </Card>

          {/* Custom Attributes */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-medium">Custom Attributes</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Key-value pairs injected into scenario prompts as {'{{persona.<key>}}'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const key = `attribute_${Object.keys(variables).length + 1}`;
                    setVariables((prev) => ({ ...prev, [key]: '' }));
                  }}
                  data-testid="add-attribute"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {Object.keys(variables).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No custom attributes. Add product details, order IDs, or other context.
                </p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(variables).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2">
                      <div className="flex-1 space-y-1">
                        <Input
                          value={key}
                          onChange={(e) => {
                            const newKey = e.target.value;
                            setVariables((prev) => {
                              const next = { ...prev };
                              delete next[key];
                              next[newKey] = value;
                              return next;
                            });
                          }}
                          placeholder="key (e.g. product_name)"
                          className="h-8 text-sm font-mono"
                          data-testid={`attr-key-${key}`}
                        />
                      </div>
                      <div className="flex-[2] space-y-1">
                        <Input
                          value={value}
                          onChange={(e) =>
                            setVariables((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          placeholder="value (e.g. MacBook Pro 16)"
                          className="h-8 text-sm"
                          data-testid={`attr-value-${key}`}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setVariables((prev) => {
                            const next = { ...prev };
                            delete next[key];
                            return next;
                          })
                        }
                        data-testid={`attr-delete-${key}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex justify-end">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="save-persona">
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      ) : null}

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityType="Persona"
        entityName={persona?.name}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </PageLayout>
  );
}
