import axios, { AxiosInstance, AxiosError } from 'axios';
import { loadConfig } from './config';

export interface ApiResponse<T = any> {
  data: T;
  status: number;
}

export interface ApiError {
  message: string;
  status: number;
  details?: any;
}

/**
 * Create an axios client configured from CLI config.
 * Reads server URL and API key from ~/.chanl/config.json.
 */
export function createClient(): AxiosInstance {
  const config = loadConfig();

  if (!config.server) {
    throw new Error(
      'Server URL not configured. Run: chanl config set server <url>',
    );
  }

  const client = axios.create({
    baseURL: config.server,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { 'X-API-Key': config.apiKey } : {}),
    },
  });

  return client;
}

/**
 * GET request to the server.
 */
export async function get<T = any>(path: string, params?: Record<string, any>): Promise<T> {
  const client = createClient();
  const response = await client.get<T>(path, { params });
  return response.data;
}

/**
 * POST request to the server.
 */
export async function post<T = any>(path: string, data?: any): Promise<T> {
  const client = createClient();
  const response = await client.post<T>(path, data);
  return response.data;
}

/**
 * PUT request to the server.
 */
export async function put<T = any>(path: string, data?: any): Promise<T> {
  const client = createClient();
  const response = await client.put<T>(path, data);
  return response.data;
}

/**
 * DELETE request to the server.
 */
export async function del<T = any>(path: string): Promise<T> {
  const client = createClient();
  const response = await client.delete<T>(path);
  return response.data;
}

/**
 * Format an axios error into a user-friendly message.
 */
export function formatError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const axErr = err as AxiosError<any>;
    if (axErr.response) {
      const status = axErr.response.status;
      const body = axErr.response.data;
      const msg = body?.message || body?.error || axErr.message;
      return `HTTP ${status}: ${msg}`;
    }
    if (axErr.code === 'ECONNREFUSED') {
      return 'Connection refused. Is the server running? Check: chanl config get server';
    }
    if (axErr.code === 'ENOTFOUND') {
      return `Server not found: ${axErr.config?.baseURL}. Check: chanl config get server`;
    }
    return axErr.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
