'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import type { GenerateOptions } from '@chanl/eval-sdk';

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

interface GenerateFormProps {
  onGenerate: (options: GenerateOptions) => void;
  isLoading: boolean;
  /** Pre-fill the form (used when "Regenerate" is clicked) */
  initialValues?: Partial<GenerateOptions>;
}

export function GenerateForm({ onGenerate, isLoading, initialValues }: GenerateFormProps) {
  const [systemPrompt, setSystemPrompt] = useState(initialValues?.systemPrompt ?? '');
  const [count, setCount] = useState(initialValues?.count ?? 10);
  const [difficulties, setDifficulties] = useState<Set<string>>(
    new Set(initialValues?.difficulties ?? DIFFICULTIES),
  );
  const [includeAdversarial, setIncludeAdversarial] = useState(
    initialValues?.includeAdversarial ?? false,
  );
  const [domain, setDomain] = useState(initialValues?.domain ?? '');

  function toggleDifficulty(d: string) {
    setDifficulties((prev) => {
      const next = new Set(prev);
      if (next.has(d)) {
        if (next.size > 1) next.delete(d);
      } else {
        next.add(d);
      }
      return next;
    });
  }

  function handleSubmit() {
    if (!systemPrompt.trim()) return;
    onGenerate({
      systemPrompt: systemPrompt.trim(),
      count,
      difficulties: [...difficulties] as GenerateOptions['difficulties'],
      includeAdversarial,
      domain: domain.trim() || undefined,
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* System Prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">System Prompt</CardTitle>
          <p className="text-sm text-muted-foreground">
            Paste your AI agent's system prompt. We'll analyze it and generate matching test scenarios, personas, and a scorecard.
          </p>
        </CardHeader>
        <CardContent>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Paste your AI agent's system prompt here...

Example: You are a customer support agent for Acme Corp. You help customers with billing inquiries, account changes, and product troubleshooting. Always be polite, verify the customer's identity before making changes, and escalate to a human agent if the issue involves refunds over $100."
            className="min-h-[200px] font-mono text-sm"
            data-testid="system-prompt-input"
          />
          <p className="text-[11px] text-muted-foreground mt-2">
            {systemPrompt.length > 0 ? `${systemPrompt.length} characters` : 'The more detail you provide, the better the generated tests will be.'}
          </p>
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Configuration</CardTitle>
          <p className="text-sm text-muted-foreground">
            Customize what gets generated.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Scenario Count */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Number of Scenarios</Label>
              <span className="text-sm font-medium tabular-nums" data-testid="scenario-count-value">
                {count}
              </span>
            </div>
            <Slider
              value={[count]}
              onValueChange={(v) => setCount(v[0])}
              min={1}
              max={30}
              step={1}
              data-testid="scenario-count-slider"
            />
            <p className="text-[11px] text-muted-foreground">
              More scenarios = better coverage but longer generation time.
            </p>
          </div>

          {/* Difficulties */}
          <div className="space-y-3">
            <Label>Difficulty Levels</Label>
            <div className="flex items-center gap-6">
              {DIFFICULTIES.map((d) => (
                <label
                  key={d}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <Checkbox
                    checked={difficulties.has(d)}
                    onCheckedChange={() => toggleDifficulty(d)}
                    data-testid={`difficulty-${d}`}
                  />
                  <span className="text-sm capitalize">{d}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Adversarial */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={includeAdversarial}
                onCheckedChange={(checked) => setIncludeAdversarial(checked === true)}
                data-testid="adversarial-toggle"
              />
              <div>
                <span className="text-sm font-medium">Include Adversarial Scenarios</span>
                <p className="text-[11px] text-muted-foreground">
                  Generate edge-case scenarios designed to break or confuse your agent.
                </p>
              </div>
            </label>
          </div>

          {/* Domain */}
          <div className="space-y-2">
            <Label htmlFor="domain">
              Domain <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g. customer-support, healthcare, e-commerce"
              data-testid="domain-input"
            />
            <p className="text-[11px] text-muted-foreground">
              Helps the generator produce domain-specific test scenarios.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={!systemPrompt.trim() || isLoading}
          data-testid="generate-preview-button"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Generate Preview
        </Button>
      </div>
    </div>
  );
}
