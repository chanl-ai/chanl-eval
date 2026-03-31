/**
 * EvalClient - Main entry point for the chanl-eval SDK.
 *
 * Uses axios for HTTP requests with X-API-Key authentication.
 * Each domain module (scenarios, personas, scorecards, executions) receives
 * the shared axios instance and provides typed methods for API calls.
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { EvalApiError, EvalAuthError, EvalNotFoundError } from './errors';
import { ScenariosModule } from './modules/scenarios';
import { PersonasModule } from './modules/personas';
import { ScorecardsModule } from './modules/scorecards';
import { ExecutionsModule } from './modules/executions';
import type { EvalClientConfig } from './types';

/**
 * Unwrap the axios response data.
 *
 * The chanl-eval server returns responses in various shapes:
 *   - Direct object: { scenarios: [...], total: N, pagination: {...} }
 *   - Wrapped: { success: true, data: {...} }
 *
 * This helper extracts the meaningful payload from any of these shapes.
 */
export function unwrapResponse<T>(response: AxiosResponse): T {
  const body = response.data;

  if (!body || typeof body !== 'object') {
    return body as T;
  }

  // Standard { success, data } wrapper
  if ('success' in body && 'data' in body) {
    return body.data as T;
  }

  return body as T;
}

/**
 * Main SDK client for the chanl-eval server.
 *
 * @example
 * ```typescript
 * import { EvalClient } from '@chanl/eval-sdk';
 *
 * const client = new EvalClient({
 *   baseUrl: 'http://localhost:18005',
 *   apiKey: 'your-api-key',
 * });
 *
 * // List scenarios
 * const { scenarios } = await client.scenarios.list();
 *
 * // Execute a scenario
 * const execution = await client.scenarios.execute(scenarioId, { mode: 'text' });
 *
 * // Wait for completion
 * const result = await client.executions.waitForCompletion(execution.id);
 * ```
 */
export class EvalClient {
  private readonly http: AxiosInstance;

  readonly scenarios: ScenariosModule;
  readonly personas: PersonasModule;
  readonly scorecards: ScorecardsModule;
  readonly executions: ExecutionsModule;

  constructor(config: EvalClientConfig) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      headers['X-API-Key'] = config.apiKey;
    }
    this.http = axios.create({
      baseURL: config.baseUrl,
      headers,
    });

    // Response interceptor to convert HTTP errors into typed SDK errors
    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        if (axios.isAxiosError(error) && error.response) {
          const status = error.response.status;
          const body = error.response.data as any;
          const message = body?.message || body?.error?.message || error.message;

          if (status === 401) {
            throw new EvalAuthError(message);
          }
          if (status === 404) {
            throw new EvalNotFoundError(message);
          }
          throw new EvalApiError(message, status, body?.error?.code);
        }
        // Re-throw network errors and other non-HTTP errors
        throw error;
      },
    );

    // Register modules
    this.scenarios = new ScenariosModule(this.http);
    this.personas = new PersonasModule(this.http);
    this.scorecards = new ScorecardsModule(this.http);
    this.executions = new ExecutionsModule(this.http);
  }

  /**
   * Health check - verifies the server is reachable.
   */
  async health(): Promise<{ status: string; timestamp: string; version: string }> {
    const response = await this.http.get('/health');
    return response.data;
  }
}
