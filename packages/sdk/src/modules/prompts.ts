/**
 * Prompts Module — CRUD for agent system prompts.
 */

import type { AxiosInstance } from 'axios';
import { unwrapResponse } from '../client';
import type {
  Prompt,
  CreatePromptDto,
  UpdatePromptDto,
  ListPromptsParams,
  ListPromptsResponse,
} from '../types';

export class PromptsModule {
  constructor(private readonly http: AxiosInstance) {}

  async list(params?: ListPromptsParams): Promise<ListPromptsResponse> {
    const queryParams: Record<string, string | number> = {};
    if (params?.page) queryParams.page = params.page;
    if (params?.limit) queryParams.limit = params.limit;
    if (params?.status) queryParams.status = params.status;

    const response = await this.http.get('/prompts', { params: queryParams });
    const data = unwrapResponse<any>(response);
    return {
      prompts: data.prompts || [],
      total: data.total || 0,
    };
  }

  async get(id: string): Promise<Prompt> {
    const response = await this.http.get(`/prompts/${id}`);
    const data = unwrapResponse<any>(response);
    return data.prompt || data;
  }

  async create(dto: CreatePromptDto): Promise<Prompt> {
    const response = await this.http.post('/prompts', dto);
    const data = unwrapResponse<any>(response);
    return data.prompt || data;
  }

  async update(id: string, dto: UpdatePromptDto): Promise<Prompt> {
    const response = await this.http.put(`/prompts/${id}`, dto);
    const data = unwrapResponse<any>(response);
    return data.prompt || data;
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const response = await this.http.delete(`/prompts/${id}`);
    return unwrapResponse(response);
  }
}
