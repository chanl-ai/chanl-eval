'use client';

import { useState } from 'react';
import { CheckCircle, ExternalLink, Loader2, Settings, XCircle } from 'lucide-react';
import { toast } from 'sonner';

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
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig, type AdapterType } from '@/lib/eval-config';
import { EvalClient } from '@chanl/eval-sdk';

export default function SettingsPage() {
  const {
    baseUrl, setBaseUrl,
    apiKey, setApiKey,
    adapterType, setAdapterType,
    agentApiKey, setAgentApiKey,
  } = useEvalConfig();

  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  async function testConnection() {
    setIsTesting(true);
    setConnectionStatus('idle');
    try {
      const c = new EvalClient({ baseUrl, apiKey });
      const h = await c.health();
      setConnectionStatus('success');
      toast.success(`Connected: ${h.status} (v${h.version})`);
    } catch (e: unknown) {
      setConnectionStatus('error');
      toast.error(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setIsTesting(false);
    }
  }

  const docsUrl = `${baseUrl.replace(/\/api\/v1$/, '').replace(/\/$/, '')}/api/docs`;

  return (
    <PageLayout
      icon={Settings}
      title="Settings"
      description="Configure your eval server connection and agent credentials"
    >
      <div className="space-y-6 max-w-2xl">
        {/* Server Connection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Server Connection</CardTitle>
            <p className="text-sm text-muted-foreground">
              The chanl-eval server that stores scenarios, personas, and test results.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="baseUrl">Server URL</Label>
              <Input
                id="baseUrl"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:18005/api/v1"
                autoComplete="off"
                data-testid="server-url"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">
                API Key <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Leave empty for local development"
                autoComplete="off"
                data-testid="api-key"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={testConnection}
                disabled={isTesting}
                data-testid="test-connection"
              >
                {isTesting ? (
                  <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Testing...</>
                ) : (
                  'Test Connection'
                )}
              </Button>
              {connectionStatus === 'success' && (
                <span className="flex items-center gap-1.5 text-sm text-success">
                  <CheckCircle className="h-4 w-4" />Connected
                </span>
              )}
              {connectionStatus === 'error' && (
                <span className="flex items-center gap-1.5 text-sm text-destructive">
                  <XCircle className="h-4 w-4" />Failed
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Agent Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Agent Under Test</CardTitle>
            <p className="text-sm text-muted-foreground">
              Provider and API key for the LLM that powers your agent during playground tests.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Adapter</Label>
              <Select value={adapterType} onValueChange={(v) => setAdapterType(v as AdapterType)}>
                <SelectTrigger className="w-full max-w-xs" data-testid="adapter-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agentKey">Agent API Key</Label>
              <Input
                id="agentKey"
                type="password"
                value={agentApiKey}
                onChange={(e) => setAgentApiKey(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                data-testid="agent-api-key"
              />
              <p className="text-[11px] text-muted-foreground">
                Stays in your browser. Sent directly to the LLM provider, never stored on the eval server.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* API Docs */}
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium">API Documentation</p>
              <p className="text-xs text-muted-foreground">Swagger UI for the eval server REST API</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <a href={docsUrl} target="_blank" rel="noreferrer">
                Open Docs
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
