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

import axios from 'axios';

describe('Commands Integration', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chanl-cli-cmd-test-'));
    originalEnv = process.env.CHANL_CONFIG_DIR;
    process.env.CHANL_CONFIG_DIR = tmpDir;

    // Write a config so commands have something to work with
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({ server: 'http://localhost:18005', apiKey: 'test-key' }),
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

  function createFreshProgram() {
    // Clear caches to get fresh config reads
    for (const key of Object.keys(require.cache)) {
      if (key.includes('chanl-eval/packages/cli/src/')) {
        delete require.cache[key];
      }
    }
    const { createProgram } = require('../index') as typeof import('../index');
    return createProgram();
  }

  describe('chanl config', () => {
    it('config set writes a value', () => {
      const program = createFreshProgram();
      // Simulate: chanl config set server https://api.chanl.ai
      program.parse(['node', 'chanl', 'config', 'set', 'server', 'https://api.chanl.ai']);

      const configPath = path.join(tmpDir, 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.server).toBe('https://api.chanl.ai');
    });

    it('config get reads a value', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();
      program.parse(['node', 'chanl', 'config', 'get', 'server']);

      expect(consoleSpy).toHaveBeenCalledWith('http://localhost:18005');
      consoleSpy.mockRestore();
    });
  });

  describe('chanl scenarios list', () => {
    it('makes GET /scenarios and prints a table', async () => {
      const mockedAxios = axios as any;
      mockedAxios.__mockInstance.get.mockResolvedValue({
        data: {
          scenarios: [
            {
              id: 'sc-1',
              name: 'Customer Complaint',
              category: 'support',
              difficulty: 'medium',
              status: 'active',
              personaIds: ['p1', 'p2'],
            },
          ],
          total: 1,
          pagination: { page: 1, totalPages: 1, total: 1 },
        },
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      await program.parseAsync(['node', 'chanl', 'scenarios', 'list']);

      expect(mockedAxios.__mockInstance.get).toHaveBeenCalledWith(
        '/scenarios',
        expect.objectContaining({
          params: expect.objectContaining({ page: '1', limit: '20' }),
        }),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('chanl personas list', () => {
    it('makes GET /personas and prints results', async () => {
      const mockedAxios = axios as any;
      mockedAxios.__mockInstance.get.mockResolvedValue({
        data: {
          personas: [
            {
              id: 'p-1',
              name: 'Frustrated Customer',
              emotion: 'frustrated',
              language: 'english',
              gender: 'female',
              speechStyle: 'fast',
            },
          ],
          total: 1,
          pagination: { page: 1, totalPages: 1, total: 1 },
        },
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      await program.parseAsync(['node', 'chanl', 'personas', 'list']);

      expect(mockedAxios.__mockInstance.get).toHaveBeenCalledWith(
        '/personas',
        expect.objectContaining({
          params: expect.objectContaining({ page: '1', limit: '20' }),
        }),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('chanl personas create', () => {
    it('makes POST /personas with correct payload', async () => {
      const mockedAxios = axios as any;
      mockedAxios.__mockInstance.post.mockResolvedValue({
        data: {
          persona: {
            id: 'p-new',
            name: 'Angry Caller',
            emotion: 'frustrated',
          },
        },
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      await program.parseAsync([
        'node', 'chanl', 'personas', 'create',
        '--name', 'Angry Caller',
        '--emotion', 'frustrated',
      ]);

      expect(mockedAxios.__mockInstance.post).toHaveBeenCalledWith(
        '/personas',
        expect.objectContaining({
          name: 'Angry Caller',
          emotion: 'frustrated',
          gender: 'female',
          language: 'english',
          accent: 'american',
          speechStyle: 'normal',
        }),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('chanl scorecards list', () => {
    it('makes GET /scorecards', async () => {
      const mockedAxios = axios as any;
      mockedAxios.__mockInstance.get.mockResolvedValue({
        data: {
          scorecards: [
            {
              id: 'sc-1',
              name: 'Call Quality',
              status: 'active',
              passingThreshold: 70,
              scoringAlgorithm: 'weighted_average',
              tags: [],
            },
          ],
          total: 1,
          pagination: { page: 1, totalPages: 1, total: 1 },
        },
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      await program.parseAsync(['node', 'chanl', 'scorecards', 'list']);

      expect(mockedAxios.__mockInstance.get).toHaveBeenCalledWith(
        '/scorecards',
        expect.objectContaining({
          params: expect.objectContaining({ page: '1', limit: '20' }),
        }),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('chanl --version', () => {
    it('prints the version', () => {
      const mockWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const program = createFreshProgram();

      // Commander calls process.exit on --version, so we catch it
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit');
      });

      try {
        program.parse(['node', 'chanl', '--version']);
      } catch {
        // Expected: Commander calls process.exit
      }

      // Commander writes version to stdout
      const allOutput = mockWrite.mock.calls.map((c) => String(c[0])).join('');
      expect(allOutput).toContain('0.1.0');

      mockWrite.mockRestore();
      mockExit.mockRestore();
    });
  });
});
