import axios from 'axios';
import { EvalClient, unwrapResponse } from '../client';
import { EvalApiError, EvalAuthError, EvalNotFoundError, EvalTimeoutError } from '../errors';

// Mock axios entirely
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Helper to create a mock axios instance with all needed methods
function createMockAxiosInstance() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    defaults: { headers: { common: {} } },
  } as any;
}

describe('EvalClient', () => {
  let mockInstance: ReturnType<typeof createMockAxiosInstance>;
  let client: EvalClient;
  let errorInterceptor: (error: any) => any;

  beforeEach(() => {
    mockInstance = createMockAxiosInstance();
    mockedAxios.create.mockReturnValue(mockInstance);
    mockedAxios.isAxiosError.mockImplementation((error: any) => {
      return error?.isAxiosError === true;
    });

    client = new EvalClient({
      baseUrl: 'http://localhost:8005',
      apiKey: 'test-api-key',
    });

    // Capture the error interceptor that was registered
    errorInterceptor = mockInstance.interceptors.response.use.mock.calls[0][1];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // CONSTRUCTOR
  // ==========================================================================

  describe('constructor', () => {
    it('should create axios instance with correct baseURL and headers', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'http://localhost:8005',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-api-key',
        },
      });
    });

    it('should register all four modules', () => {
      expect(client.scenarios).toBeDefined();
      expect(client.personas).toBeDefined();
      expect(client.scorecards).toBeDefined();
      expect(client.executions).toBeDefined();
    });

    it('should register a response error interceptor', () => {
      expect(mockInstance.interceptors.response.use).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // unwrapResponse
  // ==========================================================================

  describe('unwrapResponse', () => {
    it('should return data directly when no wrapper is present', () => {
      const response = { data: { scenarios: [], total: 0 } } as any;
      const result = unwrapResponse(response);
      expect(result).toEqual({ scenarios: [], total: 0 });
    });

    it('should unwrap { success, data } wrapper', () => {
      const response = {
        data: { success: true, data: { id: '123', name: 'Test' } },
      } as any;
      const result = unwrapResponse(response);
      expect(result).toEqual({ id: '123', name: 'Test' });
    });

    it('should handle primitive response data', () => {
      const response = { data: 'hello' } as any;
      const result = unwrapResponse(response);
      expect(result).toBe('hello');
    });

    it('should handle null response data', () => {
      const response = { data: null } as any;
      const result = unwrapResponse(response);
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  describe('error handling', () => {
    it('should throw EvalAuthError on 401', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 401,
          data: { message: 'Invalid API key' },
        },
        message: 'Request failed with status code 401',
      };

      expect(() => errorInterceptor(axiosError)).toThrow(EvalAuthError);
      try {
        errorInterceptor(axiosError);
      } catch (e: any) {
        expect(e.statusCode).toBe(401);
        expect(e.message).toBe('Invalid API key');
      }
    });

    it('should throw EvalNotFoundError on 404', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 404,
          data: { message: 'Scenario not found' },
        },
        message: 'Request failed with status code 404',
      };

      expect(() => errorInterceptor(axiosError)).toThrow(EvalNotFoundError);
      try {
        errorInterceptor(axiosError);
      } catch (e: any) {
        expect(e.statusCode).toBe(404);
        expect(e.message).toBe('Scenario not found');
      }
    });

    it('should throw EvalApiError on 500', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 500,
          data: { message: 'Internal server error' },
        },
        message: 'Request failed with status code 500',
      };

      expect(() => errorInterceptor(axiosError)).toThrow(EvalApiError);
      try {
        errorInterceptor(axiosError);
      } catch (e: any) {
        expect(e.statusCode).toBe(500);
      }
    });

    it('should re-throw non-axios errors', async () => {
      const networkError = new Error('Network Error');
      expect(() => errorInterceptor(networkError)).toThrow('Network Error');
    });

    it('should extract error message from nested error.message field', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: { message: 'Validation failed', code: 'VALIDATION_ERROR' } },
        },
        message: 'Request failed with status code 400',
      };

      try {
        errorInterceptor(axiosError);
      } catch (e: any) {
        expect(e.message).toBe('Validation failed');
        expect(e.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  // ==========================================================================
  // HEALTH
  // ==========================================================================

  describe('health', () => {
    it('should call GET /health', async () => {
      const healthData = { status: 'ok', timestamp: '2025-01-01T00:00:00Z', version: '0.1.0' };
      mockInstance.get.mockResolvedValue({ data: healthData });

      const result = await client.health();
      expect(mockInstance.get).toHaveBeenCalledWith('/health');
      expect(result).toEqual(healthData);
    });
  });

  // ==========================================================================
  // SCENARIOS MODULE
  // ==========================================================================

  describe('scenarios', () => {
    it('list() should call GET /scenarios', async () => {
      mockInstance.get.mockResolvedValue({
        data: { scenarios: [{ id: 's1', name: 'Test' }], total: 1, pagination: { page: 1 } },
      });

      const result = await client.scenarios.list();
      expect(mockInstance.get).toHaveBeenCalledWith('/scenarios', { params: {} });
      expect(result.scenarios).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('list() should pass filter params', async () => {
      mockInstance.get.mockResolvedValue({
        data: { scenarios: [], total: 0 },
      });

      await client.scenarios.list({ status: 'active', category: 'support', page: 2, limit: 5 });
      expect(mockInstance.get).toHaveBeenCalledWith('/scenarios', {
        params: { status: 'active', category: 'support', page: 2, limit: 5 },
      });
    });

    it('get() should call GET /scenarios/:id', async () => {
      mockInstance.get.mockResolvedValue({
        data: { scenario: { id: 's1', name: 'Test', prompt: 'Hello' } },
      });

      const result = await client.scenarios.get('s1');
      expect(mockInstance.get).toHaveBeenCalledWith('/scenarios/s1');
      expect(result.id).toBe('s1');
    });

    it('create() should call POST /scenarios', async () => {
      const dto = {
        name: 'New Scenario',
        prompt: 'Test prompt',
        personaIds: ['p1'],
        agentIds: ['a1'],
      };
      mockInstance.post.mockResolvedValue({
        data: { scenario: { id: 's2', ...dto } },
      });

      const result = await client.scenarios.create(dto);
      expect(mockInstance.post).toHaveBeenCalledWith('/scenarios', dto);
      expect(result.name).toBe('New Scenario');
    });

    it('update() should call PATCH /scenarios/:id', async () => {
      const dto = { name: 'Updated Name' };
      mockInstance.patch.mockResolvedValue({
        data: { scenario: { id: 's1', name: 'Updated Name' } },
      });

      const result = await client.scenarios.update('s1', dto);
      expect(mockInstance.patch).toHaveBeenCalledWith('/scenarios/s1', dto);
      expect(result.name).toBe('Updated Name');
    });

    it('remove() should call DELETE /scenarios/:id', async () => {
      mockInstance.delete.mockResolvedValue({
        data: { deleted: true, message: 'Scenario archived successfully' },
      });

      const result = await client.scenarios.remove('s1');
      expect(mockInstance.delete).toHaveBeenCalledWith('/scenarios/s1');
      expect(result.deleted).toBe(true);
    });

    it('execute() should call POST /scenarios/:id/execute', async () => {
      const options = { mode: 'text' as const, agentId: 'a1' };
      mockInstance.post.mockResolvedValue({
        data: { execution: { id: 'e1', scenarioId: 's1', status: 'pending' } },
      });

      const result = await client.scenarios.execute('s1', options);
      expect(mockInstance.post).toHaveBeenCalledWith('/scenarios/s1/execute', options);
      expect(result.status).toBe('pending');
    });

    it('execute() should send empty body when no options provided', async () => {
      mockInstance.post.mockResolvedValue({
        data: { execution: { id: 'e1', scenarioId: 's1', status: 'pending' } },
      });

      await client.scenarios.execute('s1');
      expect(mockInstance.post).toHaveBeenCalledWith('/scenarios/s1/execute', {});
    });

    it('importYaml() should call POST /scenarios/import/yaml', async () => {
      const yaml = 'name: Test\nprompt: Hello';
      mockInstance.post.mockResolvedValue({
        data: { scenario: { id: 's3', name: 'Test' } },
      });

      const result = await client.scenarios.importYaml(yaml);
      expect(mockInstance.post).toHaveBeenCalledWith('/scenarios/import/yaml', { yaml });
      expect(result.name).toBe('Test');
    });

    it('exportYaml() should call GET /scenarios/:id/export/yaml', async () => {
      mockInstance.get.mockResolvedValue({
        data: { yaml: 'name: Test\nprompt: Hello' },
      });

      const result = await client.scenarios.exportYaml('s1');
      expect(mockInstance.get).toHaveBeenCalledWith('/scenarios/s1/export/yaml');
      expect(result).toBe('name: Test\nprompt: Hello');
    });
  });

  // ==========================================================================
  // PERSONAS MODULE
  // ==========================================================================

  describe('personas', () => {
    it('list() should call GET /personas', async () => {
      mockInstance.get.mockResolvedValue({
        data: { personas: [{ id: 'p1', name: 'Angry Customer' }], total: 1 },
      });

      const result = await client.personas.list();
      expect(mockInstance.get).toHaveBeenCalledWith('/personas', { params: {} });
      expect(result.personas).toHaveLength(1);
    });

    it('list() should pass filter params including booleans', async () => {
      mockInstance.get.mockResolvedValue({ data: { personas: [], total: 0 } });

      await client.personas.list({ emotion: 'frustrated', isActive: true, isDefault: false });
      expect(mockInstance.get).toHaveBeenCalledWith('/personas', {
        params: { emotion: 'frustrated', isActive: true, isDefault: false },
      });
    });

    it('get() should call GET /personas/:id', async () => {
      mockInstance.get.mockResolvedValue({
        data: { persona: { id: 'p1', name: 'Angry Customer' } },
      });

      const result = await client.personas.get('p1');
      expect(mockInstance.get).toHaveBeenCalledWith('/personas/p1');
      expect(result.id).toBe('p1');
    });

    it('create() should call POST /personas', async () => {
      const dto = {
        name: 'New Persona',
        gender: 'male',
        emotion: 'neutral',
        language: 'english',
        accent: 'american',
        intentClarity: 'very clear',
        speechStyle: 'normal',
        backgroundNoise: false,
        allowInterruptions: false,
      };
      mockInstance.post.mockResolvedValue({
        data: { persona: { id: 'p2', ...dto } },
      });

      const result = await client.personas.create(dto);
      expect(mockInstance.post).toHaveBeenCalledWith('/personas', dto);
      expect(result.name).toBe('New Persona');
    });

    it('update() should call PATCH /personas/:id', async () => {
      const dto = { name: 'Updated Persona' };
      mockInstance.patch.mockResolvedValue({
        data: { persona: { id: 'p1', name: 'Updated Persona' } },
      });

      const result = await client.personas.update('p1', dto);
      expect(mockInstance.patch).toHaveBeenCalledWith('/personas/p1', dto);
      expect(result.name).toBe('Updated Persona');
    });

    it('remove() should call DELETE /personas/:id', async () => {
      mockInstance.delete.mockResolvedValue({
        data: { deleted: true, message: 'Persona deleted successfully' },
      });

      const result = await client.personas.remove('p1');
      expect(mockInstance.delete).toHaveBeenCalledWith('/personas/p1');
      expect(result.deleted).toBe(true);
    });

    it('getDefaults() should call GET /personas/defaults', async () => {
      mockInstance.get.mockResolvedValue({
        data: { personas: [{ id: 'p1', isDefault: true }] },
      });

      const result = await client.personas.getDefaults();
      expect(mockInstance.get).toHaveBeenCalledWith('/personas/defaults');
      expect(result).toHaveLength(1);
    });

    it('createDefaults() should call POST /personas/defaults', async () => {
      mockInstance.post.mockResolvedValue({
        data: { personas: [{ id: 'p1' }, { id: 'p2' }] },
      });

      const result = await client.personas.createDefaults();
      expect(mockInstance.post).toHaveBeenCalledWith('/personas/defaults', null, { params: undefined });
      expect(result).toHaveLength(2);
    });

    it('createDefaults() should pass workspaceId', async () => {
      mockInstance.post.mockResolvedValue({
        data: { personas: [] },
      });

      await client.personas.createDefaults('ws-123');
      expect(mockInstance.post).toHaveBeenCalledWith('/personas/defaults', null, {
        params: { workspaceId: 'ws-123' },
      });
    });
  });

  // ==========================================================================
  // SCORECARDS MODULE
  // ==========================================================================

  describe('scorecards', () => {
    it('list() should call GET /scorecards', async () => {
      mockInstance.get.mockResolvedValue({
        data: { scorecards: [{ id: 'sc1', name: 'Quality' }], total: 1 },
      });

      const result = await client.scorecards.list();
      expect(mockInstance.get).toHaveBeenCalledWith('/scorecards', { params: {} });
      expect(result.scorecards).toHaveLength(1);
    });

    it('list() should pass filter params', async () => {
      mockInstance.get.mockResolvedValue({ data: { scorecards: [], total: 0 } });

      await client.scorecards.list({ status: 'active', page: 1, limit: 10 });
      expect(mockInstance.get).toHaveBeenCalledWith('/scorecards', {
        params: { status: 'active', page: 1, limit: 10 },
      });
    });

    it('get() should call GET /scorecards/:id', async () => {
      mockInstance.get.mockResolvedValue({
        data: { scorecard: { id: 'sc1', name: 'Quality' } },
      });

      const result = await client.scorecards.get('sc1');
      expect(mockInstance.get).toHaveBeenCalledWith('/scorecards/sc1');
      expect(result.id).toBe('sc1');
    });

    it('create() should call POST /scorecards', async () => {
      const dto = { name: 'New Scorecard', passingThreshold: 80 };
      mockInstance.post.mockResolvedValue({
        data: { scorecard: { id: 'sc2', ...dto } },
      });

      const result = await client.scorecards.create(dto);
      expect(mockInstance.post).toHaveBeenCalledWith('/scorecards', dto);
      expect(result.name).toBe('New Scorecard');
    });

    it('update() should call PUT /scorecards/:id', async () => {
      const dto = { name: 'Updated Scorecard' };
      mockInstance.put.mockResolvedValue({
        data: { scorecard: { id: 'sc1', name: 'Updated Scorecard' } },
      });

      const result = await client.scorecards.update('sc1', dto);
      expect(mockInstance.put).toHaveBeenCalledWith('/scorecards/sc1', dto);
      expect(result.name).toBe('Updated Scorecard');
    });

    it('remove() should call DELETE /scorecards/:id', async () => {
      mockInstance.delete.mockResolvedValue({
        data: { deleted: true },
      });

      const result = await client.scorecards.remove('sc1');
      expect(mockInstance.delete).toHaveBeenCalledWith('/scorecards/sc1');
      expect(result.deleted).toBe(true);
    });

    it('getDefault() should call GET /scorecards/default', async () => {
      mockInstance.get.mockResolvedValue({
        data: { data: { scorecard: { id: 'sc1' }, source: 'workspace' } },
      });

      const result = await client.scorecards.getDefault();
      expect(mockInstance.get).toHaveBeenCalledWith('/scorecards/default');
      expect(result.scorecard.id).toBe('sc1');
      expect(result.source).toBe('workspace');
    });

    it('evaluate() should call POST /scorecards/results', async () => {
      mockInstance.post.mockResolvedValue({
        data: { result: { id: 'r1', scorecardId: 'sc1', overallScore: 85 } },
      });

      const result = await client.scorecards.evaluate('sc1', {
        transcript: 'Hello, how can I help?',
        callId: 'call-1',
      });
      expect(mockInstance.post).toHaveBeenCalledWith('/scorecards/results', {
        scorecardId: 'sc1',
        callId: 'call-1',
        executionId: undefined,
      });
      expect(result.overallScore).toBe(85);
    });

    it('createResult() should call POST /scorecards/results', async () => {
      const dto = {
        scorecardId: 'sc1',
        overallScore: 90,
        status: 'completed',
      };
      mockInstance.post.mockResolvedValue({
        data: { result: { id: 'r2', ...dto } },
      });

      const result = await client.scorecards.createResult(dto);
      expect(mockInstance.post).toHaveBeenCalledWith('/scorecards/results', dto);
      expect(result.overallScore).toBe(90);
    });

    it('getResult() should call GET /scorecards/results/:id', async () => {
      mockInstance.get.mockResolvedValue({
        data: { result: { id: 'r1', overallScore: 85 } },
      });

      const result = await client.scorecards.getResult('r1');
      expect(mockInstance.get).toHaveBeenCalledWith('/scorecards/results/r1');
      expect(result.overallScore).toBe(85);
    });
  });

  // ==========================================================================
  // EXECUTIONS MODULE
  // ==========================================================================

  describe('executions', () => {
    it('get() should call GET /scenarios/executions/:id', async () => {
      mockInstance.get.mockResolvedValue({
        data: { execution: { id: 'e1', status: 'completed', scenarioId: 's1' } },
      });

      const result = await client.executions.get('e1');
      expect(mockInstance.get).toHaveBeenCalledWith('/scenarios/executions/e1');
      expect(result.status).toBe('completed');
    });

    it('list() should call GET /scenarios/executions', async () => {
      mockInstance.get.mockResolvedValue({
        data: { executions: [{ id: 'e1' }], total: 1 },
      });

      const result = await client.executions.list();
      expect(mockInstance.get).toHaveBeenCalledWith('/scenarios/executions', { params: {} });
      expect(result.executions).toHaveLength(1);
    });

    it('list() should pass filter params', async () => {
      mockInstance.get.mockResolvedValue({
        data: { executions: [], total: 0 },
      });

      await client.executions.list({
        scenarioId: 's1',
        status: 'completed',
        fromDate: '2025-01-01',
      });
      expect(mockInstance.get).toHaveBeenCalledWith('/scenarios/executions', {
        params: { scenarioId: 's1', status: 'completed', fromDate: '2025-01-01' },
      });
    });

    it('cancel() should call DELETE /scenarios/executions/:id', async () => {
      mockInstance.delete.mockResolvedValue({
        data: { deleted: true, message: 'Execution cancelled successfully' },
      });

      const result = await client.executions.cancel('e1');
      expect(mockInstance.delete).toHaveBeenCalledWith('/scenarios/executions/e1');
      expect(result.deleted).toBe(true);
    });

    it('retry() should call POST /scenarios/executions/:id/retry', async () => {
      mockInstance.post.mockResolvedValue({
        data: { execution: { id: 'e2', status: 'pending' } },
      });

      const result = await client.executions.retry('e1', { reason: 'Flaky test' });
      expect(mockInstance.post).toHaveBeenCalledWith('/scenarios/executions/e1/retry', {
        reason: 'Flaky test',
      });
      expect(result.status).toBe('pending');
    });

    it('retry() should send empty body when no options', async () => {
      mockInstance.post.mockResolvedValue({
        data: { execution: { id: 'e2', status: 'pending' } },
      });

      await client.executions.retry('e1');
      expect(mockInstance.post).toHaveBeenCalledWith('/scenarios/executions/e1/retry', {});
    });

    describe('waitForCompletion', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should return immediately if execution is already completed', async () => {
        mockInstance.get.mockResolvedValue({
          data: { execution: { id: 'e1', status: 'completed', overallScore: 95 } },
        });

        const promise = client.executions.waitForCompletion('e1');
        const result = await promise;

        expect(result.status).toBe('completed');
        expect(result.overallScore).toBe(95);
        expect(mockInstance.get).toHaveBeenCalledTimes(1);
      });

      it('should return immediately if execution has failed', async () => {
        mockInstance.get.mockResolvedValue({
          data: { execution: { id: 'e1', status: 'failed' } },
        });

        const result = await client.executions.waitForCompletion('e1');
        expect(result.status).toBe('failed');
      });

      it('should return immediately if execution is cancelled', async () => {
        mockInstance.get.mockResolvedValue({
          data: { execution: { id: 'e1', status: 'cancelled' } },
        });

        const result = await client.executions.waitForCompletion('e1');
        expect(result.status).toBe('cancelled');
      });

      it('should poll until completion', async () => {
        let callCount = 0;
        mockInstance.get.mockImplementation(() => {
          callCount++;
          if (callCount < 3) {
            return Promise.resolve({
              data: { execution: { id: 'e1', status: 'running' } },
            });
          }
          return Promise.resolve({
            data: { execution: { id: 'e1', status: 'completed', overallScore: 88 } },
          });
        });

        // Use real timers for this test since we need actual setTimeout resolution
        jest.useRealTimers();

        const result = await client.executions.waitForCompletion('e1', {
          intervalMs: 10,
          timeoutMs: 5000,
        });

        expect(result.status).toBe('completed');
        expect(callCount).toBe(3);
      });

      it('should throw EvalTimeoutError when timeout is exceeded', async () => {
        mockInstance.get.mockResolvedValue({
          data: { execution: { id: 'e1', status: 'running' } },
        });

        // Use real timers with a very short timeout
        jest.useRealTimers();

        await expect(
          client.executions.waitForCompletion('e1', {
            intervalMs: 10,
            timeoutMs: 50,
          }),
        ).rejects.toThrow(EvalTimeoutError);
      });

      it('should use custom interval and timeout', async () => {
        let callCount = 0;
        mockInstance.get.mockImplementation(() => {
          callCount++;
          if (callCount < 2) {
            return Promise.resolve({
              data: { execution: { id: 'e1', status: 'pending' } },
            });
          }
          return Promise.resolve({
            data: { execution: { id: 'e1', status: 'completed' } },
          });
        });

        jest.useRealTimers();

        const result = await client.executions.waitForCompletion('e1', {
          intervalMs: 5,
          timeoutMs: 10000,
        });

        expect(result.status).toBe('completed');
      });
    });
  });

  // ==========================================================================
  // UNWRAP RESPONSE WITH WRAPPED DATA
  // ==========================================================================

  describe('response unwrapping with { success, data } wrapper', () => {
    it('scenarios.get() should unwrap success wrapper', async () => {
      mockInstance.get.mockResolvedValue({
        data: { success: true, data: { scenario: { id: 's1', name: 'Wrapped' } } },
      });

      const result = await client.scenarios.get('s1');
      expect(result.name).toBe('Wrapped');
    });

    it('personas.list() should unwrap success wrapper', async () => {
      mockInstance.get.mockResolvedValue({
        data: {
          success: true,
          data: { personas: [{ id: 'p1' }], total: 1, pagination: { page: 1 } },
        },
      });

      const result = await client.personas.list();
      expect(result.personas).toHaveLength(1);
    });
  });
});
