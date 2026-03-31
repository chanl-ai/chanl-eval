/** Execution payload from API includes transcript steps */
export interface ExecutionStepResult {
  stepId: string;
  status: string;
  actualResponse?: string;
  expectedResponse?: string;
  score?: number;
  duration?: number;
}

export interface ExecutionDetail {
  id?: string;
  executionId?: string;
  scenarioId?: string;
  personaId?: string;
  status: string;
  overallScore?: number;
  startTime?: string;
  endTime?: string;
  duration?: number;
  stepResults?: ExecutionStepResult[];
  errorMessages?: string[];
}

export function getExecutionRef(e: ExecutionDetail): string {
  return (e.executionId as string) || (e.id as string) || '';
}
