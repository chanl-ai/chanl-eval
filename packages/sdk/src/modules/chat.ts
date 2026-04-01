import { AxiosInstance } from 'axios';

export interface ChatSession {
  sessionId: string;
  executionId: string;
}

export interface ChatResponse {
  content: string;
  latencyMs?: number;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
    result?: any;
  }>;
}

export class ChatModule {
  constructor(private readonly http: AxiosInstance) {}

  async createSession(dto: { promptId: string }): Promise<ChatSession> {
    const response = await this.http.post('/chat/sessions', dto);
    const body = response.data;
    return body?.session ?? body?.data?.session ?? body;
  }

  async sendMessage(sessionId: string, message: string): Promise<ChatResponse> {
    const response = await this.http.post(`/chat/sessions/${sessionId}/messages`, {
      message,
    });
    const body = response.data;
    return body?.response ?? body?.data?.response ?? body;
  }

  async endSession(sessionId: string): Promise<any> {
    const response = await this.http.post(`/chat/sessions/${sessionId}/end`);
    const body = response.data;
    return body?.execution ?? body?.data?.execution ?? body;
  }

  async getSession(sessionId: string): Promise<any> {
    const response = await this.http.get(`/chat/sessions/${sessionId}`);
    const body = response.data;
    return body?.execution ?? body?.data?.execution ?? body;
  }

  /** Find the last active (un-ended) manual chat session */
  async getActiveSession(): Promise<{ sessionId: string; execution: any } | null> {
    const response = await this.http.get('/chat/sessions/active');
    const body = response.data;
    const data = body?.data ?? body;
    if (!data || !data.sessionId) return null;
    return data;
  }
}
