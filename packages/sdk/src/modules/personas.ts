/**
 * Personas Module
 *
 * SDK module for managing test personas.
 */

import type { AxiosInstance } from 'axios';
import { unwrapResponse } from '../client';
import type {
  Persona,
  CreatePersonaDto,
  UpdatePersonaDto,
  ListPersonasParams,
  ListPersonasResponse,
} from '../types';

export class PersonasModule {
  constructor(private readonly http: AxiosInstance) {}

  /**
   * List personas with optional filters.
   */
  async list(params?: ListPersonasParams): Promise<ListPersonasResponse> {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.workspaceId) queryParams.workspaceId = params.workspaceId;
    if (params?.emotion) queryParams.emotion = params.emotion;
    if (params?.language) queryParams.language = params.language;
    if (params?.gender) queryParams.gender = params.gender;
    if (params?.accent) queryParams.accent = params.accent;
    if (params?.isActive !== undefined) queryParams.isActive = params.isActive;
    if (params?.isDefault !== undefined) queryParams.isDefault = params.isDefault;
    if (params?.tags) queryParams.tags = params.tags;
    if (params?.page) queryParams.page = params.page;
    if (params?.limit) queryParams.limit = params.limit;
    if (params?.sortBy) queryParams.sortBy = params.sortBy;
    if (params?.sortOrder) queryParams.sortOrder = params.sortOrder;

    const response = await this.http.get('/personas', { params: queryParams });
    const data = unwrapResponse<any>(response);
    return {
      personas: data.personas || [],
      total: data.total || 0,
      pagination: data.pagination,
    };
  }

  /**
   * Get a persona by ID.
   */
  async get(id: string): Promise<Persona> {
    const response = await this.http.get(`/personas/${id}`);
    const data = unwrapResponse<any>(response);
    return data.persona || data;
  }

  /**
   * Create a new persona.
   */
  async create(dto: CreatePersonaDto): Promise<Persona> {
    const response = await this.http.post('/personas', dto);
    const data = unwrapResponse<any>(response);
    return data.persona || data;
  }

  /**
   * Update a persona.
   */
  async update(id: string, dto: UpdatePersonaDto): Promise<Persona> {
    const response = await this.http.patch(`/personas/${id}`, dto);
    const data = unwrapResponse<any>(response);
    return data.persona || data;
  }

  /**
   * Delete a persona.
   */
  async remove(id: string): Promise<{ deleted: boolean; message: string }> {
    const response = await this.http.delete(`/personas/${id}`);
    return unwrapResponse(response);
  }

  /**
   * Get default personas.
   */
  async getDefaults(): Promise<Persona[]> {
    const response = await this.http.get('/personas/defaults');
    const data = unwrapResponse<any>(response);
    return data.personas || [];
  }

  /**
   * Create default personas for a workspace.
   */
  async createDefaults(workspaceId?: string): Promise<Persona[]> {
    const params = workspaceId ? { workspaceId } : undefined;
    const response = await this.http.post('/personas/defaults', null, { params });
    const data = unwrapResponse<any>(response);
    return data.personas || [];
  }
}
