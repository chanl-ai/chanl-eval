'use client';

import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ArgOp = 'equals' | 'contains' | 'regex';

export interface ToolCheckState {
  tool: string;
  mode: 'called' | 'never_called';
  args: Array<{ name: string; op: ArgOp; value: string }>;
  first: string;
  then: string;
  requireFirstSuccess: boolean;
}

export const EMPTY_TOOL_CHECK: ToolCheckState = {
  tool: '', mode: 'called', args: [], first: '', then: '', requireFirstSuccess: true,
};

/** Reads saved settings. Older criteria stored the tool under `toolName`; the handler reads `expectedTool`. */
export function toolCheckFromSettings(s: Record<string, unknown>): ToolCheckState {
  const expected = s.expectedTool ?? s.toolName ?? '';
  const args = (s.expectedArgs ?? {}) as Record<string, { op?: ArgOp; value?: unknown }>;
  return {
    tool: Array.isArray(expected) ? expected.join(', ') : String(expected),
    mode: s.mode === 'never_called' ? 'never_called' : 'called',
    args: Object.entries(args).map(([name, a]) => ({ name, op: a.op ?? 'equals', value: String(a.value ?? '') })),
    first: String(s.first ?? ''),
    then: String(s.then ?? ''),
    requireFirstSuccess: s.requireFirstSuccess === true,
  };
}

export function toolCallSettings(t: ToolCheckState): Record<string, unknown> {
  const tools = t.tool.split(',').map((x) => x.trim()).filter(Boolean);
  const expectedArgs = Object.fromEntries(
    t.args.filter((a) => a.name.trim()).map((a) => [a.name.trim(), { op: a.op, value: a.value }]),
  );
  return {
    expectedTool: tools.length > 1 ? tools : (tools[0] ?? ''),
    mode: t.mode,
    ...(t.mode === 'called' && Object.keys(expectedArgs).length > 0 ? { expectedArgs } : {}),
  };
}

export function toolOrderSettings(t: ToolCheckState): Record<string, unknown> {
  return { first: t.first.trim(), then: t.then.trim(), requireFirstSuccess: t.requireFirstSuccess };
}

/** A pick list of the seat's mock tools; free text only when there are none to pick from. */
function ToolNameField({ id, value, onChange, toolNames, placeholder, testId }: {
  id: string; value: string; onChange: (v: string) => void; toolNames?: string[]; placeholder: string; testId: string;
}) {
  if (!toolNames?.length) {
    return <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid={testId} />;
  }
  const options = value && !toolNames.includes(value) ? [value, ...toolNames] : toolNames;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full" data-testid={testId}><SelectValue placeholder="Choose a mock tool" /></SelectTrigger>
      <SelectContent>
        {options.map((n) => <SelectItem key={n} value={n} className="font-mono">{n}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function ToolCallFields({ value, onChange, toolNames }: { value: ToolCheckState; onChange: (v: ToolCheckState) => void; toolNames?: string[] }) {
  const set = (patch: Partial<ToolCheckState>) => onChange({ ...value, ...patch });
  const setArg = (i: number, patch: Partial<ToolCheckState['args'][number]>) =>
    set({ args: value.args.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="tool-name">Tool name</Label>
          <ToolNameField id="tool-name" value={value.tool} onChange={(v) => set({ tool: v })} toolNames={toolNames}
            placeholder="e.g. lookup_order" testId="tool-name" />
        </div>
        <div className="space-y-2">
          <Label>Passes when the tool is</Label>
          <Select value={value.mode} onValueChange={(v) => set({ mode: v as ToolCheckState['mode'] })}>
            <SelectTrigger data-testid="tool-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="called">Called</SelectItem>
              <SelectItem value="never_called">Never called</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {value.mode === 'called' && (
        <div className="space-y-2">
          <Label>Expected arguments <span className="text-muted-foreground font-normal">(optional)</span></Label>
          {value.args.map((a, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_8rem_1fr_auto] gap-2" data-testid="tool-arg-row">
              <Input aria-label="Argument" value={a.name} onChange={(e) => setArg(i, { name: e.target.value })} placeholder="argument, e.g. order_id" className="sm:col-auto" />
              <Button type="button" variant="ghost" size="icon" aria-label="Remove argument" className="sm:order-last"
                onClick={() => set({ args: value.args.filter((_, j) => j !== i) })}>
                <X className="h-4 w-4" />
              </Button>
              <Select value={a.op} onValueChange={(v) => setArg(i, { op: v as ArgOp })}>
                <SelectTrigger aria-label="Match"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">equals</SelectItem>
                  <SelectItem value="contains">contains</SelectItem>
                  <SelectItem value="regex">matches regex</SelectItem>
                </SelectContent>
              </Select>
              <Input aria-label="Value" value={a.value} onChange={(e) => setArg(i, { value: e.target.value })} placeholder="value" />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" data-testid="add-tool-arg"
            onClick={() => set({ args: [...value.args, { name: '', op: 'equals', value: '' }] })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add argument
          </Button>
          <p className="text-xs text-muted-foreground">
            A call only counts when every listed argument matches. A run with no tool calls fails this check.
          </p>
        </div>
      )}
      {value.mode === 'never_called' && (
        <p className="text-xs text-muted-foreground">Passes only if the agent never calls this tool, for example a refund tool on an out-of-policy request.</p>
      )}
    </div>
  );
}

export function ToolOrderFields({ value, onChange, toolNames }: { value: ToolCheckState; onChange: (v: ToolCheckState) => void; toolNames?: string[] }) {
  const set = (patch: Partial<ToolCheckState>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="tool-first">First</Label>
          <ToolNameField id="tool-first" value={value.first} onChange={(v) => set({ first: v })} toolNames={toolNames} placeholder="e.g. match_po" testId="tool-first" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tool-then">Then</Label>
          <ToolNameField id="tool-then" value={value.then} onChange={(v) => set({ then: v })} toolNames={toolNames} placeholder="e.g. approve_payment" testId="tool-then" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={value.requireFirstSuccess} onCheckedChange={(c) => set({ requireFirstSuccess: c === true })} />
        Also fail when the first call returned an error or a mismatch
      </label>
      <p className="text-xs text-muted-foreground">Fails when the second tool is called before the first, or without it. The evidence lists the actual call order.</p>
    </div>
  );
}
