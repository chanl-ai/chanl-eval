'use client';

import { useState } from 'react';
import {
  CheckCircle,
  ClipboardList,
  FileText,
  Loader2,
  RotateCcw,
  UserCircle,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type {
  GeneratedSuite,
  GeneratedScenario,
  GeneratedPersona,
  GeneratedCriterion,
} from '@chanl/eval-sdk';

function difficultyClasses(difficulty: string): string {
  switch (difficulty) {
    case 'easy':
      return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20';
    case 'medium':
      return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20';
    case 'hard':
      return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20';
    default:
      return '';
  }
}

function criterionTypeBadge(type: string): 'default' | 'secondary' | 'outline' {
  switch (type) {
    case 'binary':
      return 'default';
    case 'scale':
      return 'secondary';
    default:
      return 'outline';
  }
}

interface PreviewResultsProps {
  suite: GeneratedSuite;
  onSave: (suite: GeneratedSuite) => void;
  onRegenerate: () => void;
  isSaving: boolean;
}

export function PreviewResults({ suite, onSave, onRegenerate, isSaving }: PreviewResultsProps) {
  const [excludedScenarios, setExcludedScenarios] = useState<Set<number>>(new Set());
  const [excludedPersonas, setExcludedPersonas] = useState<Set<number>>(new Set());
  const [excludedCriteria, setExcludedCriteria] = useState<Set<number>>(new Set());

  const activeScenarios = suite.scenarios.filter((_, i) => !excludedScenarios.has(i));
  const activePersonas = suite.personas.filter((_, i) => !excludedPersonas.has(i));
  const activeCriteria = suite.scorecard.criteria.filter((_, i) => !excludedCriteria.has(i));

  function handleSave() {
    const filteredSuite: GeneratedSuite = {
      ...suite,
      scenarios: activeScenarios,
      personas: activePersonas,
      scorecard: {
        ...suite.scorecard,
        criteria: activeCriteria,
      },
    };
    onSave(filteredSuite);
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary" className="text-xs">
              {suite.domain}
            </Badge>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{activeScenarios.length}</span> scenario{activeScenarios.length !== 1 ? 's' : ''}
            </span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{activePersonas.length}</span> persona{activePersonas.length !== 1 ? 's' : ''}
            </span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{activeCriteria.length}</span> criteri{activeCriteria.length !== 1 ? 'a' : 'on'}
            </span>
            {suite.summary && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <span className="text-sm text-muted-foreground line-clamp-1 flex-1 min-w-0">
                  {suite.summary}
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Scenarios */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">
            Scenarios
          </h2>
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {activeScenarios.length}/{suite.scenarios.length}
          </Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suite.scenarios.map((s: GeneratedScenario, i: number) => {
            const excluded = excludedScenarios.has(i);
            return (
              <Card
                key={i}
                className={`relative group transition-opacity ${excluded ? 'opacity-40' : ''}`}
                data-testid={`scenario-card-${i}`}
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          setExcludedScenarios((prev) => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          });
                        }}
                        className="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded-full bg-muted opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
                        data-testid={`scenario-remove-${i}`}
                      >
                        {excluded ? (
                          <RotateCcw className="h-3 w-3" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {excluded ? 'Restore' : 'Exclude from save'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <CardHeader className="pb-2 pr-10">
                  <CardTitle className="text-sm font-medium line-clamp-1">
                    {s.name}
                  </CardTitle>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge className={`text-[10px] border ${difficultyClasses(s.difficulty)}`}>
                      {s.difficulty}
                    </Badge>
                    {s.category && (
                      <Badge variant="secondary" className="text-[10px]">
                        {s.category}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground line-clamp-3 font-mono">
                    {s.prompt}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Personas */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <UserCircle className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">
            Personas
          </h2>
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {activePersonas.length}/{suite.personas.length}
          </Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suite.personas.map((p: GeneratedPersona, i: number) => {
            const excluded = excludedPersonas.has(i);
            return (
              <Card
                key={i}
                className={`relative group transition-opacity ${excluded ? 'opacity-40' : ''}`}
                data-testid={`persona-card-${i}`}
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          setExcludedPersonas((prev) => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          });
                        }}
                        className="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded-full bg-muted opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
                        data-testid={`persona-remove-${i}`}
                      >
                        {excluded ? (
                          <RotateCcw className="h-3 w-3" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {excluded ? 'Restore' : 'Exclude from save'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <CardHeader className="pb-2 pr-10">
                  <CardTitle className="text-sm font-medium">
                    {p.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {p.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.emotion && (
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {p.emotion}
                      </Badge>
                    )}
                    {p.behavior?.cooperationLevel && (
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {p.behavior.cooperationLevel}
                      </Badge>
                    )}
                    {p.behavior?.personality && (
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {p.behavior.personality}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Scorecard */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">
            Scorecard
          </h2>
          <Badge variant="outline" className="text-[10px]">
            {suite.scorecard.name}
          </Badge>
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Key</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[80px]">Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {suite.scorecard.criteria.map((c: GeneratedCriterion, i: number) => {
                  const excluded = excludedCriteria.has(i);
                  return (
                    <TableRow
                      key={i}
                      className={`group ${excluded ? 'opacity-40' : ''}`}
                      data-testid={`criterion-row-${i}`}
                    >
                      <TableCell className="font-mono text-xs">{c.key}</TableCell>
                      <TableCell className="text-sm font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant={criterionTypeBadge(c.type)} className="text-[10px]">
                          {c.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {c.description}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => {
                            setExcludedCriteria((prev) => {
                              const next = new Set(prev);
                              if (next.has(i)) next.delete(i);
                              else next.add(i);
                              return next;
                            });
                          }}
                          className="h-6 w-6 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
                          data-testid={`criterion-remove-${i}`}
                        >
                          {excluded ? (
                            <RotateCcw className="h-3 w-3" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pb-6">
        <Button
          variant="outline"
          onClick={onRegenerate}
          disabled={isSaving}
          data-testid="regenerate-button"
        >
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          Regenerate
        </Button>
        <Button
          onClick={handleSave}
          disabled={isSaving || (activeScenarios.length === 0 && activePersonas.length === 0)}
          data-testid="save-all-button"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle className="mr-2 h-3.5 w-3.5" />
              Accept &amp; Save All
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
