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

describe('chanl test command', () => {
  let tmpDir: string;
  let testsDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chanl-cli-test-cmd-'));
    testsDir = path.join(tmpDir, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });
    originalEnv = process.env.CHANL_CONFIG_DIR;

    const configDir = path.join(tmpDir, '.chanl');
    fs.mkdirSync(configDir, { recursive: true });
    process.env.CHANL_CONFIG_DIR = configDir;

    // Write a config with openai key so provider resolves
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({
        server: 'http://localhost:18005',
        apiKey: 'test-key',
        provider: 'openai',
        openaiApiKey: 'sk-test-key',
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

  function createFreshProgram() {
    for (const key of Object.keys(require.cache)) {
      if (key.includes('chanl-eval/packages/cli/src/')) {
        delete require.cache[key];
      }
    }
    const { createProgram } = require('../index') as typeof import('../index');
    return createProgram();
  }

  function writeTestYaml(filename: string, content: string): string {
    const filePath = path.join(testsDir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  describe('YAML parsing', () => {
    it('rejects test file without scenario field', async () => {
      writeTestYaml(
        'bad.yaml',
        `assertions:\n  - type: keyword\n    must_include: ["test"]\n`,
      );

      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation();
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit');
      }) as any);

      const program = createFreshProgram();

      try {
        await program.parseAsync([
          'node',
          'chanl',
          'test',
          path.join(testsDir, 'bad.yaml'),
        ]);
      } catch {
        // expected
      }

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join(' ');
      expect(output).toContain('missing required field "scenario"');

      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('rejects test file without assertions field', async () => {
      writeTestYaml('bad2.yaml', `scenario: test-scenario\n`);

      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation();
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit');
      }) as any);

      const program = createFreshProgram();

      try {
        await program.parseAsync([
          'node',
          'chanl',
          'test',
          path.join(testsDir, 'bad2.yaml'),
        ]);
      } catch {
        // expected
      }

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join(' ');
      expect(output).toContain('missing required field "assertions"');

      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('rejects test file with empty assertions array', async () => {
      writeTestYaml(
        'bad3.yaml',
        `scenario: test-scenario\nassertions: []\n`,
      );

      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation();
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit');
      }) as any);

      const program = createFreshProgram();

      try {
        await program.parseAsync([
          'node',
          'chanl',
          'test',
          path.join(testsDir, 'bad3.yaml'),
        ]);
      } catch {
        // expected
      }

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join(' ');
      expect(output).toContain('has no assertions');

      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });

  describe('execution flow', () => {
    const completedExecution = {
      execution: {
        executionId: 'exec-123',
        status: 'completed',
        duration: 3000,
        overallScore: 80,
        stepResults: [
          {
            stepId: 'turn-0-agent',
            actualResponse: 'I can help with your refund policy question.',
            duration: 800,
            toolCalls: [{ name: 'check_order' }],
          },
        ],
      },
    };

    it('runs a single test file with passing assertions', async () => {
      const testFile = writeTestYaml(
        'pass.yaml',
        [
          'scenario: "507f1f77bcf86cd799439011"', // ObjectId so no slug lookup
          'promptId: "507f1f77bcf86cd799439099"',
          'assertions:',
          '  - type: keyword',
          '    must_include: ["refund"]',
          '    description: "Mentions refund"',
          '  - type: response_time',
          '    max_seconds: 5',
          '    description: "Fast response"',
        ].join('\n'),
      );

      const mockedAxios = axios as any;
      // GET /scenarios/:id
      mockedAxios.__mockInstance.get.mockImplementation((url: string) => {
        if (url.includes('/scenarios/507f1f77bcf86cd799439011')) {
          return Promise.resolve({
            data: {
              scenario: { id: '507f1f77bcf86cd799439011', name: 'Test Refund' },
            },
          });
        }
        // GET /scenarios/executions/:id (polling)
        if (url.includes('/scenarios/executions/')) {
          return Promise.resolve({ data: completedExecution });
        }
        return Promise.reject(new Error(`Unexpected GET: ${url}`));
      });

      // POST /scenarios/:id/execute
      mockedAxios.__mockInstance.post.mockResolvedValue({
        data: { execution: { executionId: 'exec-123' } },
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      await program.parseAsync(['node', 'chanl', 'test', testFile]);

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('Mentions refund');
      expect(output).toContain('Fast response');

      consoleSpy.mockRestore();
    });

    it('runs all yaml files in a directory', async () => {
      writeTestYaml(
        'test-a.yaml',
        [
          'scenario: "507f1f77bcf86cd799439011"',
          'promptId: "507f1f77bcf86cd799439099"',
          'assertions:',
          '  - type: keyword',
          '    must_include: ["refund"]',
        ].join('\n'),
      );
      writeTestYaml(
        'test-b.yaml',
        [
          'scenario: "507f1f77bcf86cd799439011"',
          'promptId: "507f1f77bcf86cd799439099"',
          'assertions:',
          '  - type: score',
          '    min_score: 70',
        ].join('\n'),
      );

      const mockedAxios = axios as any;
      mockedAxios.__mockInstance.get.mockImplementation((url: string) => {
        if (url.includes('/scenarios/507f1f77bcf86cd799439011')) {
          return Promise.resolve({
            data: {
              scenario: { id: '507f1f77bcf86cd799439011', name: 'Test' },
            },
          });
        }
        if (url.includes('/scenarios/executions/')) {
          return Promise.resolve({ data: completedExecution });
        }
        return Promise.reject(new Error(`Unexpected GET: ${url}`));
      });
      mockedAxios.__mockInstance.post.mockResolvedValue({
        data: { execution: { executionId: 'exec-123' } },
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      await program.parseAsync(['node', 'chanl', 'test', testsDir]);

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
      // Should show 2 tests
      expect(output).toContain('2 test');

      consoleSpy.mockRestore();
    });

    it('outputs JSON when --json flag is set', async () => {
      writeTestYaml(
        'json-test.yaml',
        [
          'scenario: "507f1f77bcf86cd799439011"',
          'promptId: "507f1f77bcf86cd799439099"',
          'assertions:',
          '  - type: keyword',
          '    must_include: ["refund"]',
          '    description: "Mentions refund"',
        ].join('\n'),
      );

      const mockedAxios = axios as any;
      mockedAxios.__mockInstance.get.mockImplementation((url: string) => {
        if (url.includes('/scenarios/507f1f77bcf86cd799439011')) {
          return Promise.resolve({
            data: {
              scenario: { id: '507f1f77bcf86cd799439011', name: 'Test' },
            },
          });
        }
        if (url.includes('/scenarios/executions/')) {
          return Promise.resolve({ data: completedExecution });
        }
        return Promise.reject(new Error(`Unexpected GET: ${url}`));
      });
      mockedAxios.__mockInstance.post.mockResolvedValue({
        data: { execution: { executionId: 'exec-123' } },
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      await program.parseAsync([
        'node',
        'chanl',
        'test',
        path.join(testsDir, 'json-test.yaml'),
        '--json',
      ]);

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
      const parsed = JSON.parse(output);
      expect(parsed.tests).toBeDefined();
      expect(parsed.summary).toBeDefined();
      expect(parsed.summary.assertions.total).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    it('resolves scenario by slug lookup', async () => {
      writeTestYaml(
        'slug-test.yaml',
        [
          'scenario: angry-customer-refund',
          'promptId: "507f1f77bcf86cd799439099"',
          'assertions:',
          '  - type: keyword',
          '    must_include: ["help"]',
        ].join('\n'),
      );

      const mockedAxios = axios as any;
      mockedAxios.__mockInstance.get.mockImplementation((url: string) => {
        // Slug lookup — GET /scenarios?limit=200
        if (url === '/scenarios') {
          return Promise.resolve({
            data: {
              scenarios: [
                {
                  id: 'abc123abc123abc123abc123',
                  name: 'Angry Customer Refund',
                },
              ],
            },
          });
        }
        // Polling
        if (url.includes('/scenarios/executions/')) {
          return Promise.resolve({
            data: {
              execution: {
                executionId: 'exec-slug',
                status: 'completed',
                overallScore: 90,
                stepResults: [
                  {
                    stepId: 'turn-0-agent',
                    actualResponse: 'I can help you.',
                    duration: 500,
                  },
                ],
              },
            },
          });
        }
        return Promise.reject(new Error(`Unexpected GET: ${url}`));
      });
      mockedAxios.__mockInstance.post.mockResolvedValue({
        data: { execution: { executionId: 'exec-slug' } },
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const program = createFreshProgram();

      await program.parseAsync([
        'node',
        'chanl',
        'test',
        path.join(testsDir, 'slug-test.yaml'),
      ]);

      // Should have posted to the resolved scenario ID with promptId
      expect(mockedAxios.__mockInstance.post).toHaveBeenCalledWith(
        '/scenarios/abc123abc123abc123abc123/execute',
        expect.objectContaining({ promptId: '507f1f77bcf86cd799439099' }),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('test command is registered', () => {
    it('shows test in help output', () => {
      const program = createFreshProgram();
      const helpText = program.helpInformation();
      expect(helpText).toContain('test');
    });
  });
});
