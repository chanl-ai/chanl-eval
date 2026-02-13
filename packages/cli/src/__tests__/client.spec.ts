import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock axios
jest.mock('axios', () => {
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };

  const mockAxios: any = {
    create: jest.fn(() => mockAxiosInstance),
    isAxiosError: jest.fn(),
    __mockInstance: mockAxiosInstance,
  };

  return {
    __esModule: true,
    default: mockAxios,
  };
});

describe('Client', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  function requireFresh() {
    // Clear relevant modules
    const clientPath = require.resolve('../client');
    const configPath = require.resolve('../config');
    delete require.cache[clientPath];
    delete require.cache[configPath];
    return require('../client') as typeof import('../client');
  }

  function requireConfig() {
    const configPath = require.resolve('../config');
    delete require.cache[configPath];
    return require('../config') as typeof import('../config');
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chanl-cli-client-test-'));
    originalEnv = process.env.CHANL_CONFIG_DIR;
    process.env.CHANL_CONFIG_DIR = tmpDir;
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CHANL_CONFIG_DIR = originalEnv;
    } else {
      delete process.env.CHANL_CONFIG_DIR;
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createClient', () => {
    it('creates axios client with base URL from config', () => {
      const { saveConfig } = requireConfig();
      saveConfig({ server: 'http://test-server:8005', apiKey: '' });

      const { createClient } = requireFresh();
      createClient();

      const mockedAxios = axios as any;
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://test-server:8005',
        }),
      );
    });

    it('includes X-API-Key header when apiKey is set', () => {
      const { saveConfig } = requireConfig();
      saveConfig({ server: 'http://test:8005', apiKey: 'secret-key-123' });

      const { createClient } = requireFresh();
      createClient();

      const mockedAxios = axios as any;
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'secret-key-123',
          }),
        }),
      );
    });

    it('does not include X-API-Key header when apiKey is empty', () => {
      const { saveConfig } = requireConfig();
      saveConfig({ server: 'http://test:8005', apiKey: '' });

      const { createClient } = requireFresh();
      createClient();

      const mockedAxios = axios as any;
      const callArgs = mockedAxios.create.mock.calls[0][0];
      expect(callArgs.headers).not.toHaveProperty('X-API-Key');
    });

    it('throws when server URL is not configured', () => {
      const { saveConfig } = requireConfig();
      saveConfig({ server: '', apiKey: '' });

      const { createClient } = requireFresh();
      expect(() => createClient()).toThrow('Server URL not configured');
    });
  });

  describe('get', () => {
    it('calls axios.get with the correct path', async () => {
      const { saveConfig } = requireConfig();
      saveConfig({ server: 'http://test:8005', apiKey: 'key-123' });

      const { get } = requireFresh();
      const mockedAxios = axios as any;
      mockedAxios.__mockInstance.get.mockResolvedValue({
        data: { scenarios: [] },
      });

      const result = await get('/scenarios');

      expect(mockedAxios.__mockInstance.get).toHaveBeenCalledWith(
        '/scenarios',
        { params: undefined },
      );
      expect(result).toEqual({ scenarios: [] });
    });

    it('passes query params correctly', async () => {
      const { saveConfig } = requireConfig();
      saveConfig({ server: 'http://test:8005', apiKey: 'key' });

      const { get } = requireFresh();
      const mockedAxios = axios as any;
      mockedAxios.__mockInstance.get.mockResolvedValue({
        data: { personas: [] },
      });

      await get('/personas', { emotion: 'frustrated', page: '1' });

      expect(mockedAxios.__mockInstance.get).toHaveBeenCalledWith(
        '/personas',
        { params: { emotion: 'frustrated', page: '1' } },
      );
    });
  });

  describe('post', () => {
    it('calls axios.post with path and body', async () => {
      const { saveConfig } = requireConfig();
      saveConfig({ server: 'http://test:8005', apiKey: 'key' });

      const { post } = requireFresh();
      const mockedAxios = axios as any;
      mockedAxios.__mockInstance.post.mockResolvedValue({
        data: { persona: { id: '123', name: 'Test' } },
      });

      const result = await post('/personas', { name: 'Test', emotion: 'calm' });

      expect(mockedAxios.__mockInstance.post).toHaveBeenCalledWith(
        '/personas',
        { name: 'Test', emotion: 'calm' },
      );
      expect(result).toEqual({ persona: { id: '123', name: 'Test' } });
    });
  });

  describe('put', () => {
    it('calls axios.put with path and body', async () => {
      const { saveConfig } = requireConfig();
      saveConfig({ server: 'http://test:8005', apiKey: 'key' });

      const { put } = requireFresh();
      const mockedAxios = axios as any;
      mockedAxios.__mockInstance.put.mockResolvedValue({
        data: { scorecard: { id: '456' } },
      });

      const result = await put('/scorecards/456', { name: 'Updated' });

      expect(mockedAxios.__mockInstance.put).toHaveBeenCalledWith(
        '/scorecards/456',
        { name: 'Updated' },
      );
      expect(result).toEqual({ scorecard: { id: '456' } });
    });
  });

  describe('del', () => {
    it('calls axios.delete with path', async () => {
      const { saveConfig } = requireConfig();
      saveConfig({ server: 'http://test:8005', apiKey: 'key' });

      const { del } = requireFresh();
      const mockedAxios = axios as any;
      mockedAxios.__mockInstance.delete.mockResolvedValue({
        data: { deleted: true },
      });

      const result = await del('/scorecards/456');

      expect(mockedAxios.__mockInstance.delete).toHaveBeenCalledWith(
        '/scorecards/456',
      );
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('formatError', () => {
    it('formats connection refused errors', () => {
      const mockedAxios = axios as any;
      mockedAxios.isAxiosError.mockReturnValue(true);

      const { formatError } = requireFresh();
      const err = {
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED',
        config: { baseURL: 'http://localhost:18005' },
        isAxiosError: true,
      };

      const message = formatError(err);
      expect(message).toContain('Connection refused');
    });

    it('formats HTTP error responses', () => {
      const mockedAxios = axios as any;
      mockedAxios.isAxiosError.mockReturnValue(true);

      const { formatError } = requireFresh();
      const err = {
        response: {
          status: 404,
          data: { message: 'Scenario not found' },
        },
        message: 'Request failed with status code 404',
        isAxiosError: true,
      };

      const message = formatError(err);
      expect(message).toBe('HTTP 404: Scenario not found');
    });

    it('formats plain Error objects', () => {
      const mockedAxios = axios as any;
      mockedAxios.isAxiosError.mockReturnValue(false);

      const { formatError } = requireFresh();
      const message = formatError(new Error('Something went wrong'));
      expect(message).toBe('Something went wrong');
    });
  });
});
