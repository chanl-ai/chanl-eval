/**
 * Scorecards Module
 *
 * SDK module for managing scorecards and evaluation results.
 */

import type { AxiosInstance } from 'axios';
import { unwrapResponse } from '../client';
import type {
  Scorecard,
  CreateScorecardDto,
  UpdateScorecardDto,
  ListScorecardsParams,
  ListScorecardsResponse,
  ScorecardDefaultResponse,
  ScorecardResult,
  CreateScorecardResultDto,
  EvaluateRequest,
} from '../types';

export class ScorecardsModule {
  constructor(private readonly http: AxiosInstance) {}

  /**
   * List scorecards with optional filters.
   */
  async list(params?: ListScorecardsParams): Promise<ListScorecardsResponse> {
    const queryParams: Record<string, string | number> = {};
    if (params?.page) queryParams.page = params.page;
    if (params?.limit) queryParams.limit = params.limit;
    if (params?.status) queryParams.status = params.status;

    const response = await this.http.get('/scorecards', { params: queryParams });
    const data = unwrapResponse<any>(response);
    return {
      scorecards: data.scorecards || [],
      total: data.total || 0,
      pagination: data.pagination,
    };
  }

  /**
   * Get a scorecard by ID.
   */
  async get(id: string): Promise<Scorecard> {
    const response = await this.http.get(`/scorecards/${id}`);
    const data = unwrapResponse<any>(response);
    return data.scorecard || data;
  }

  /**
   * Create a new scorecard.
   */
  async create(dto: CreateScorecardDto): Promise<Scorecard> {
    const response = await this.http.post('/scorecards', dto);
    const data = unwrapResponse<any>(response);
    return data.scorecard || data;
  }

  /**
   * Update a scorecard.
   */
  async update(id: string, dto: UpdateScorecardDto): Promise<Scorecard> {
    const response = await this.http.put(`/scorecards/${id}`, dto);
    const data = unwrapResponse<any>(response);
    return data.scorecard || data;
  }

  /**
   * Delete a scorecard.
   */
  async remove(id: string): Promise<{ deleted: boolean }> {
    const response = await this.http.delete(`/scorecards/${id}`);
    return unwrapResponse(response);
  }

  /**
   * Get the default scorecard.
   */
  async getDefault(): Promise<ScorecardDefaultResponse> {
    const response = await this.http.get('/scorecards/default');
    const data = unwrapResponse<any>(response);
    // The controller wraps in { data: { scorecard, source } }
    return data.data || data;
  }

  /**
   * Submit an evaluation result for a scorecard.
   */
  async evaluate(scorecardId: string, request: EvaluateRequest): Promise<ScorecardResult> {
    const dto: CreateScorecardResultDto = {
      scorecardId,
      callId: request.callId,
      executionId: request.executionId,
    };
    const response = await this.http.post('/scorecards/results', dto);
    const data = unwrapResponse<any>(response);
    return data.result || data;
  }

  /**
   * Create a scorecard result directly.
   */
  async createResult(dto: CreateScorecardResultDto): Promise<ScorecardResult> {
    const response = await this.http.post('/scorecards/results', dto);
    const data = unwrapResponse<any>(response);
    return data.result || data;
  }

  /**
   * Get a scorecard result by ID.
   */
  async getResult(resultId: string): Promise<ScorecardResult> {
    const response = await this.http.get(`/scorecards/results/${resultId}`);
    const data = unwrapResponse<any>(response);
    return data.result || data;
  }
}
