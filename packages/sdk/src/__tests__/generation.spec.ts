import axios from 'axios';
import { EvalClient, unwrapResponse } from '../client';

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

describe('GenerationModule', () => {
  let mockInstance: ReturnType<typeof createMockAxiosInstance>;
  let client: EvalClient;

  beforeEach(() => {
    mockInstance = createMockAxiosInstance();
    mockedAxios.create.mockReturnValue(mockInstance);
    mockedAxios.isAxiosError.mockImplementation((error: any) => {
      return error?.isAxiosError === true;
    });

    client = new EvalClient({
      baseUrl: 'http://localhost:18005',
      apiKey: 'test-api-key',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // preview()
  // ==========================================================================

  describe('preview()', () => {
    it('should send POST /generation/preview with correct body', async () => {
      const suite = {
        scenarios: [
          { name: 'Billing inquiry', prompt: 'Customer asks about a charge', difficulty: 'easy' },
        ],
        personas: [
          { name: 'Frustrated Customer', emotion: 'frustrated' },
        ],
        scorecard: {
          name: 'Support Quality',
          criteria: [{ type: 'binary', name: 'Greeting', description: 'Agent greets customer' }],
        },
        summary: 'Customer support test suite',
        domain: 'customer-support',
      };

      mockInstance.post.mockResolvedValue({
        data: { suite },
      });

      const options = {
        systemPrompt: 'You are a helpful support agent',
        count: 5,
        difficulties: ['easy', 'medium'] as ('easy' | 'medium')[],
        includeAdversarial: true,
        domain: 'support',
      };

      const result = await client.generation.preview(options);

      expect(mockInstance.post).toHaveBeenCalledWith('/generation/preview', options);
      expect(result).toEqual(suite);
    });

    it('should unwrap { success, data } wrapper for preview', async () => {
      const suite = {
        scenarios: [],
        personas: [],
        scorecard: { name: 'Empty', criteria: [] },
        summary: 'Empty suite',
        domain: 'general',
      };

      mockInstance.post.mockResolvedValue({
        data: { success: true, data: { suite } },
      });

      const result = await client.generation.preview({
        systemPrompt: 'You are an agent',
      });

      expect(result).toEqual(suite);
    });
  });

  // ==========================================================================
  // fromPrompt()
  // ==========================================================================

  describe('fromPrompt()', () => {
    it('should send POST /generation/from-prompt with correct body', async () => {
      const persistResult = {
        scenarioIds: ['s1', 's2', 's3'],
        personaIds: ['p1', 'p2'],
        scorecardId: 'sc1',
        summary: 'Generated 3 scenarios for customer support',
        domain: 'customer-support',
      };

      mockInstance.post.mockResolvedValue({
        data: { result: persistResult },
      });

      const options = {
        systemPrompt: 'You are a customer support agent for an e-commerce company',
        count: 3,
        difficulties: ['easy', 'hard'] as ('easy' | 'hard')[],
        includeAdversarial: false,
      };

      const result = await client.generation.fromPrompt(options);

      expect(mockInstance.post).toHaveBeenCalledWith('/generation/from-prompt', options);
      expect(result).toEqual(persistResult);
    });

    it('should unwrap { success, data } wrapper for fromPrompt', async () => {
      const persistResult = {
        scenarioIds: ['s1'],
        personaIds: ['p1'],
        scorecardId: null,
        summary: 'Generated test suite',
        domain: 'sales',
      };

      mockInstance.post.mockResolvedValue({
        data: { success: true, data: { result: persistResult } },
      });

      const result = await client.generation.fromPrompt({
        systemPrompt: 'You are a sales agent',
      });

      expect(result).toEqual(persistResult);
    });
  });
});
