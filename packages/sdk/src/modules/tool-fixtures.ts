/**
 * Tool Fixtures Module
 *
 * SDK module for managing tool fixtures (mock tools for scenario testing).
 */

import type { AxiosInstance } from 'axios';
import { unwrapResponse } from '../client';
import type {
  ToolFixture,
  CreateToolFixtureDto,
  UpdateToolFixtureDto,
  ListToolFixturesParams,
  ListToolFixturesResponse,
  ToolFixtureStats,
} from '../types';

export class ToolFixturesModule {
  constructor(private readonly http: AxiosInstance) {}

  /**
   * List tool fixtures with optional filters.
   */
  async list(params?: ListToolFixturesParams): Promise<ListToolFixturesResponse> {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.isActive !== undefined) queryParams.isActive = params.isActive;
    if (params?.tags) queryParams.tags = params.tags;
    if (params?.search) queryParams.search = params.search;
    if (params?.page) queryParams.page = params.page;
    if (params?.limit) queryParams.limit = params.limit;

    const response = await this.http.get('/tool-fixtures', { params: queryParams });
    const data = unwrapResponse<any>(response);
    return {
      toolFixtures: data.toolFixtures || [],
      total: data.total || 0,
      pagination: data.pagination,
    };
  }

  /**
   * Get tool fixture stats.
   */
  async getStats(): Promise<ToolFixtureStats> {
    const response = await this.http.get('/tool-fixtures/stats');
    return unwrapResponse(response);
  }

  /**
   * Get a tool fixture by ID.
   */
  async get(id: string): Promise<ToolFixture> {
    const response = await this.http.get(`/tool-fixtures/${id}`);
    const data = unwrapResponse<any>(response);
    return data.toolFixture || data;
  }

  /**
   * Create a new tool fixture.
   */
  async create(dto: CreateToolFixtureDto): Promise<ToolFixture> {
    const response = await this.http.post('/tool-fixtures', dto);
    const data = unwrapResponse<any>(response);
    return data.toolFixture || data;
  }

  /**
   * Update a tool fixture.
   */
  async update(id: string, dto: UpdateToolFixtureDto): Promise<ToolFixture> {
    const response = await this.http.patch(`/tool-fixtures/${id}`, dto);
    const data = unwrapResponse<any>(response);
    return data.toolFixture || data;
  }

  /**
   * Delete a tool fixture.
   */
  async remove(id: string): Promise<{ deleted: boolean; message: string }> {
    const response = await this.http.delete(`/tool-fixtures/${id}`);
    return unwrapResponse(response);
  }
}
