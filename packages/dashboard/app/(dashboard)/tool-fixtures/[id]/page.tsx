'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ChevronDown, Code2, Plus, Shield, Trash2 } from 'lucide-react';
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


// ---------------------------------------------------------------------------
// Parameter Builder — replaces raw JSON Schema textarea
// ---------------------------------------------------------------------------

interface ParamField {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

function schemaToFields(schema: Record<string, any> | undefined): ParamField[] {
  if (!schema?.properties) return [];
  const req = new Set<string>(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, prop]: [string, any]) => ({
    name,
    type: prop.type ?? 'string',
    description: prop.description ?? '',
    required: req.has(name),
  }));
}

function fieldsToSchema(fields: ParamField[]): Record<string, any> | undefined {
  if (fields.length === 0) return undefined;
  const properties: Record<string, any> = {};
  const required: string[] = [];
  for (const f of fields) {
    properties[f.name] = { type: f.type };
    if (f.description) properties[f.name].description = f.description;
    if (f.required) required.push(f.name);
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

function ParameterBuilder({
  fields,
  onChange,
}: {
  fields: ParamField[];
  onChange: (fields: ParamField[]) => void;
}) {
  const updateField = (index: number, key: keyof ParamField, value: string | boolean) => {
    const next = [...fields];
    next[index] = { ...next[index], [key]: value };
    onChange(next);
  };
  const removeField = (index: number) => onChange(fields.filter((_, i) => i !== index));
  const addField = () => onChange([...fields, { name: '', type: 'string', description: '', required: false }]);

  return (
    <div className="space-y-3">
      {fields.map((f, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-start" data-testid={`param-field-${i}`}>
          <div className="col-span-3 space-y-1">
            <Input
              value={f.name}
              onChange={(e) => updateField(i, 'name', e.target.value)}
              placeholder="name"
              className="text-sm"
              data-testid={`param-name-${i}`}
            />
          </div>
          <div className="col-span-2">
            <Select value={f.type} onValueChange={(v) => updateField(i, 'type', v)}>
              <SelectTrigger className="text-sm" data-testid={`param-type-${i}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">string</SelectItem>
                <SelectItem value="number">number</SelectItem>
                <SelectItem value="boolean">boolean</SelectItem>
                <SelectItem value="object">object</SelectItem>
                <SelectItem value="array">array</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-5">
            <Input
              value={f.description}
              onChange={(e) => updateField(i, 'description', e.target.value)}
              placeholder="description"
              className="text-sm"
              data-testid={`param-desc-${i}`}
            />
          </div>
          <div className="col-span-1 flex items-center justify-center pt-1.5">
            <input
              type="checkbox"
              checked={f.required}
              onChange={(e) => updateField(i, 'required', e.target.checked)}
              className="h-4 w-4 rounded border-input"
              title="Required"
              data-testid={`param-required-${i}`}
            />
          </div>
          <div className="col-span-1 flex items-center justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeField(i)}
              data-testid={`param-remove-${i}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
      {fields.length > 0 && (
        <div className="grid grid-cols-12 gap-2 text-[10px] text-muted-foreground uppercase tracking-wider -mt-1 px-0.5">
          <div className="col-span-3">Name</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-5">Description</div>
          <div className="col-span-1 text-center">Req</div>
          <div className="col-span-1" />
        </div>
      )}
      <Button size="sm" variant="outline" onClick={addField} data-testid="add-parameter">
        <Plus className="mr-2 h-3.5 w-3.5" />
        Add Parameter
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible JSON — hides raw JSON behind toggle
// ---------------------------------------------------------------------------

function CollapsibleJson({ label, value }: { label: string; value: any }) {
  const [open, setOpen] = useState(false);
  if (value == null || (typeof value === 'object' && Object.keys(value).length === 0)) return null;

  // Show key-value preview pills
  const entries = typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value)
    : [];

  return (
    <div className="space-y-1">
      <div
        className="flex items-center gap-1.5 cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {!open && entries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entries.map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono">
              <span className="text-muted-foreground">{k}:</span>
              <span className="truncate max-w-[120px]">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
            </span>
          ))}
        </div>
      )}
      {open && (
        <pre className="text-xs font-mono bg-muted rounded-md p-2 overflow-x-auto">
          {formatJson(value)}
        </pre>
      )}
    </div>
  );
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
  const [paramFields, setParamFields] = useState<ParamField[]>([]);
  const [showRawJson, setShowRawJson] = useState(false);
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
      setParamFields(schemaToFields(q.data.parameters));
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
      // Use visual builder fields as source of truth (unless raw JSON mode)
      const parameters = showRawJson
        ? (() => { const p = parseJson(parametersText); if (!p.valid) throw new Error('Parameters JSON is invalid'); return p.value; })()
        : fieldsToSchema(paramFields);

      await client.toolFixtures.update(id, {
        name,
        description: description || undefined,
        tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        isActive: isActive === 'true',
        parameters,
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
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">Parameters</CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs gap-1.5"
                  onClick={() => {
                    if (!showRawJson) {
                      // Sync fields → JSON
                      const schema = fieldsToSchema(paramFields);
                      setParametersText(schema ? formatJson(schema) : '');
                    } else {
                      // Sync JSON → fields
                      const parsed = parseJson(parametersText);
                      if (parsed.valid && parsed.value) setParamFields(schemaToFields(parsed.value));
                    }
                    setShowRawJson(!showRawJson);
                  }}
                  data-testid="toggle-raw-json"
                >
                  <Code2 className="h-3.5 w-3.5" />
                  {showRawJson ? 'Visual Editor' : 'Raw JSON'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {showRawJson ? (
                <>
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
                </>
              ) : (
                <ParameterBuilder
                  fields={paramFields}
                  onChange={setParamFields}
                />
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

                  <CollapsibleJson label="When" value={mock.when} />
                  <CollapsibleJson label="Return" value={mock.return} />
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
