/**
 * Run Sets Module
 *
 * k repeated runs of a scenario per persona, summarised on the server (pass^k, label, verdicts).
 */

import type { AxiosInstance } from 'axios';
import { unwrapResponse } from '../client';
import type {
  CreateRunSetDto,
  ListRunSetsParams,
  RunSet,
  RunSetComparison,
} from '../types';

export class RunSetsModule {
  constructor(private readonly http: AxiosInstance) {}

  /** Queue k executions per persona. */
  async create(dto: CreateRunSetDto): Promise<{ id: string; executionIds: string[] }> {
    return unwrapResponse(await this.http.post('/run-sets', dto));
  }

  /** Run sets, newest first. */
  async list(params?: ListRunSetsParams): Promise<RunSet[]> {
    const data = unwrapResponse<{ runSets?: RunSet[] }>(
      await this.http.get('/run-sets', { params }),
    );
    return data.runSets || [];
  }

  async get(id: string): Promise<RunSet> {
    return unwrapResponse(await this.http.get(`/run-sets/${id}`));
  }

  /** Mark this set the baseline for its scenario and persona set. */
  async markBaseline(id: string): Promise<RunSet> {
    return unwrapResponse(await this.http.post(`/run-sets/${id}/baseline`));
  }

  async compare(id: string, baselineId: string): Promise<RunSetComparison> {
    return unwrapResponse(await this.http.get(`/run-sets/${id}/compare/${baselineId}`));
  }

  /** Poll until every run has finished, or the timeout passes. */
  async waitForCompletion(
    id: string,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<RunSet> {
    const interval = opts.intervalMs ?? 3000;
    const deadline = Date.now() + (opts.timeoutMs ?? 600_000);
    for (;;) {
      const runSet = await this.get(id);
      if (runSet.status === 'completed' || Date.now() > deadline) return runSet;
      await new Promise((r) => setTimeout(r, interval));
    }
  }
}
