import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock axios globally before any imports
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
    isAxiosError: jest.fn().mockReturnValue(false),
    get: jest.fn(),
    __mockInstance: mockAxiosInstance,
  };

  return {
    __esModule: true,
    default: mockAxios,
  };
});

// Mock inquirer
jest.mock('inquirer', () => ({
  __esModule: true,
  default: {
    prompt: jest.fn(),
  },
}));

// Mock ora
jest.mock('ora', () => {
  const spinner = {
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    text: '',
  };
  return {
    __esModule: true,
    default: jest.fn(() => spinner),
  };
});

// Mock child_process for server commands
jest.mock('child_process', () => ({
  execFile: jest.fn(),
  execFileSync: jest.fn(),
  spawn: jest.fn().mockReturnValue({
    on: jest.fn(),
    kill: jest.fn(),
  }),
}));

import axios from 'axios';

describe('New CLI Commands', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chanl-cli-new-test-'));
    originalEnv = process.env.CHANL_CONFIG_DIR;
    process.env.CHANL_CONFIG_DIR = tmpDir;

    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({
        server: 'http://localhost:18005',
        apiKey: 'test-key',
        provider: 'http',
        httpEndpoint: 'http://localhost:19000',
        analytics: true,
        analyticsId: 'test-uuid-123',
      }),
    );

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
      // Ignore
    }
  });

  function clearModuleCache() {
    for (const key of Object.keys(require.cache)) {
      if (key.includes('chanl-eval/packages/cli/src/')) {
        delete require.cache[key];
      }
    }
  }

  function createFreshProgram() {
    clearModuleCache();
    const { createProgram } = require('../index') as typeof import('../index');
    return createProgram();
  }

  // =========================================================================
  // Analytics commands
  // =========================================================================
  describe('chanl analytics', () => {
    it('analytics status shows enabled', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      program.parse(['node', 'chanl', 'analytics', 'status']);

      const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(output).toContain('Analytics: enabled');
      consoleSpy.mockRestore();
    });

    it('analytics disable sets analytics to false', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      program.parse(['node', 'chanl', 'analytics', 'disable']);

      const configPath = path.join(tmpDir, 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.analytics).toBe(false);
      consoleSpy.mockRestore();
    });

    it('analytics enable sets analytics to true', () => {
      // First disable
      fs.writeFileSync(
        path.join(tmpDir, 'config.json'),
        JSON.stringify({ analytics: false }),
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      program.parse(['node', 'chanl', 'analytics', 'enable']);

      const configPath = path.join(tmpDir, 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.analytics).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  // =========================================================================
  // Analytics module (track)
  // =========================================================================
  describe('analytics track()', () => {
    it('track is a no-op when analytics is disabled', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'config.json'),
        JSON.stringify({ analytics: false }),
      );

      clearModuleCache();
      const { track, initAnalytics } =
        require('../analytics') as typeof import('../analytics');

      initAnalytics();
      // Should not throw
      track('test_event', { foo: 'bar' });
    });

    it('track does not throw when analytics is enabled', () => {
      clearModuleCache();
      const { track, initAnalytics } =
        require('../analytics') as typeof import('../analytics');

      initAnalytics();
      // Should not throw
      expect(() => track('test_event', { foo: 'bar' })).not.toThrow();
    });

    it('getAnalyticsId returns a string', () => {
      clearModuleCache();
      const { getAnalyticsId, initAnalytics } =
        require('../analytics') as typeof import('../analytics');

      initAnalytics();
      const id = getAnalyticsId();
      expect(typeof id).toBe('string');
    });
  });

  // =========================================================================
  // Config extended keys
  // =========================================================================
  describe('chanl config (extended keys)', () => {
    it('config set provider works', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      program.parse(['node', 'chanl', 'config', 'set', 'provider', 'openai']);

      const configPath = path.join(tmpDir, 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.provider).toBe('openai');
      consoleSpy.mockRestore();
    });

    it('config set analytics works with boolean values', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      program.parse([
        'node',
        'chanl',
        'config',
        'set',
        'analytics',
        'false',
      ]);

      const configPath = path.join(tmpDir, 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.analytics).toBe(false);
      consoleSpy.mockRestore();
    });

    it('config list shows all keys including new ones', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      program.parse(['node', 'chanl', 'config', 'list']);

      const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(output).toContain('provider');
      expect(output).toContain('analytics');
      expect(output).toContain('openaiApiKey');
      expect(output).toContain('twilioAccountSid');
      consoleSpy.mockRestore();
    });

    it('config set masks secret keys in output', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      program.parse([
        'node',
        'chanl',
        'config',
        'set',
        'openaiApiKey',
        'sk-1234567890abcdef',
      ]);

      const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      // Should show masked version, not the full key
      expect(output).not.toContain('1234567890abcdef');
      expect(output).toContain('sk-1');
      consoleSpy.mockRestore();
    });
  });

  // =========================================================================
  // Run shortcut
  // =========================================================================
  describe('chanl run (shortcut)', () => {
    it('run --help shows correct options', () => {
      const mockWrite = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      const mockExit = jest
        .spyOn(process, 'exit')
        .mockImplementation(() => {
          throw new Error('process.exit');
        });

      const program = createFreshProgram();
      try {
        program.parse(['node', 'chanl', 'run', '--help']);
      } catch {
        // Expected
      }

      const output = mockWrite.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('--agent-id');
      expect(output).toContain('--all');
      expect(output).toContain('--dry-run');

      mockWrite.mockRestore();
      mockExit.mockRestore();
    });

    it('run --all makes GET /scenarios then executes', async () => {
      const mockedAxios = axios as any;
      mockedAxios.__mockInstance.get.mockResolvedValue({
        data: {
          scenarios: [
            { id: 'sc-1', name: 'Test Scenario', status: 'active' },
          ],
          total: 1,
        },
      });
      mockedAxios.__mockInstance.post.mockResolvedValue({
        data: {
          execution: {
            executionId: 'exec-1',
            status: 'completed',
          },
        },
      });

      // For polling, return completed status
      mockedAxios.__mockInstance.get.mockResolvedValueOnce({
        data: {
          scenarios: [{ id: 'sc-1', name: 'Test', status: 'active' }],
          total: 1,
        },
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      await program.parseAsync([
        'node',
        'chanl',
        'run',
        '--all',
        '--no-wait',
      ]);

      expect(mockedAxios.__mockInstance.get).toHaveBeenCalledWith(
        '/scenarios',
        expect.objectContaining({
          params: expect.objectContaining({ status: 'active' }),
        }),
      );
      consoleSpy.mockRestore();
    });
  });

  // =========================================================================
  // Scenarios create (new subcommand)
  // =========================================================================
  describe('chanl scenarios create', () => {
    it('makes POST /scenarios with correct payload', async () => {
      const mockedAxios = axios as any;
      mockedAxios.__mockInstance.post.mockResolvedValue({
        data: {
          id: 'sc-new',
          name: 'New Scenario',
          status: 'draft',
        },
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      await program.parseAsync([
        'node',
        'chanl',
        'scenarios',
        'create',
        '--name',
        'New Scenario',
        '--prompt',
        'Hello I need help',
        '--category',
        'support',
        '--tags',
        'test,demo',
      ]);

      expect(mockedAxios.__mockInstance.post).toHaveBeenCalledWith(
        '/scenarios',
        expect.objectContaining({
          name: 'New Scenario',
          prompt: 'Hello I need help',
          category: 'support',
          tags: ['test', 'demo'],
        }),
      );
      consoleSpy.mockRestore();
    });
  });

  // =========================================================================
  // Server commands (mocked Docker)
  // =========================================================================
  describe('chanl server', () => {
    it('server status shows server not running when health check fails', async () => {
      const mockedAxios = axios as any;
      mockedAxios.get.mockRejectedValue(new Error('ECONNREFUSED'));

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleErrSpy = jest
        .spyOn(console, 'error')
        .mockImplementation();
      const program = createFreshProgram();

      await program.parseAsync(['node', 'chanl', 'server', 'status']);

      const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(output).toContain('not running');
      consoleSpy.mockRestore();
      consoleErrSpy.mockRestore();
    });
  });

  // =========================================================================
  // Slugify matching (run by name)
  // =========================================================================
  describe('scenario name matching', () => {
    it('scenarios run resolves name to ID', async () => {
      const mockedAxios = axios as any;

      // First call: GET /scenarios to find by name
      mockedAxios.__mockInstance.get.mockResolvedValueOnce({
        data: {
          scenarios: [
            { id: 'sc-abc', name: 'Angry Customer Refund', status: 'draft' },
            {
              id: 'sc-def',
              name: 'Confused Billing Inquiry',
              status: 'draft',
            },
          ],
          total: 2,
        },
      });

      // Second call: POST execute
      mockedAxios.__mockInstance.post.mockResolvedValue({
        data: {
          execution: { executionId: 'exec-123', status: 'queued' },
        },
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      await program.parseAsync([
        'node',
        'chanl',
        'scenarios',
        'run',
        'angry-customer-refund',
        '--no-wait',
      ]);

      // Should resolve the name and POST to /scenarios/sc-abc/execute
      expect(mockedAxios.__mockInstance.post).toHaveBeenCalledWith(
        '/scenarios/sc-abc/execute',
        expect.any(Object),
      );
      consoleSpy.mockRestore();
    });
  });
});
