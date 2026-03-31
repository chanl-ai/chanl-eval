/**
 * Data structure for scenario execution jobs enqueued to BullMQ.
 */
export interface ScenarioExecutionJobData {
  executionId: string;
  scenarioId: string;
  adapterType?: string;
  adapterConfig?: Record<string, any>;
  personaId?: string;
  agentId?: string;
  maxTurns?: number;
  parameters?: Record<string, any>;
}

/**
 * Result produced by the execution processor after a scenario run.
 */
export interface ScenarioExecutionResult {
  passed: boolean;
  score: number;
  duration: number;
  transcript: TranscriptEntry[];
  metrics?: Record<string, number>;
  errors?: string[];
}

/**
 * Single entry in a conversation transcript.
 */
export interface TranscriptEntry {
  role: 'persona' | 'agent';
  content: string;
  timestamp: Date;
  latencyMs?: number;
}
