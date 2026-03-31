/**
 * Tests for the beautiful CLI execution display (US-04).
 *
 * Since printExecutionDetails and its helpers are private to scenarios.ts,
 * we test by importing the module and calling the function indirectly through
 * the results command, or by capturing console output from the exported
 * createProgram + parseAsync flow. For direct unit testing, we replicate
 * the key helper logic here and validate it independently.
 */

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

jest.mock('inquirer', () => ({
  __esModule: true,
  default: { prompt: jest.fn() },
}));

jest.mock('ora', () => {
  const spinner = {
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    text: '',
  };
  return { __esModule: true, default: jest.fn(() => spinner) };
});

import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Set up config dir before importing anything that reads config
const testConfigDir = path.join(os.tmpdir(), `chanl-cli-test-display-${Date.now()}`);
fs.mkdirSync(testConfigDir, { recursive: true });
fs.writeFileSync(
  path.join(testConfigDir, 'config.json'),
  JSON.stringify({ server: 'http://localhost:19000', provider: 'openai', openaiApiKey: 'sk-test' }),
);
process.env.CHANL_CONFIG_DIR = testConfigDir;

import { createProgram } from '../index';

const mockAxiosInstance = (axios as any).__mockInstance;

describe('Execution Display (US-04)', () => {
  let consoleSpy: jest.SpyInstance;
  let output: string[];

  beforeEach(() => {
    output = [];
    consoleSpy = jest.spyOn(console, 'log').mockImplementation((...args: any[]) => {
      output.push(args.map(String).join(' '));
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    (console.error as jest.Mock).mockRestore?.();
  });

  afterAll(() => {
    fs.rmSync(testConfigDir, { recursive: true, force: true });
    delete process.env.CHANL_CONFIG_DIR;
  });

  const mockExecution = {
    executionId: 'exec_test-123',
    status: 'completed',
    overallScore: 78,
    duration: 12500,
    startTime: '2026-03-31T10:00:00Z',
    stepResults: [
      {
        stepId: 'turn-0-persona',
        status: 'completed',
        actualResponse: 'Hi, I need help with my order.',
        duration: 0,
      },
      {
        stepId: 'turn-0-agent',
        status: 'completed',
        actualResponse: 'Hello! I would be happy to help you with your order. Could you please provide me with your order number?',
        duration: 1200,
      },
      {
        stepId: 'turn-1-persona',
        status: 'completed',
        actualResponse: 'Sure, it is ORD-12345.',
        duration: 0,
      },
      {
        stepId: 'turn-1-agent',
        status: 'completed',
        actualResponse: 'Thank you! I can see your order ORD-12345. It was shipped yesterday and should arrive by Friday. Is there anything else I can help with?',
        duration: 2400,
      },
      {
        stepId: 'turn-2-persona',
        status: 'completed',
        actualResponse: 'No, that is all. Thank you!',
        duration: 0,
      },
      {
        stepId: 'turn-2-agent',
        status: 'completed',
        actualResponse: 'You are welcome! Have a great day!',
        duration: 800,
      },
    ],
    metrics: {
      totalSteps: 6,
      completedSteps: 6,
      failedSteps: 0,
      skippedSteps: 0,
      responseTime: 1467,
      accuracy: 78,
      completion: 100,
    },
    errorMessages: [],
  };

  describe('scenarios results command', () => {
    it('should display transcript with Persona and Agent labels', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { execution: mockExecution },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'chanl', 'scenarios', 'results', 'exec_test-123']);

      const fullOutput = output.join('\n');
      expect(fullOutput).toContain('Transcript');
      expect(fullOutput).toContain('Persona');
      expect(fullOutput).toContain('Agent');
      expect(fullOutput).toContain('Hi, I need help with my order.');
    });

    it('should display score with visual bar', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { execution: mockExecution },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'chanl', 'scenarios', 'results', 'exec_test-123']);

      const fullOutput = output.join('\n');
      expect(fullOutput).toContain('Score');
      expect(fullOutput).toContain('78/100');
      // Check for block characters (the visual bar)
      expect(fullOutput).toMatch(/[\u2588\u2591]/);
    });

    it('should display latency stats', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { execution: mockExecution },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'chanl', 'scenarios', 'results', 'exec_test-123']);

      const fullOutput = output.join('\n');
      expect(fullOutput).toContain('Latency');
      expect(fullOutput).toContain('Avg response:');
      expect(fullOutput).toContain('Slowest turn:');
      expect(fullOutput).toContain('2400ms');
      expect(fullOutput).toContain('Total turns:');
    });

    it('should display agent latency inline with transcript', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { execution: mockExecution },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'chanl', 'scenarios', 'results', 'exec_test-123']);

      const fullOutput = output.join('\n');
      // Agent turns should show latency tag like [1200ms]
      expect(fullOutput).toContain('[1200ms]');
      expect(fullOutput).toContain('[2400ms]');
      expect(fullOutput).toContain('[800ms]');
    });

    it('should display cloud teaser footer', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { execution: mockExecution },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'chanl', 'scenarios', 'results', 'exec_test-123']);

      const fullOutput = output.join('\n');
      expect(fullOutput).toContain('chanl cloud');
      expect(fullOutput).toContain('chanl.ai');
    });

    it('should display metrics section', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { execution: mockExecution },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'chanl', 'scenarios', 'results', 'exec_test-123']);

      const fullOutput = output.join('\n');
      expect(fullOutput).toContain('Metrics');
      expect(fullOutput).toContain('6/6 completed');
      expect(fullOutput).toContain('Completion: 100%');
    });

    it('should display scorecard criteria results when available', async () => {
      const executionWithCriteria = {
        ...mockExecution,
        criteriaResults: [
          {
            criteriaName: 'Proper Greeting',
            criteriaKey: 'proper_greeting',
            type: 'prompt',
            result: true,
            passed: true,
            reasoning: 'Agent greeted customer professionally',
          },
          {
            criteriaName: 'Issue Resolution',
            criteriaKey: 'issue_resolution',
            type: 'prompt',
            result: 8,
            passed: true,
            reasoning: 'Agent resolved the order inquiry effectively',
          },
          {
            criteriaName: 'Response Time',
            criteriaKey: 'response_time',
            type: 'response_time',
            result: 1.5,
            passed: false,
            reasoning: 'Average response was above threshold',
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { execution: executionWithCriteria },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'chanl', 'scenarios', 'results', 'exec_test-123']);

      const fullOutput = output.join('\n');
      expect(fullOutput).toContain('Scorecard');
      expect(fullOutput).toContain('Proper Greeting');
      expect(fullOutput).toContain('Issue Resolution');
      expect(fullOutput).toContain('Response Time');
      // Check for pass/fail icons
      expect(fullOutput).toMatch(/\u2713/); // checkmark
      expect(fullOutput).toMatch(/\u2717/); // cross
    });

    it('should output JSON with --format json flag', async () => {
      const mockResult = { execution: mockExecution };
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: mockResult,
      });

      const program = createProgram();
      await program.parseAsync(['node', 'chanl', '-f', 'json', 'scenarios', 'results', 'exec_test-123']);

      const fullOutput = output.join('\n');
      // Should be valid JSON containing the execution data
      const parsed = JSON.parse(fullOutput);
      expect(parsed.execution).toBeDefined();
      expect(parsed.execution.executionId).toBe('exec_test-123');
      expect(parsed.execution.overallScore).toBe(78);
    });

    it('should output JSON with --json shorthand flag', async () => {
      const mockResult = { execution: mockExecution };
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: mockResult,
      });

      const program = createProgram();
      await program.parseAsync(['node', 'chanl', '--json', 'scenarios', 'results', 'exec_test-123']);

      const fullOutput = output.join('\n');
      const parsed = JSON.parse(fullOutput);
      expect(parsed.execution).toBeDefined();
      expect(parsed.execution.executionId).toBe('exec_test-123');
    });
  });

  describe('edge cases', () => {
    it('should handle execution with no stepResults gracefully', async () => {
      const emptyExecution = {
        executionId: 'exec_empty',
        status: 'completed',
        overallScore: 0,
        duration: 500,
        startTime: '2026-03-31T10:00:00Z',
        stepResults: [],
        metrics: null,
        errorMessages: [],
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { execution: emptyExecution },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'chanl', 'scenarios', 'results', 'exec_empty']);

      const fullOutput = output.join('\n');
      expect(fullOutput).toContain('Execution Results');
      expect(fullOutput).toContain('0/100');
      // Should not crash, no Transcript/Latency sections
      expect(fullOutput).not.toContain('Transcript');
      expect(fullOutput).not.toContain('Latency');
    });

    it('should handle failed execution with errors', async () => {
      const failedExecution = {
        executionId: 'exec_fail',
        status: 'failed',
        duration: 1000,
        startTime: '2026-03-31T10:00:00Z',
        stepResults: [],
        errorMessages: ['Connection timeout', 'Adapter not responding'],
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { execution: failedExecution },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'chanl', 'scenarios', 'results', 'exec_fail']);

      const fullOutput = output.join('\n');
      expect(fullOutput).toContain('Errors');
      expect(fullOutput).toContain('Connection timeout');
      expect(fullOutput).toContain('Adapter not responding');
    });

    it('should handle execution with zero-latency agent steps', async () => {
      const noLatencyExec = {
        executionId: 'exec_nolat',
        status: 'completed',
        overallScore: 50,
        duration: 5000,
        startTime: '2026-03-31T10:00:00Z',
        stepResults: [
          { stepId: 'turn-0-persona', actualResponse: 'Hello', duration: 0 },
          { stepId: 'turn-0-agent', actualResponse: 'Hi there', duration: 0 },
        ],
        errorMessages: [],
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { execution: noLatencyExec },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'chanl', 'scenarios', 'results', 'exec_nolat']);

      const fullOutput = output.join('\n');
      // Should display transcript but not latency stats (all durations are 0)
      expect(fullOutput).toContain('Transcript');
      expect(fullOutput).not.toContain('Latency');
    });

    it('should display a green bar for high scores', async () => {
      const highScoreExec = {
        executionId: 'exec_high',
        status: 'completed',
        overallScore: 95,
        duration: 3000,
        startTime: '2026-03-31T10:00:00Z',
        stepResults: [],
        errorMessages: [],
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { execution: highScoreExec },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'chanl', 'scenarios', 'results', 'exec_high']);

      const fullOutput = output.join('\n');
      expect(fullOutput).toContain('95/100');
      expect(fullOutput).toMatch(/[\u2588]/);
    });

    it('should display a red bar for low scores', async () => {
      const lowScoreExec = {
        executionId: 'exec_low',
        status: 'completed',
        overallScore: 20,
        duration: 3000,
        startTime: '2026-03-31T10:00:00Z',
        stepResults: [],
        errorMessages: [],
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { execution: lowScoreExec },
      });

      const program = createProgram();
      await program.parseAsync(['node', 'chanl', 'scenarios', 'results', 'exec_low']);

      const fullOutput = output.join('\n');
      expect(fullOutput).toContain('20/100');
    });
  });
});
