'use client';

import Link from 'next/link';
import {
  CheckCircle,
  ClipboardList,
  FileText,
  Sparkles,
  UserCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { PersistResult } from '@chanl/eval-sdk';

interface SaveSuccessProps {
  result: PersistResult;
  onGenerateMore: () => void;
}

export function SaveSuccess({ result, onGenerateMore }: SaveSuccessProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-7 w-7 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Test Suite Saved</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Your generated test suite has been saved to the database.
              </p>
            </div>

            {result.domain && (
              <Badge variant="secondary">{result.domain}</Badge>
            )}

            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium tabular-nums">{result.scenarioIds.length}</span>
                <span className="text-muted-foreground">scenario{result.scenarioIds.length !== 1 ? 's' : ''}</span>
              </span>
              <Separator orientation="vertical" className="h-4" />
              <span className="flex items-center gap-1.5">
                <UserCircle className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium tabular-nums">{result.personaIds.length}</span>
                <span className="text-muted-foreground">persona{result.personaIds.length !== 1 ? 's' : ''}</span>
              </span>
              {result.scorecardId && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <span className="flex items-center gap-1.5">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium tabular-nums">1</span>
                    <span className="text-muted-foreground">scorecard</span>
                  </span>
                </>
              )}
            </div>

            {result.summary && (
              <p className="text-sm text-muted-foreground max-w-md">
                {result.summary}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Navigation links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/scenarios" className="group">
          <Card className="h-full transition-shadow hover:shadow-md cursor-pointer select-none">
            <CardContent className="py-4 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">View Scenarios</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {result.scenarioIds.length} created
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/personas" className="group">
          <Card className="h-full transition-shadow hover:shadow-md cursor-pointer select-none">
            <CardContent className="py-4 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <UserCircle className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">View Personas</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {result.personaIds.length} created
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        {result.scorecardId && (
          <Link href="/scorecards" className="group">
            <Card className="h-full transition-shadow hover:shadow-md cursor-pointer select-none">
              <CardContent className="py-4 flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">View Scorecards</p>
                  <p className="text-xs text-muted-foreground">1 created</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      {/* Generate More */}
      <div className="flex justify-center">
        <Button
          variant="outline"
          onClick={onGenerateMore}
          data-testid="generate-more-button"
        >
          <Sparkles className="mr-2 h-3.5 w-3.5" />
          Generate More
        </Button>
      </div>
    </div>
  );
}
