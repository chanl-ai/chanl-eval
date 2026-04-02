import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { DatasetService } from '../dataset/dataset.service';
import {
  ScenarioExecution,
  Scenario,
  Persona,
  ExecutionService,
} from '@chanl/scenarios-core';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const scenarioId = new Types.ObjectId().toString();
const personaId1 = new Types.ObjectId().toString();
const personaId2 = new Types.ObjectId().toString();

const completedExecution = {
  executionId: 'exec_test-001',
  scenarioId: new Types.ObjectId(scenarioId),
  personaId: new Types.ObjectId(personaId1),
  status: 'completed',
  overallScore: 85,
  duration: 12000,
  stepResults: [
    { stepId: 'turn-0-persona', status: 'completed', role: 'persona', actualResponse: 'I need help with my order.' },
    { stepId: 'turn-0-agent', status: 'completed', role: 'agent', actualResponse: 'I can help with that. What is your order number?' },
    { stepId: 'turn-1-persona', status: 'completed', role: 'persona', actualResponse: 'It is ORD-123.' },
    { stepId: 'turn-1-agent', status: 'completed', role: 'agent', actualResponse: 'I found your order. It will arrive tomorrow.' },
  ],
  createdAt: new Date(),
  toJSON() { return { ...this }; },
};

const lowScoreExecution = {
  ...completedExecution,
  executionId: 'exec_test-002',
  overallScore: 30,
  stepResults: [
    { stepId: 'turn-0-persona', status: 'completed', role: 'persona', actualResponse: 'I need help.' },
    { stepId: 'turn-0-agent', status: 'completed', role: 'agent', actualResponse: 'Check the website.' },
  ],
  toJSON() { return { ...this }; },
};

const activeScenario = {
  _id: new Types.ObjectId(scenarioId),
  name: 'Test Scenario',
  status: 'active',
  personaIds: [new Types.ObjectId(personaId1), new Types.ObjectId(personaId2)],
};

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockModel(docs: any[] = []) {
  const model = {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue(docs),
        lean: jest.fn().mockResolvedValue(docs),
      }),
      sort: jest.fn().mockReturnValue({
        cursor: jest.fn().mockReturnValue(asyncIterableFrom(docs)),
        lean: jest.fn().mockResolvedValue(docs),
      }),
      lean: jest.fn().mockResolvedValue(docs),
    }),
    findOne: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(docs[0] || null),
      }),
    }),
    findOneAndUpdate: jest.fn().mockResolvedValue(null),
    aggregate: jest.fn().mockResolvedValue([
      { _id: null, count: docs.length, avgScore: docs.length ? docs.reduce((s: number, d: any) => s + (d.overallScore || 0), 0) / docs.length : 0 },
    ]),
    countDocuments: jest.fn().mockResolvedValue(docs.length),
    findById: jest.fn().mockResolvedValue(null),
  };
  return model;
}

