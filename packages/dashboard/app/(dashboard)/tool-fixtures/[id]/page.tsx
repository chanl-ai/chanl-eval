'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Plus, Shield, Trash2, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { DeleteDialog } from '@/components/shared/delete-dialog';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig } from '@/lib/eval-config';
import { toast } from 'sonner';

interface MockResponse {
  when?: Record<string, any>;
  isDefault?: boolean;
  return: any;
  description?: string;
}

function formatJson(value: any): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function parseJson(text: string): { valid: boolean; value: any } {
  if (!text.trim()) return { valid: true, value: undefined };
  try {
    return { valid: true, value: JSON.parse(text) };
  } catch {
    return { valid: false, value: undefined };
  }
}

/** Extract parameter names/types from a JSON Schema for the preview. */
function getSchemaFields(schema: Record<string, any> | undefined): Array<{ name: string; type: string; required: boolean }> {
  if (!schema || !schema.properties) return [];
  const required = new Set<string>(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, prop]: [string, any]) => ({
    name,
    type: prop.type ?? 'any',
    required: required.has(name),
  }));
}

export default function ToolFixtureDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const qc = useQueryClient();
  const { client } = useEvalConfig();

  const q = useQuery({
    queryKey: ['tool-fixture', id],
    queryFn: () => client.toolFixtures.get(id),
    enabled: !!id,
  });

  // --- Form state ---
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [isActive, setIsActive] = useState('true');
  const [parametersText, setParametersText] = useState('');
  const [parametersError, setParametersError] = useState('');
  const [mockResponses, setMockResponses] = useState<MockResponse[]>([]);

  // --- Delete state ---
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // --- Add mock response state ---
  const [addingMock, setAddingMock] = useState(false);
  const [newMockWhen, setNewMockWhen] = useState('');
  const [newMockReturn, setNewMockReturn] = useState('{\n  \n}');
  const [newMockDescription, setNewMockDescription] = useState('');
  const [newMockIsDefault, setNewMockIsDefault] = useState(false);

  // Hydrate form from fetched data
  useEffect(() => {
    if (q.data) {
      setName(q.data.name);
      setDescription(q.data.description ?? '');
      setTags((q.data.tags ?? []).join(', '));
      setIsActive(q.data.isActive ? 'true' : 'false');
      setParametersText(q.data.parameters ? formatJson(q.data.parameters) : '');
      setParametersError('');
      setMockResponses(q.data.mockResponses ?? []);
    }
  }, [q.data]);

  // Validate parameters JSON on change
  useEffect(() => {
    if (!parametersText.trim()) {
      setParametersError('');
      return;
    }
    const { valid } = parseJson(parametersText);
    setParametersError(valid ? '' : 'Invalid JSON');
  }, [parametersText]);

  // --- Save ---
  const saveMutation = useMutation({
    mutationFn: async () => {
      const paramsParsed = parseJson(parametersText);
      if (!paramsParsed.valid) throw new Error('Parameters JSON is invalid');

      await client.toolFixtures.update(id, {
        name,
        description: description || undefined,
        tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        isActive: isActive === 'true',
        parameters: paramsParsed.value,
        mockResponses,
      });
    },
    onSuccess: () => {
      toast.success('Tool fixture saved');
      void qc.invalidateQueries({ queryKey: ['tool-fixture', id] });
      void qc.invalidateQueries({ queryKey: ['tool-fixtures'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // --- Delete ---
  async function handleDelete() {
    setIsDeleting(true);
    try {
      await client.toolFixtures.remove(id);
      toast.success('Tool fixture deleted');
      void qc.invalidateQueries({ queryKey: ['tool-fixtures'] });
      router.push('/tool-fixtures');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  }

  // --- Mock response helpers ---
  function handleAddMock() {
    const whenParsed = parseJson(newMockWhen);
    const returnParsed = parseJson(newMockReturn);

    if (newMockWhen.trim() && !whenParsed.valid) {
      toast.error('Invalid JSON in "When" conditions');
      return;
    }
    if (!returnParsed.valid || returnParsed.value === undefined) {
      toast.error('Invalid or empty JSON in "Return" value');
      return;
    }

    const newRule: MockResponse = {
      return: returnParsed.value,
    };
    if (whenParsed.value) newRule.when = whenParsed.value;
    if (newMockDescription.trim()) newRule.description = newMockDescription.trim();
    if (newMockIsDefault) newRule.isDefault = true;

    setMockResponses([...mockResponses, newRule]);
    setNewMockWhen('');
    setNewMockReturn('{\n  \n}');
    setNewMockDescription('');
    setNewMockIsDefault(false);
    setAddingMock(false);
  }

  function handleRemoveMock(index: number) {
    setMockResponses(mockResponses.filter((_, i) => i !== index));
  }

  function handleToggleDefault(index: number) {
    setMockResponses(
      mockResponses.map((m, i) => ({
        ...m,
        isDefault: i === index ? !m.isDefault : false,
      })),
    );
  }

  // Schema preview
  const schemaFields = getSchemaFields(parseJson(parametersText).value);

  return (
    <PageLayout
      backHref="/tool-fixtures"
      title={q.data?.name ?? 'Tool Fixture'}
      description={q.data?.description ?? 'Loading...'}
      actions={
        q.data ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !!parametersError}
              data-testid="save-tool-fixture"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeleteOpen(true)} data-testid="delete-tool-fixture-button">
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : q.isError ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-destructive text-sm">{(q.error as Error).message}</p>
          </CardContent>
        </Card>
      ) : q.data ? (
        <div className="max-w-3xl space-y-6">
          {/* Section 1: Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="tool-fixture-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={isActive} onValueChange={setIsActive}>
                    <SelectTrigger data-testid="tool-fixture-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Inactive</SelectItem>
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
                  placeholder="Describe what this tool does (shown to the LLM)..."
                  rows={3}
                  data-testid="tool-fixture-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="e.g. billing, orders, crm"
                  data-testid="tool-fixture-tags"
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Parameters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">Parameters (JSON Schema)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={parametersText}
                onChange={(e) => setParametersText(e.target.value)}
                placeholder={`{
  "type": "object",
  "properties": {
    "order_id": { "type": "string", "description": "The order ID to look up" }
  },
  "required": ["order_id"]
}`}
                className="font-mono text-sm min-h-[160px]"
                rows={10}
                data-testid="tool-fixture-parameters"
              />
              {parametersError && (
                <p className="text-xs text-destructive">{parametersError}</p>
              )}

              {/* Parameter preview */}
              {schemaFields.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Parameter Preview
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {schemaFields.map((f) => (
                      <div
                        key={f.name}
                        className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs"
                      >
                        <span className="font-medium">{f.name}</span>
                        <span className="text-muted-foreground">{f.type}</span>
                        {f.required && (
                          <Badge variant="default" className="text-[9px] px-1 py-0 leading-tight">
                            required
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Mock Responses */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">
                  Mock Responses ({mockResponses.length})
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddingMock(true)}
                  disabled={addingMock}
                  data-testid="add-mock-response-button"
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Add Rule
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {mockResponses.length === 0 && !addingMock && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No mock responses defined. Add a rule to control what this tool returns during testing.
                </p>
              )}

              {/* Existing mock responses */}
              {mockResponses.map((mock, index) => (
                <div
                  key={index}
                  className="rounded-lg border p-4 space-y-3"
                  data-testid={`mock-response-${index}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {mock.isDefault ? (
                        <Badge variant="default" className="text-[10px]">
                          <Shield className="mr-1 h-3 w-3" />
                          Default
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] cursor-pointer hover:bg-muted transition-colors"
                          onClick={() => handleToggleDefault(index)}
                          data-testid={`mock-set-default-${index}`}
                        >
                          Set as default
                        </Badge>
                      )}
                      {mock.description && (
                        <span className="text-xs text-muted-foreground">{mock.description}</span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveMock(index)}
                      data-testid={`mock-delete-${index}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {mock.when && Object.keys(mock.when).length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        When
                      </p>
                      <pre className="text-xs font-mono bg-muted rounded-md p-2 overflow-x-auto">
                        {formatJson(mock.when)}
                      </pre>
                    </div>
                  )}

                  <div className="space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Return
                    </p>
                    <pre className="text-xs font-mono bg-muted rounded-md p-2 overflow-x-auto">
                      {formatJson(mock.return)}
                    </pre>
                  </div>
                </div>
              ))}

              {/* Add new mock response form */}
              {addingMock && (
                <div className="rounded-lg border border-dashed p-4 space-y-3" data-testid="add-mock-form">
                  <p className="text-sm font-medium">New Mock Response Rule</p>

                  <div className="space-y-2">
                    <Label className="text-xs">Description (optional)</Label>
                    <Input
                      value={newMockDescription}
                      onChange={(e) => setNewMockDescription(e.target.value)}
                      placeholder="e.g. Returns order found response"
                      data-testid="new-mock-description"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">When (conditions, optional JSON)</Label>
                    <Textarea
                      value={newMockWhen}
                      onChange={(e) => setNewMockWhen(e.target.value)}
                      placeholder='{ "order_id": "ORD-123" }'
                      className="font-mono text-sm min-h-[60px]"
                      rows={3}
                      data-testid="new-mock-when"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">
                      Return (JSON) <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      value={newMockReturn}
                      onChange={(e) => setNewMockReturn(e.target.value)}
                      placeholder='{ "status": "found", "order": { ... } }'
                      className="font-mono text-sm min-h-[80px]"
                      rows={4}
                      data-testid="new-mock-return"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="new-mock-default"
                      checked={newMockIsDefault}
                      onChange={(e) => setNewMockIsDefault(e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                      data-testid="new-mock-is-default"
                    />
                    <Label htmlFor="new-mock-default" className="text-xs cursor-pointer">
                      Set as default response
                    </Label>
                  </div>

                  <Separator />

                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAddingMock(false);
                        setNewMockWhen('');
                        setNewMockReturn('{\n  \n}');
                        setNewMockDescription('');
                        setNewMockIsDefault(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddMock}
                      data-testid="confirm-add-mock"
                    >
                      <Plus className="mr-2 h-3.5 w-3.5" />
                      Add Rule
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityType="Tool Fixture"
        entityName={q.data?.name}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </PageLayout>
  );
}
