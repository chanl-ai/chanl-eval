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

describe('chanl generate', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chanl-cli-gen-test-'));
    originalEnv = process.env.CHANL_CONFIG_DIR;
    process.env.CHANL_CONFIG_DIR = tmpDir;

    // Write a config so commands have something to work with
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({ server: 'http://localhost:18005/api/v1', apiKey: 'test-key' }),
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

  it('--preview calls POST /generation/preview with correct body', async () => {
    const mockedAxios = axios as any;
    mockedAxios.__mockInstance.post.mockResolvedValue({
      data: {
        suite: {
          domain: 'customer-support',
          summary: 'Test suite for customer support agent',
          scenarios: [
            { name: 'Billing inquiry', prompt: 'Customer asks about billing', difficulty: 'easy' },
          ],
          personas: [
            { name: 'Frustrated Customer', emotion: 'frustrated', behavior: { cooperationLevel: 'cooperative' } },
          ],
          scorecard: {
            name: 'Support Quality',
            criteria: [{ type: 'binary', name: 'Greeting', description: 'Agent greets customer' }],
          },
        },
      },
    });

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const program = createFreshProgram();

    await program.parseAsync([
      'node', 'chanl', 'generate',
      '--from-prompt', 'You are a helpful customer support agent',
      '--preview',
    ]);

    expect(mockedAxios.__mockInstance.post).toHaveBeenCalledWith(
      '/generation/preview',
      expect.objectContaining({
        systemPrompt: 'You are a helpful customer support agent',
        count: 10,
        difficulties: ['easy', 'medium', 'hard'],
        includeAdversarial: false,
      }),
    );
    consoleSpy.mockRestore();
  });

  it('without --preview calls POST /generation/from-prompt', async () => {
    const mockedAxios = axios as any;
    mockedAxios.__mockInstance.post.mockResolvedValue({
      data: {
        result: {
          scenarioIds: ['s1', 's2'],
          personaIds: ['p1'],
          scorecardId: 'sc1',
          domain: 'customer-support',
          summary: 'Generated test suite',
        },
      },
    });

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const program = createFreshProgram();

    await program.parseAsync([
      'node', 'chanl', 'generate',
      '--from-prompt', 'You are a helpful customer support agent',
    ]);

    expect(mockedAxios.__mockInstance.post).toHaveBeenCalledWith(
      '/generation/from-prompt',
      expect.objectContaining({
        systemPrompt: 'You are a helpful customer support agent',
        count: 10,
        difficulties: ['easy', 'medium', 'hard'],
        includeAdversarial: false,
      }),
    );
    consoleSpy.mockRestore();
  });

  it('--count 5 passes count=5 in request body', async () => {
    const mockedAxios = axios as any;
    mockedAxios.__mockInstance.post.mockResolvedValue({
      data: {
        result: {
          scenarioIds: ['s1', 's2', 's3', 's4', 's5'],
          personaIds: ['p1'],
          scorecardId: 'sc1',
          domain: 'sales',
          summary: 'Generated 5 scenarios',
        },
      },
    });

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const program = createFreshProgram();

    await program.parseAsync([
      'node', 'chanl', 'generate',
      '--from-prompt', 'You are a sales agent',
      '--count', '5',
    ]);

    expect(mockedAxios.__mockInstance.post).toHaveBeenCalledWith(
      '/generation/from-prompt',
      expect.objectContaining({
        count: 5,
      }),
    );
    consoleSpy.mockRestore();
  });

  it('--adversarial passes includeAdversarial=true', async () => {
    const mockedAxios = axios as any;
    mockedAxios.__mockInstance.post.mockResolvedValue({
      data: {
        result: {
          scenarioIds: ['s1'],
          personaIds: ['p1'],
          scorecardId: null,
          domain: 'support',
          summary: 'Generated with adversarial scenarios',
        },
      },
    });

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const program = createFreshProgram();

    await program.parseAsync([
      'node', 'chanl', 'generate',
      '--from-prompt', 'You are a support agent',
      '--adversarial',
    ]);

    expect(mockedAxios.__mockInstance.post).toHaveBeenCalledWith(
      '/generation/from-prompt',
      expect.objectContaining({
        includeAdversarial: true,
      }),
    );
    consoleSpy.mockRestore();
  });

  it('--from-file reads file and uses content as systemPrompt', async () => {
    const promptFile = path.join(tmpDir, 'prompt.txt');
    fs.writeFileSync(promptFile, 'You are an expert billing support agent');

    const mockedAxios = axios as any;
    mockedAxios.__mockInstance.post.mockResolvedValue({
      data: {
        result: {
          scenarioIds: ['s1'],
          personaIds: ['p1'],
          scorecardId: 'sc1',
          domain: 'billing',
          summary: 'Billing support test suite',
        },
      },
    });

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const program = createFreshProgram();

    await program.parseAsync([
      'node', 'chanl', 'generate',
      '--from-file', promptFile,
    ]);

    expect(mockedAxios.__mockInstance.post).toHaveBeenCalledWith(
      '/generation/from-prompt',
      expect.objectContaining({
        systemPrompt: 'You are an expert billing support agent',
      }),
    );
    consoleSpy.mockRestore();
  });

  it('no prompt exits with error', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as any);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const stderrSpy = jest.spyOn(console, 'error').mockImplementation();

    const program = createFreshProgram();

    try {
      await program.parseAsync(['node', 'chanl', 'generate']);
    } catch {
      // Expected: process.exit is thrown
    }

    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    consoleSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});