function asyncIterableFrom<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i >= items.length) return { done: true as const, value: undefined };
          return { done: false as const, value: items[i++] };
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DatasetService', () => {
  let service: DatasetService;
  let mockExecutionModel: ReturnType<typeof createMockModel>;
  let mockScenarioModel: ReturnType<typeof createMockModel>;
  let mockPersonaModel: ReturnType<typeof createMockModel>;
  let mockExecutionService: any;

  beforeEach(async () => {
    mockExecutionModel = createMockModel([completedExecution]);
    mockScenarioModel = createMockModel([activeScenario]);
    mockPersonaModel = createMockModel([]);
    mockExecutionService = {
      execute: jest.fn().mockResolvedValue('exec_new-001'),
    };

    // Override findById on scenario model
    mockScenarioModel.findById = jest.fn().mockResolvedValue(activeScenario);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatasetService,
        { provide: getModelToken(ScenarioExecution.name), useValue: mockExecutionModel },
        { provide: getModelToken(Scenario.name), useValue: mockScenarioModel },
        { provide: getModelToken(Persona.name), useValue: mockPersonaModel },
        { provide: ExecutionService, useValue: mockExecutionService },
      ],
    }).compile();

    service = module.get<DatasetService>(DatasetService);
  });

  // ── generateBatch ──────────────────────────────────────────────────

  describe('generateBatch', () => {
    it('should create executions for each persona linked to the scenario', async () => {
      const result = await service.generateBatch({
        scenarioId,
        promptId: 'prompt-1',
      });

      expect(result.batchId).toMatch(/^batch_/);
      expect(result.total).toBe(2); // 2 personas on the scenario
      expect(result.executionIds).toHaveLength(2);
      expect(mockExecutionService.execute).toHaveBeenCalledTimes(2);
    });

    it('should use provided personaIds when specified', async () => {
      const result = await service.generateBatch({
        scenarioId,
        promptId: 'prompt-1',
        personaIds: [personaId1],
      });

      expect(result.total).toBe(1);
      expect(mockExecutionService.execute).toHaveBeenCalledTimes(1);
      expect(mockExecutionService.execute).toHaveBeenCalledWith(
        scenarioId,
        expect.objectContaining({ personaId: personaId1 }),
      );
    });

    it('should limit to count when specified', async () => {
      const result = await service.generateBatch({
        scenarioId,
        promptId: 'prompt-1',
        count: 1,
      });

      expect(result.total).toBe(1);
    });

    it('should repeat personas when count exceeds available personas', async () => {
      const result = await service.generateBatch({
        scenarioId,
        promptId: 'prompt-1',
        count: 5,
      });

      expect(result.total).toBe(5);
      expect(mockExecutionService.execute).toHaveBeenCalledTimes(5);
    });

    it('should stamp batchId on each execution', async () => {
      await service.generateBatch({
        scenarioId,
        promptId: 'prompt-1',
      });

      expect(mockExecutionModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
      const firstCall = mockExecutionModel.findOneAndUpdate.mock.calls[0];
      expect(firstCall[1].$set.batchId).toMatch(/^batch_/);
    });

    it('should throw when scenario not found', async () => {
      mockScenarioModel.findById = jest.fn().mockResolvedValue(null);

      await expect(service.generateBatch({
        scenarioId: 'nonexistent',
        promptId: 'prompt-1',
      })).rejects.toThrow('not found');
    });

    it('should set triggeredBy to dataset:batchId', async () => {
      await service.generateBatch({
        scenarioId,
        promptId: 'prompt-1',
      });

      const call = mockExecutionService.execute.mock.calls[0];
      expect(call[1].triggeredBy).toMatch(/^dataset:batch_/);
    });
  });

  // ── getBatchStatus ─────────────────────────────────────────────────

  describe('getBatchStatus', () => {
    it('should return correct counts for a mixed batch', async () => {
      mockExecutionModel.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { status: 'completed' },
            { status: 'completed' },
            { status: 'running' },
            { status: 'failed' },
          ]),
        }),
      });

      const result = await service.getBatchStatus('batch_test');

      expect(result.total).toBe(4);
      expect(result.completed).toBe(2);
      expect(result.running).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.status).toBe('running'); // still has running
    });

    it('should report completed when all done', async () => {
      mockExecutionModel.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { status: 'completed' },
            { status: 'completed' },
          ]),
        }),
      });

      const result = await service.getBatchStatus('batch_test');
      expect(result.status).toBe('completed');
    });

    it('should report failed when all failed', async () => {
      mockExecutionModel.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { status: 'failed' },
            { status: 'failed' },
          ]),
        }),
      });

      const result = await service.getBatchStatus('batch_test');
      expect(result.status).toBe('failed');
    });

    it('should report partial when some completed and some failed', async () => {
      mockExecutionModel.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { status: 'completed' },
            { status: 'failed' },
          ]),
        }),
      });

      const result = await service.getBatchStatus('batch_test');
      expect(result.status).toBe('partial');
    });

    it('should throw when batch not found', async () => {
      mockExecutionModel.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(service.getBatchStatus('nonexistent')).rejects.toThrow('not found');
    });
  });

  // ── preview ────────────────────────────────────────────────────────

  describe('preview', () => {
    it('should return count, avgScore, and sample line', async () => {
      const result = await service.preview('openai');

      expect(result.count).toBe(1);
      expect(result.avgScore).toBeDefined();
      expect(result.format).toBe('openai');
    });

    it('should return valid OpenAI JSONL as sampleLine', async () => {
      const result = await service.preview('openai');

      if (result.sampleLine) {
        const parsed = JSON.parse(result.sampleLine);
        expect(parsed.messages).toBeDefined();
        expect(Array.isArray(parsed.messages)).toBe(true);
        // Should have user and assistant messages
        const roles = parsed.messages.map((m: any) => m.role);
        expect(roles).toContain('user');
        expect(roles).toContain('assistant');
      }
    });

    it('should return null sampleLine when no executions match', async () => {
      mockExecutionModel.aggregate = jest.fn().mockResolvedValue([]);
      mockExecutionModel.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await service.preview('openai');
      expect(result.count).toBe(0);
      expect(result.sampleLine).toBeNull();
    });
  });

  // ── exportLines ────────────────────────────────────────────────────

  describe('exportLines', () => {
    it('should yield JSONL lines for openai format', async () => {
      // Mock cursor to yield docs with toJSON
      mockExecutionModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          cursor: jest.fn().mockReturnValue(asyncIterableFrom([
            { ...completedExecution, toJSON() { return completedExecution; } },
          ])),
        }),
      });

      const lines: string[] = [];
      for await (const { line } of service.exportLines('openai')) {
        lines.push(line);
      }

      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.messages).toBeDefined();
    });

    it('should include tool definitions for openai-tools format', async () => {
      const execWithTools = {
        ...completedExecution,
        stepResults: [
          ...completedExecution.stepResults,
          {
            stepId: 'turn-2-tool',
            status: 'completed',
            role: 'tool' as const,
            actualResponse: '{"name":"lookup","result":{"found":true}}',
            toolCalls: [{ name: 'lookup', arguments: { id: '123' }, result: { found: true } }],
          },
        ],
        toJSON() { return { ...this }; },
      };

      mockExecutionModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          cursor: jest.fn().mockReturnValue(asyncIterableFrom([execWithTools])),
        }),
      });

      const lines: string[] = [];
      for await (const { line } of service.exportLines('openai-tools')) {
        lines.push(line);
      }

      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.messages.some((m: any) => m.role === 'tool')).toBe(true);
    });

    it('should yield ShareGPT format lines', async () => {
      mockExecutionModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          cursor: jest.fn().mockReturnValue(asyncIterableFrom([
            { ...completedExecution, toJSON() { return completedExecution; } },
          ])),
        }),
      });

      const lines: string[] = [];
      for await (const { line } of service.exportLines('sharegpt')) {
        lines.push(line);
      }

      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.conversations).toBeDefined();
      expect(parsed.conversations[0].from).toBe('human');
    });

    it('should skip executions with empty stepResults', async () => {
      const emptyExec = {
        ...completedExecution,
        stepResults: [],
        toJSON() { return { ...this }; },
      };

      mockExecutionModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          cursor: jest.fn().mockReturnValue(asyncIterableFrom([emptyExec])),
        }),
      });

      const lines: string[] = [];
      for await (const { line } of service.exportLines('openai')) {
        lines.push(line);
      }

      expect(lines).toHaveLength(0);
    });

    it('should include metadata when requested', async () => {
      mockExecutionModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          cursor: jest.fn().mockReturnValue(asyncIterableFrom([
            { ...completedExecution, toJSON() { return completedExecution; } },
          ])),
        }),
      });

      const results: Array<{ line: string; metadata?: string }> = [];
      for await (const item of service.exportLines('openai', undefined, { includeMetadata: true })) {
        results.push(item);
      }

      expect(results).toHaveLength(1);
      expect(results[0].metadata).toBeDefined();
      const meta = JSON.parse(results[0].metadata!);
      expect(meta.executionId).toBe('exec_test-001');
      expect(meta.score).toBe(85);
    });
  });

  // ── DPO export ─────────────────────────────────────────────────────

  describe('exportLines (dpo)', () => {
    function mockFindForDPO(docs: any[]) {
      // exportLines calls find().sort().cursor() first (for non-DPO path),
      // then inside the DPO branch calls find().sort().lean().
      // We need both shapes available on the same mock.
      mockExecutionModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          cursor: jest.fn().mockReturnValue(asyncIterableFrom([])),
          lean: jest.fn().mockResolvedValue(docs),
        }),
      });
    }

    it('should pair executions by score within same scenario', async () => {
      mockFindForDPO([completedExecution, lowScoreExecution]);

      const lines: string[] = [];
      for await (const { line } of service.exportLines('dpo')) {
        lines.push(line);
      }

      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.input).toBeDefined();
      expect(parsed.preferred_output).toBeDefined();
      expect(parsed.non_preferred_output).toBeDefined();
    });

    it('should not create pairs when only one execution per scenario', async () => {
      mockFindForDPO([completedExecution]);

      const lines: string[] = [];
      for await (const { line } of service.exportLines('dpo')) {
        lines.push(line);
      }

      expect(lines).toHaveLength(0);
    });
  });
});
