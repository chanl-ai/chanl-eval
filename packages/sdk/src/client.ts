/**
 * EvalClient - Main entry point for the chanl-eval SDK.
 *
 * Uses axios for HTTP requests with X-API-Key authentication.
 * Each domain module (scenarios, personas, scorecards, executions) receives
 * the shared axios instance and provides typed methods for API calls.
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { EvalApiError, EvalAuthError, EvalNotFoundError } from './errors';
import { PromptsModule } from './modules/prompts';
import { ScenariosModule } from './modules/scenarios';
import { PersonasModule } from './modules/personas';
import { ScorecardsModule } from './modules/scorecards';
import { ExecutionsModule } from './modules/executions';
import { ToolFixturesModule } from './modules/tool-fixtures';
import { SettingsModule } from './modules/settings';
import { ChatModule } from './modules/chat';
import { DatasetsModule } from './modules/datasets';
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

  readonly prompts: PromptsModule;
  readonly scenarios: ScenariosModule;
  readonly personas: PersonasModule;
  readonly scorecards: ScorecardsModule;
  readonly executions: ExecutionsModule;
  readonly toolFixtures: ToolFixturesModule;
  readonly settings: SettingsModule;
  readonly chat: ChatModule;
  readonly datasets: DatasetsModule;

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
          const body = error.response.data as
            | { message?: string; error?: { message?: string; code?: string } }
            | undefined;
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
    this.prompts = new PromptsModule(this.http);
    this.scenarios = new ScenariosModule(this.http);
    this.personas = new PersonasModule(this.http);
    this.scorecards = new ScorecardsModule(this.http);
    this.executions = new ExecutionsModule(this.http);
    this.toolFixtures = new ToolFixturesModule(this.http);
    this.settings = new SettingsModule(this.http);
    this.chat = new ChatModule(this.http);
    this.datasets = new DatasetsModule(this.http);
  }

  /**
   * Health check - verifies the server is reachable.
   * Health endpoint is at the server root (/health), not under /api/v1.
   */
  async health(): Promise<{ status: string; timestamp: string; version: string }> {
    // Strip /api/v1 suffix from baseURL to reach the root health endpoint
    const base = this.http.defaults.baseURL || '';
    const rootUrl = base.replace(/\/api\/v\d+\/?$/, '');
    const response = await this.http.get(`${rootUrl}/health`);
    return response.data;
  }
}
