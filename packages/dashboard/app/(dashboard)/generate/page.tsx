'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageLayout } from '@/components/shared/page-layout';
import { GenerateForm } from '@/components/generate/generate-form';
import { PreviewResults } from '@/components/generate/preview-results';
import { SaveSuccess } from '@/components/generate/save-success';
import { useEvalConfig } from '@/lib/eval-config';
import type {
  GenerateOptions,
  GeneratedSuite,
  PersistResult,
} from '@chanl/eval-sdk';

type PageState =
  | { step: 'form' }
  | { step: 'loading' }
  | { step: 'error'; message: string }
  | { step: 'preview'; suite: GeneratedSuite }
  | { step: 'saved'; result: PersistResult };

export default function GeneratePage() {
  return (
    <Suspense>
      <GeneratePageInner />
    </Suspense>
  );
}

function GeneratePageInner() {
  const { client } = useEvalConfig();
  const searchParams = useSearchParams();
  const prefillPrompt = searchParams.get('prompt') || '';
  const [state, setState] = useState<PageState>({ step: 'form' });
  const [lastOptions, setLastOptions] = useState<GenerateOptions | null>(null);

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: (options: GenerateOptions) => client.generation.preview(options),
    onMutate: () => {
      setState({ step: 'loading' });
    },
    onSuccess: (suite) => {
      setState({ step: 'preview', suite });
      toast.success(
        `Generated ${suite.scenarios.length} scenarios, ${suite.personas.length} personas, and ${suite.scorecard.criteria.length} criteria`,
      );
    },
    onError: (error: Error) => {
      setState({ step: 'error', message: error.message });
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (options: GenerateOptions) => client.generation.fromPrompt(options),
    onSuccess: (result) => {
      setState({ step: 'saved', result });
      toast.success(
        `Saved ${result.scenarioIds.length} scenarios, ${result.personaIds.length} personas${result.scorecardId ? ', 1 scorecard' : ''}`,
      );
    },
    onError: (error: Error) => {
      toast.error(`Save failed: ${error.message}`);
    },
  });

  function handleGenerate(options: GenerateOptions) {
    setLastOptions(options);
    previewMutation.mutate(options);
  }

  function handleSave(_suite: GeneratedSuite) {
    if (!lastOptions) return;
    // Re-send the original options to fromPrompt — the server regenerates and persists
    saveMutation.mutate(lastOptions);
  }

  function handleRegenerate() {
    if (lastOptions) {
      previewMutation.mutate(lastOptions);
    } else {
      setState({ step: 'form' });
    }
  }

  function handleGenerateMore() {
    setState({ step: 'form' });
    setLastOptions(null);
  }

  return (
    <PageLayout
      icon={Sparkles}
      title="Generate"
      description="Auto-generate test scenarios, personas, and scorecards from your agent's system prompt"
    >
      {state.step === 'form' && (
        <GenerateForm
          onGenerate={handleGenerate}
          isLoading={previewMutation.isPending}
          initialValues={lastOptions ?? (prefillPrompt ? { systemPrompt: prefillPrompt } as GenerateOptions : undefined)}
        />
      )}

      {state.step === 'loading' && (
        <div className="max-w-3xl space-y-6">
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center text-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div>
                  <p className="text-sm font-medium">Generating test suite...</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Analyzing your system prompt and creating scenarios, personas, and evaluation criteria.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-48" />
        </div>
      )}

      {state.step === 'error' && (
        <div className="max-w-3xl">
          <Card className="border-destructive/30">
            <CardContent className="py-8">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="rounded-full bg-destructive/10 p-3">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <p className="text-sm font-medium">Generation failed</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    {state.message}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setState({ step: 'form' })}
                  data-testid="generation-error-retry"
                >
                  Go back and try again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {state.step === 'preview' && (
        <PreviewResults
          suite={state.suite}
          onSave={handleSave}
          onRegenerate={handleRegenerate}
          isSaving={saveMutation.isPending}
        />
      )}

      {state.step === 'saved' && (
        <SaveSuccess
          result={state.result}
          onGenerateMore={handleGenerateMore}
        />
      )}
    </PageLayout>
  );
}
