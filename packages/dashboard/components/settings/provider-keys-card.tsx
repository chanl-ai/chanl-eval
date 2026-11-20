'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEvalConfig } from '@/lib/eval-config';
import type { KeySource } from '@chanl/eval-sdk';

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', envVar: 'CHANL_OPENAI_API_KEY', placeholder: 'sk-...' },
  { id: 'anthropic', label: 'Anthropic', envVar: 'CHANL_ANTHROPIC_API_KEY', placeholder: 'sk-ant-...' },
] as const;

/**
 * Provider API keys, stored on the SERVER.
 *
 * The engine resolves keys from the settings document (or environment variables) at run time — it
 * never sees anything the browser keeps to itself. A previous version of this page wrote keys to
 * localStorage only, so a key entered here never reached a run and the Docker quickstart had no
 * working path at all.
 */
export function ProviderKeysCard({
  onStatusChange,
}: {
  onStatusChange?: (hasAnyKey: boolean) => void;
}) {
  const { client } = useEvalConfig();

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [masked, setMasked] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Record<string, KeySource>>({});
  const [simulationBaseUrl, setSimulationBaseUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const status = await client.settings.status();
      setMasked((status.settings?.providerKeys ?? {}) as Record<string, string>);
      setSources(status.keySources ?? {});
      setSimulationBaseUrl(status.settings?.simulationBaseUrl ?? '');
      setLoadError(null);
      onStatusChange?.(status.hasAnyKey);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Could not reach the eval server');
    } finally {
      setLoading(false);
    }
  }, [client, onStatusChange]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      // Send only fields the user actually typed. Sending the masked value back would overwrite the
      // real key with bullets (the server also rejects masked values, belt and braces).
      const providerKeys: Record<string, string> = {};
      for (const p of PROVIDERS) {
        const draft = drafts[p.id];
        if (draft !== undefined && draft.trim() !== '') providerKeys[p.id] = draft.trim();
      }

      await client.settings.update({
        ...(Object.keys(providerKeys).length > 0 ? { providerKeys } : {}),
        simulationBaseUrl: simulationBaseUrl.trim(),
      });

      setDrafts({});
      await load();
      toast.success('Saved to the eval server. Runs will use these credentials.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">LLM provider keys</CardTitle>
        <p className="text-sm text-muted-foreground">
          Stored on the eval server and used by every run — the agent under test, the persona
          simulator, and the LLM judge. At least one is required before a scenario can run.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-destructive">Could not load server settings</p>
              <p className="text-muted-foreground">{loadError}</p>
            </div>
          </div>
        )}

        {PROVIDERS.map((p) => {
          const source = sources[p.id] ?? null;
          return (
            <div key={p.id} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`key-${p.id}`}>{p.label} API key</Label>
                <KeyStatus source={source} maskedValue={masked[p.id]} envVar={p.envVar} />
              </div>
              <Input
                id={`key-${p.id}`}
                type="password"
                value={drafts[p.id] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                placeholder={source ? 'Enter a new key to replace the current one' : p.placeholder}
                autoComplete="off"
                disabled={loading}
                data-testid={`provider-key-${p.id}`}
              />
              <p className="text-[11px] text-muted-foreground">
                Or set <code>{p.envVar}</code> on the server (takes effect on restart).
              </p>
            </div>
          );
        })}

        <div className="space-y-2 border-t pt-4">
          <Label htmlFor="simulation-base-url">
            Simulation base URL{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="simulation-base-url"
            value={simulationBaseUrl}
            onChange={(e) => setSimulationBaseUrl(e.target.value)}
            placeholder="http://localhost:11434/v1"
            autoComplete="off"
            disabled={loading}
            data-testid="simulation-base-url"
          />
          <p className="text-[11px] text-muted-foreground">
            Point the persona simulator and LLM judge at any OpenAI-compatible endpoint (Ollama,
            OpenRouter, vLLM, Azure) to cut the cost of a full suite. Leave empty to use the
            provider&apos;s own host.
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={save}
            disabled={saving || loading}
            data-testid="save-provider-keys"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              'Save to server'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function KeyStatus({
  source,
  maskedValue,
  envVar,
}: {
  source: KeySource;
  maskedValue?: string;
  envVar: string;
}) {
  if (source === 'settings') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        Saved {maskedValue ? `(${maskedValue})` : ''}
      </span>
    );
  }
  if (source === 'env') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        From <code>{envVar}</code>
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">Not configured</span>;
}
