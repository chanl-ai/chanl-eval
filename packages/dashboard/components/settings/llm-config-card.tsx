'use client';

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
import { MODEL_OPTIONS, type ModelOption } from '@/lib/model-options';
import type { AdapterType } from '@/lib/eval-config';

interface LlmConfigCardProps {
  title: string;
  description: string;
  // Provider
  provider?: AdapterType;
  onProviderChange?: (v: AdapterType) => void;
  showProvider?: boolean;
  // Model
  model: string;
  onModelChange: (v: string) => void;
  modelPlaceholder?: string;
  modelHint?: string;
  // API Key
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  apiKeyPlaceholder?: string;
  apiKeyHint?: string;
  // Base URL
  baseUrl?: string;
  onBaseUrlChange?: (v: string) => void;
  baseUrlPlaceholder?: string;
  baseUrlHint?: string;
  showBaseUrl?: boolean;
}

export function LlmConfigCard({
  title,
  description,
  provider = 'openai',
  onProviderChange,
  showProvider = true,
  model,
  onModelChange,
  modelPlaceholder = 'gpt-4o-mini',
  modelHint = 'Select a preset or type any model ID.',
  apiKey,
  onApiKeyChange,
  apiKeyPlaceholder = 'sk-...',
  apiKeyHint = 'Stays in your browser, never stored on the server.',
  baseUrl,
  onBaseUrlChange,
  baseUrlPlaceholder,
  baseUrlHint,
  showBaseUrl = false,
}: LlmConfigCardProps) {
  const models = MODEL_OPTIONS[provider] ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Provider */}
          {showProvider && onProviderChange && (
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => onProviderChange(v as AdapterType)}>
                <SelectTrigger data-testid={`${title.toLowerCase().replace(/\s/g, '-')}-provider`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="http">Custom HTTP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Model */}
          <div className={`space-y-2 ${!showProvider ? 'sm:col-span-2' : ''}`}>
            <Label>Model</Label>
            {models.length > 1 ? (
              <>
                <Select
                  value={models.some((m) => m.value === model) ? model : '_custom'}
                  onValueChange={(v) => { if (v !== '_custom') onModelChange(v); }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m: ModelOption) => (
                      <SelectItem key={m.value} value={m.value}>
                        <span>{m.label}</span>
                        {m.description && (
                          <span className="ml-2 text-muted-foreground text-xs">{m.description}</span>
                        )}
                      </SelectItem>
                    ))}
                    <SelectItem value="_custom">Custom model ID...</SelectItem>
                  </SelectContent>
                </Select>
                {!models.some((m) => m.value === model) && (
                  <Input
                    value={model}
                    onChange={(e) => onModelChange(e.target.value)}
                    placeholder={modelPlaceholder}
                    className="mt-2"
                  />
                )}
              </>
            ) : (
              <Input
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                placeholder={modelPlaceholder}
              />
            )}
            <p className="text-[11px] text-muted-foreground">{modelHint}</p>
          </div>
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <Label>API Key</Label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={apiKeyPlaceholder}
            autoComplete="off"
          />
          <p className="text-[11px] text-muted-foreground">{apiKeyHint}</p>
        </div>

        {/* Base URL */}
        {showBaseUrl && onBaseUrlChange && (
          <div className="space-y-2">
            <Label>
              Base URL <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              value={baseUrl ?? ''}
              onChange={(e) => onBaseUrlChange(e.target.value)}
              placeholder={baseUrlPlaceholder ?? 'Leave empty for default provider URL'}
              autoComplete="off"
            />
            {baseUrlHint && (
              <p className="text-[11px] text-muted-foreground">{baseUrlHint}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
