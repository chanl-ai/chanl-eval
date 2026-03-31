'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEvalConfig, type AdapterType } from '@/lib/eval-config';
import { EvalClient } from '@chanl/eval-sdk';
import { toast } from 'sonner';

export default function SettingsPage() {
  const {
    baseUrl,
    setBaseUrl,
    apiKey,
    setApiKey,
    adapterType,
    setAdapterType,
    agentApiKey,
    setAgentApiKey,
  } = useEvalConfig();

  async function testConnection() {
    try {
      const c = new EvalClient({ baseUrl, apiKey });
      const h = await c.health();
      toast.success(`Connected: ${h.status} (v${h.version})`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Connection failed');
    }
  }

  function saveRunSettings() {
    toast.success('Run settings saved');
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <Card>
          <CardHeader>
            <CardTitle>chanl-eval server</CardTitle>
            <CardDescription>
              Same REST API as the CLI. On first server boot, copy the API key from the server log
              if none exists yet — or set <code className="text-xs">NEXT_PUBLIC_CHANL_EVAL_API_KEY</code> in{' '}
              <code className="text-xs">packages/dashboard/.env.local</code> (see{' '}
              <code className="text-xs">.env.example</code>).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="baseUrl">Server URL</Label>
              <Input
                id="baseUrl"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:18005"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">X-API-Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste bootstrap key"
                autoComplete="off"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={testConnection}>
                Test connection
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scenario runs (agent under test)</CardTitle>
            <CardDescription>
              Provider and API key for the adapter that talks to your agent (OpenAI or Anthropic).
              Used when you click Run on a scenario.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Adapter</Label>
              <Select
                value={adapterType}
                onValueChange={(v) => setAdapterType(v as AdapterType)}
              >
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agentKey">Agent API key</Label>
              <Input
                id="agentKey"
                type="password"
                value={agentApiKey}
                onChange={(e) => setAgentApiKey(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
              />
            </div>
            <Button type="button" variant="outline" onClick={saveRunSettings}>
              Save run settings
            </Button>
          </CardContent>
        </Card>

        <p className="text-muted-foreground text-sm">
          API docs:{' '}
          <a
            className="text-primary underline-offset-4 hover:underline"
            href={`${baseUrl.replace(/\/$/, '')}/api/docs`}
            target="_blank"
            rel="noreferrer"
          >
            {baseUrl.replace(/\/$/, '')}/api/docs
          </a>
        </p>
      </div>
    </>
  );
}
