/**
 * Scenarios Module
 *
 * SDK module for managing test scenarios.
 */

import type { AxiosInstance } from 'axios';
import { unwrapResponse } from '../client';
import type {
  Scenario,
  CreateScenarioDto,
  UpdateScenarioDto,
  ListScenariosParams,
  ListScenariosResponse,
  ExecuteScenarioDto,
  Execution,
} from '../types';

export class ScenariosModule {
  constructor(private readonly http: AxiosInstance) {}

  /**
   * List scenarios with optional filters.
   */
  async list(params?: ListScenariosParams): Promise<ListScenariosResponse> {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.agentId) queryParams.agentId = params.agentId;
    if (params?.status) queryParams.status = params.status;
    if (params?.category) queryParams.category = params.category;
    if (params?.difficulty) queryParams.difficulty = params.difficulty;
    if (params?.tags) queryParams.tags = params.tags;
    if (params?.page) queryParams.page = params.page;
    if (params?.limit) queryParams.limit = params.limit;
    if (params?.sortBy) queryParams.sortBy = params.sortBy;
    if (params?.sortOrder) queryParams.sortOrder = params.sortOrder;

    const response = await this.http.get('/scenarios', { params: queryParams });
    const data = unwrapResponse<any>(response);
    return {
      scenarios: data.scenarios || [],
      total: data.total || 0,
      pagination: data.pagination,
    };
  }

  /**
   * Get a scenario by ID.
   */
  async get(id: string): Promise<Scenario> {
    const response = await this.http.get(`/scenarios/${id}`);
    const data = unwrapResponse<any>(response);
    return data.scenario || data;
  }

  /**
   * Create a new scenario.
   */
  async create(dto: CreateScenarioDto): Promise<Scenario> {
    const response = await this.http.post('/scenarios', dto);
    const data = unwrapResponse<any>(response);
    return data.scenario || data;
  }

  /**
   * Update a scenario.
   */
  async update(id: string, dto: UpdateScenarioDto): Promise<Scenario> {
    const response = await this.http.patch(`/scenarios/${id}`, dto);
    const data = unwrapResponse<any>(response);
    return data.scenario || data;
  }

  /**
   * Delete (archive) a scenario.
   */
  async remove(id: string): Promise<{ deleted: boolean; message: string }> {
    const response = await this.http.delete(`/scenarios/${id}`);
    return unwrapResponse(response);
  }

  /**
   * Execute a scenario.
   */
  async execute(id: string, options?: ExecuteScenarioDto): Promise<Execution> {
    const response = await this.http.post(`/scenarios/${id}/execute`, options || {});
    const data = unwrapResponse<any>(response);
    return data.execution || data;
  }

  /**
   * Import a scenario from YAML.
   */
  async importYaml(yaml: string): Promise<Scenario> {
    const response = await this.http.post('/scenarios/import/yaml', { yaml });
    const data = unwrapResponse<any>(response);
    return data.scenario || data;
  }

  /**
   * Export a scenario to YAML.
   */
  async exportYaml(id: string): Promise<string> {
    const response = await this.http.get(`/scenarios/${id}/export/yaml`);
    const data = unwrapResponse<any>(response);
    return data.yaml || data;
  }
}
