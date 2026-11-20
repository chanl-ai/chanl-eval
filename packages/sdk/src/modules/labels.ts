/**
 * Labels Module — human-in-the-loop benchmarking.
 *
 * Record what a person thinks of each criterion verdict, then measure how well the LLM judge agrees
 * with them. Without this, a scorecard score is a confident-looking number nobody has checked.
 */

import type { AxiosInstance } from 'axios';
import { unwrapResponse } from '../client';
import type {
  AgreementReport,
  CreateLabelDto,
  HumanLabel,
} from '../types';

export class LabelsModule {
  constructor(private readonly http: AxiosInstance) {}

  /** Record or correct a human verdict on one criterion of one scored run. */
  async create(dto: CreateLabelDto): Promise<HumanLabel> {
    const response = await this.http.post('/labels', dto);
    const data = unwrapResponse<any>(response);
    return data.label || data;
  }

  /** Every label recorded against a given scorecard result. */
  async listForResult(scorecardResultId: string): Promise<HumanLabel[]> {
    const response = await this.http.get(`/labels/result/${scorecardResultId}`);
    const data = unwrapResponse<any>(response);
    return data.labels || [];
  }

  /**
   * Judge-vs-human agreement: Cohen's kappa per criterion (quadratic-weighted for 0-10 scores),
   * confidence calibration, and the disagreement queue.
   */
  async agreement(filters?: {
    scorecardId?: string;
    criteriaKey?: string;
    labeledBy?: string;
  }): Promise<AgreementReport> {
    const response = await this.http.get('/labels/agreement', {
      params: filters,
    });
    return unwrapResponse<AgreementReport>(response);
  }

  async delete(id: string): Promise<void> {
    await this.http.delete(`/labels/${id}`);
  }
}
