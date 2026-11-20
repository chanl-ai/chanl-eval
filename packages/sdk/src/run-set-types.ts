// ============================================================================
// Run sets
// ============================================================================

export type RunSetKind = 'reliability' | 'redteam' | 'compare';

export interface CreateRunSetDto {
  kind: RunSetKind;
  scenarioId: string;
  promptId: string;
  personaIds: string[];
  scorecardId?: string;
  toolFixtureIds?: string[];
  /** Runs per persona, 1-10. Default 5. */
  k?: number;
  baselineRunSetId?: string;
}

export interface ListRunSetsParams {
  scenarioId?: string;
  promptId?: string;
  kind?: RunSetKind;
}

export interface RunSetFailedCheck {
  key: string;
  name: string;
  reasoning: string;
  evidence: string[];
  needsReview?: boolean;
}

export interface RunSetRun {
  executionId: string;
  personaId: string;
  status: string;
  /** null while the run is queued or running. */
  passed: boolean | null;
  failedChecks: RunSetFailedCheck[];
}

export interface RunSetPersona {
  personaId: string;
  personaName: string;
  runs: number;
  passed: number;
  /** null until one of the persona's runs has finished. */
  verdict: 'Held' | 'Broken' | 'Needs review' | null;
  evidence: string | null;
}

export interface RunSet {
  id: string;
  kind: RunSetKind;
  scenarioId: string;
  promptId: string;
  personaIds: string[];
  k: number;
  status: 'running' | 'completed';
  total: number;
  completed: number;
  passed: number;
  passK: boolean;
  passAtK: boolean;
  label: 'Reliable' | 'Flaky' | 'Broken' | null;
  mostFailedCheck: { key: string; name: string; failed: number } | null;
  isBaseline: boolean;
  baselineRunSetId?: string;
  createdAt?: string;
  runs: RunSetRun[];
  byPersona: RunSetPersona[];
}

export interface RunSetComparison {
  before: { passed: number; k: number; passK: boolean };
  after: { passed: number; k: number; passK: boolean };
  checks: Array<{
    key: string;
    name: string;
    beforeFailed: number;
    afterFailed: number;
    change: 'improved' | 'regressed' | 'same';
  }>;
}

export interface RoomStats {
  runsLast10Min: number;
  topFailingChecks: Array<{ name: string; failed: number; total: number }>;
  redteamBroken: Array<{ personaName: string; count: number }>;
}
