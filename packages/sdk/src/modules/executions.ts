/**
 * Executions Module
 *
 * SDK module for managing scenario executions.
 */

import type { AxiosInstance } from 'axios';
import { unwrapResponse } from '../client';
import { EvalTimeoutError } from '../errors';
import type {
  Execution,
  ListExecutionsParams,
  ListExecutionsResponse,
  WaitForCompletionOptions,
  EvaluateExecutionRequest,
  ScorecardEvaluationResult,
} from '../types';

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes

export class ExecutionsModule {
  constructor(private readonly http: AxiosInstance) {}

  /**
   * Get an execution by ID.
   */
  async get(id: string): Promise<Execution> {
    const response = await this.http.get(`/scenarios/executions/${id}`);
    const data = unwrapResponse<any>(response);
    return data.execution || data;
  }

  /**
   * List executions with optional filters.
   */
  async list(params?: ListExecutionsParams): Promise<ListExecutionsResponse> {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.scenarioId) queryParams.scenarioId = params.scenarioId;
    if (params?.agentId) queryParams.agentId = params.agentId;
    if (params?.personaId) queryParams.personaId = params.personaId;
    if (params?.status) queryParams.status = params.status;
    if (params?.triggerId) queryParams.triggerId = params.triggerId;
    if (params?.triggeredBy) queryParams.triggeredBy = params.triggeredBy;
    if (params?.fromDate) queryParams.fromDate = params.fromDate;
    if (params?.toDate) queryParams.toDate = params.toDate;
    if (params?.page) queryParams.page = params.page;
    if (params?.limit) queryParams.limit = params.limit;

    const response = await this.http.get('/scenarios/executions', { params: queryParams });
    const data = unwrapResponse<any>(response);
    return {
      executions: data.executions || [],
      total: data.total || 0,
      pagination: data.pagination,
    };
  }

  /**
   * Cancel an execution.
   */
  async cancel(id: string): Promise<{ deleted: boolean; message: string }> {
    const response = await this.http.delete(`/scenarios/executions/${id}`);
    return unwrapResponse(response);
  }

  /**
   * Retry a failed execution.
   */
  async retry(id: string, options?: { reason?: string; parameters?: Record<string, any> }): Promise<Execution> {
    const response = await this.http.post(`/scenarios/executions/${id}/retry`, options || {});
    const data = unwrapResponse<any>(response);
    return data.execution || data;
  }

  /**
   * Evaluate a completed execution against a scorecard.
   *
   * @param id - Execution ID (MongoDB ObjectId or exec_uuid format)
   * @param data - Scorecard ID and optional API key for the LLM judge
   * @returns The evaluation results embedded in the execution
   */
  async evaluate(id: string, data: EvaluateExecutionRequest): Promise<{ execution: Execution; scorecardResults: ScorecardEvaluationResult }> {
    const response = await this.http.post(`/scenarios/executions/${id}/evaluate`, data);
    const result = unwrapResponse<any>(response);
    const execution = result.execution || result;
    return {
      execution,
      scorecardResults: execution.scorecardResults,
    };
  }

  /**
   * Poll an execution until it reaches a terminal status (completed or failed).
   *
   * @param id - Execution ID to poll
   * @param options - Polling configuration
   * @returns The execution in its terminal state
   * @throws EvalTimeoutError if the execution does not complete within the timeout
   */
  async waitForCompletion(id: string, options?: WaitForCompletionOptions): Promise<Execution> {
    const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();

    const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'error']);

    while (true) {
      const execution = await this.get(id);

      if (terminalStatuses.has(execution.status)) {
        return execution;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        throw new EvalTimeoutError(id, timeoutMs);
      }

      await sleep(intervalMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
