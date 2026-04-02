'use client';

import { useState } from 'react';
import { CheckCircle, ExternalLink, Loader2, Settings, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLayout } from '@/components/shared/page-layout';
import { useEvalConfig } from '@/lib/eval-config';
import { EvalClient } from '@chanl/eval-sdk';

export default function SettingsPage() {
  const {
    baseUrl, setBaseUrl,
    apiKey, setApiKey,
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
      description="Configure your eval server connection and LLM credentials"
    >
      <div className="space-y-6 max-w-2xl">
        {/* Server Connection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Eval Server</CardTitle>
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
              <p className="text-[11px] text-muted-foreground">
                Full API base URL including /api/v1 suffix.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">
                Server API Key <span className="text-muted-foreground font-normal">(optional)</span>
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
              <p className="text-[11px] text-muted-foreground">
                Only needed when CHANL_EVAL_REQUIRE_API_KEY is enabled on the server.
              </p>
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

        {/* LLM Keys — server-side */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">LLM API Keys</CardTitle>
            <p className="text-sm text-muted-foreground">
              Agent, persona, and judge API keys are resolved server-side from environment variables.
              Set <code className="text-xs bg-muted px-1 py-0.5 rounded">CHANL_OPENAI_API_KEY</code> or{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">CHANL_ANTHROPIC_API_KEY</code> on the eval server.
            </p>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Agent model and provider are configured per Prompt (in the Playground).
              The server resolves the API key automatically — no client-side keys needed.
            </p>
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
