/**
 * Datasets Module
 *
 * SDK module for generating and exporting training datasets from conversation executions.
 */

import type { AxiosInstance } from 'axios';
import { unwrapResponse } from '../client';

export interface GenerateDatasetOptions {
  scenarioId: string;
  promptId: string;
  personaIds?: string[];
  count?: number;
}

export interface GenerateDatasetResponse {
  batchId: string;
  executionIds: string[];
  total: number;
}

export interface BatchStatusResponse {
  batchId: string;
  total: number;
  completed: number;
  failed: number;
  running: number;
  queued: number;
  status: 'running' | 'completed' | 'partial' | 'failed';
}

export interface ExportDatasetOptions {
  format: 'openai' | 'openai-tools' | 'sharegpt' | 'dpo';
  filters?: {
    scenarioIds?: string[];
    personaIds?: string[];
    minScore?: number;
    status?: string;
    fromDate?: string;
    toDate?: string;
    batchId?: string;
  };
  options?: {
    systemPrompt?: string;
    includeMetadata?: boolean;
  };
}

export interface ExportPreviewResponse {
  count: number;
  avgScore: number;
  sampleLine: string | null;
  format: string;
}

export class DatasetsModule {
  constructor(private readonly http: AxiosInstance) {}

  /**
   * Generate a batch of conversations for dataset creation.
   */
  async generate(options: GenerateDatasetOptions): Promise<GenerateDatasetResponse> {
    const response = await this.http.post('/datasets/generate', options);
    return unwrapResponse<GenerateDatasetResponse>(response);
  }

  /**
   * Get the status of a batch generation run.
   */
  async generationStatus(batchId: string): Promise<BatchStatusResponse> {
    const response = await this.http.get(`/datasets/generate/${batchId}/status`);
    return unwrapResponse<BatchStatusResponse>(response);
  }

  /**
   * Wait for a batch generation to complete.
   */
  async waitForBatch(
    batchId: string,
    options?: { pollIntervalMs?: number; timeoutMs?: number },
  ): Promise<BatchStatusResponse> {
    const interval = options?.pollIntervalMs ?? 3000;
    const timeout = options?.timeoutMs ?? 600_000; // 10 minutes
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const status = await this.generationStatus(batchId);
      if (status.status !== 'running') return status;
      await new Promise((r) => setTimeout(r, interval));
    }

    throw new Error(`Batch ${batchId} timed out after ${timeout}ms`);
  }

  /**
   * Export executions as a training data file (returns raw response for streaming).
   */
  async export(options: ExportDatasetOptions): Promise<string> {
    const response = await this.http.post('/datasets/export', options, {
      responseType: 'text',
    });
    return response.data as string;
  }

  /**
   * Preview what an export would contain without downloading.
   */
  async preview(
    format?: string,
    filters?: ExportDatasetOptions['filters'],
  ): Promise<ExportPreviewResponse> {
    const params: Record<string, string | number> = {};
    if (format) params.format = format;
    if (filters?.scenarioIds?.length) params.scenarioIds = filters.scenarioIds.join(',');
    if (filters?.personaIds?.length) params.personaIds = filters.personaIds.join(',');
    if (filters?.minScore !== undefined) params.minScore = filters.minScore;
    if (filters?.status) params.status = filters.status;
    if (filters?.batchId) params.batchId = filters.batchId;

    const response = await this.http.get('/datasets/export/preview', { params });
    return unwrapResponse<ExportPreviewResponse>(response);
  }
}
