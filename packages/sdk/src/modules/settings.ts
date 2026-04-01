/**
 * Settings Module — singleton settings for centralized provider API keys.
 */

import type { AxiosInstance } from 'axios';
import { unwrapResponse } from '../client';
import type { Settings, UpdateSettingsDto } from '../types';

export class SettingsModule {
  constructor(private readonly http: AxiosInstance) {}

  async get(): Promise<Settings> {
    const response = await this.http.get('/settings');
    const data = unwrapResponse<any>(response);
    return data.settings || data;
  }

  async getApiKey(provider: string): Promise<string> {
    const response = await this.http.get(`/settings/keys/${provider}`);
    const data = unwrapResponse<any>(response);
    return data.apiKey;
  }

  async update(dto: UpdateSettingsDto): Promise<Settings> {
    const response = await this.http.put('/settings', dto);
    const data = unwrapResponse<any>(response);
    return data.settings || data;
  }
}
