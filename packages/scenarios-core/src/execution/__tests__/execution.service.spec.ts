import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ExecutionService } from '../execution.service';
import { QueueProducerService } from '../queue-producer.service';
import { ExecutionProcessor } from '../execution-processor';
import { AdapterRegistry } from '../../adapters/adapter-registry';
import { PersonaSimulatorService } from '../../simulator/persona-simulator.service';
import { EvaluationService } from '@chanl/scorecards-core';
import {
  Scenario,
  ScenarioSchema,
  ScenarioDocument,
} from '../../scenarios/schemas/scenario.schema';
import {
  ScenarioExecution,
  ScenarioExecutionSchema,
  ScenarioExecutionDocument,
} from '../../scenarios/schemas/scenario-execution.schema';
import {
  Persona,
  PersonaSchema,
  PersonaDocument,
} from '../../personas/schemas/persona.schema';
import {
  AgentAdapter,
  AgentAdapterConfig,
  AgentMessage,
  AgentResponse,
} from '../../adapters/agent-adapter.interface';
import { ToolFixtureService } from '../../tool-fixtures/tool-fixture.service';
import { MockResolver } from '../../tool-fixtures/mock-resolver.service';
import { ToolFixture, ToolFixtureSchema } from '../../tool-fixtures/schemas/tool-fixture.schema';
import { AgentConfigResolver } from '../agent-config-resolver';
import { PersonaStrategyRegistry } from '../persona-strategy-registry';

// ──────────────────────────────────────────────────────────────────────
// Mock adapter for testing the conversation loop
// ──────────────────────────────────────────────────────────────────────
class MockAdapter implements AgentAdapter {
  readonly name = 'Mock OpenAI';
  readonly type = 'openai';

  private connected = false;
  private callCount = 0;

  async connect(_config: AgentAdapterConfig): Promise<void> {
    this.connected = true;
    this.callCount = 0;
  }

  async sendMessage(
    _message: string,
    _history: AgentMessage[],
  ): Promise<AgentResponse> {
    if (!this.connected) {
      throw new Error('Mock adapter not connected');
    }
    this.callCount++;

    // Return different responses to simulate a short conversation
    if (this.callCount >= 3) {
      return {
        content: 'Thank you for calling. Have a great day! Goodbye.',
        latencyMs: 100,
      };
    }

    return {
      content: `Agent response #${this.callCount}. Is there anything else I can help with?`,
      latencyMs: 50 + this.callCount * 10,
    };
  }

  formatToolResult(toolCallId: string, _toolName: string, result: any): AgentMessage {
    return {
      role: 'user',
      content: typeof result === 'string' ? result : JSON.stringify(result),
      providerData: { tool_call_id: toolCallId, role: 'tool' },
    };
  }

  buildToolCallHistory(
    response: AgentResponse,
    resolvedResults: Array<{ id: string; name: string; result: any }>,
  ): AgentMessage[] {
    const messages: AgentMessage[] = [{ role: 'assistant', content: response.content || '' }];
    for (const r of resolvedResults) {
      messages.push(this.formatToolResult(r.id, r.name, r.result));
    }
    return messages;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Mock queue producer -- does not require real Redis
// ──────────────────────────────────────────────────────────────────────
const mockEnqueueExecution = jest.fn().mockResolvedValue({
  id: 'mock-job-id',
  data: {},
});
const mockGetQueueCounts = jest.fn().mockResolvedValue({
  waiting: 0,
  active: 0,
  completed: 0,
  failed: 0,
});

// Type for execution JSON that includes the virtual `id` field
type ExecutionJson = ScenarioExecution & { id: string };

describe('ExecutionService', () => {
  let service: ExecutionService;
  let scenarioModel: Model<ScenarioDocument>;
  let executionModel: Model<ScenarioExecutionDocument>;
  let personaModel: Model<PersonaDocument>;
  let mongod: MongoMemoryServer;
  let module: TestingModule;

  // Test data
  let scenarioId: string;
  let personaId: string;
  const testPromptId = new Types.ObjectId().toString();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Scenario.name, schema: ScenarioSchema },
          { name: ScenarioExecution.name, schema: ScenarioExecutionSchema },
          { name: Persona.name, schema: PersonaSchema },
        ]),
      ],
      providers: [
        ExecutionService,
        {
          provide: QueueProducerService,
          useValue: {
            enqueueExecution: mockEnqueueExecution,
            getQueueCounts: mockGetQueueCounts,
          },
        },
      ],
    }).compile();

    service = module.get<ExecutionService>(ExecutionService);
    scenarioModel = module.get<Model<ScenarioDocument>>(
      getModelToken(Scenario.name),
    );
    executionModel = module.get<Model<ScenarioExecutionDocument>>(
      getModelToken(ScenarioExecution.name),
    );
    personaModel = module.get<Model<PersonaDocument>>(
      getModelToken(Persona.name),
    );

    // Create test persona
    const persona = await personaModel.create({
      name: 'Test Persona',
      gender: 'female',
      emotion: 'friendly',
      language: 'english',
      accent: 'american',
      intentClarity: 'very clear',
      speechStyle: 'normal',
      backgroundNoise: false,
      allowInterruptions: true,
      createdBy: 'test',
      tags: [],
      isActive: true,
      isDefault: false,
      variables: {},
    });
    personaId = persona._id.toString();

    // Create test prompt (the agent under test)
    const connection = module.get<import('mongoose').Connection>('DatabaseConnection');
    await connection.db!.collection('prompts').insertOne({
      _id: new Types.ObjectId(testPromptId),
      name: 'Test Prompt',
      content: 'You are a test support agent.',
      status: 'active',
      tags: [],
      adapterConfig: { adapterType: 'openai', model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 512 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create test scenario (active)
    const scenario = await scenarioModel.create({
      name: 'Test Scenario',
      prompt: 'I need help with my order',
      category: 'support',
      difficulty: 'medium',
      status: 'active',
      personaIds: [new Types.ObjectId(personaId)],
      createdBy: 'test',
      tags: ['test'],
    });
    scenarioId = scenario._id.toString();
  });

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await executionModel.deleteMany({});
    mockEnqueueExecution.mockClear();
  });

  // ──────────────── execute() ────────────────

  describe('execute()', () => {
    it('should create an execution doc with status queued and enqueue a job', async () => {
      const executionId = await service.execute(scenarioId, { promptId: testPromptId });

      expect(executionId).toBeDefined();
      expect(executionId).toMatch(/^exec_/);

      // Verify execution doc was created
      const doc = await executionModel.findOne({ executionId });
      expect(doc).not.toBeNull();
      expect(doc!.status).toBe('queued');
      expect(doc!.scenarioId!.toString()).toBe(scenarioId);
      expect(doc!.triggeredBy).toBe('system');

      // Verify queue was called
      expect(mockEnqueueExecution).toHaveBeenCalledTimes(1);
      expect(mockEnqueueExecution).toHaveBeenCalledWith(
        executionId,
        scenarioId,
        expect.objectContaining({
          personaId,
          promptId: testPromptId,
        }),
      );
    });

    it('should pass options to the enqueue call', async () => {
      const executionId = await service.execute(scenarioId, {
        promptId: testPromptId,
        maxTurns: 5,
      });

      expect(mockEnqueueExecution).toHaveBeenCalledWith(
        executionId,
        scenarioId,
        expect.objectContaining({
          promptId: testPromptId,
          maxTurns: 5,
        }),
      );
    });

    it('should use custom personaId when provided', async () => {
      const customPersonaId = personaId;

      const executionId = await service.execute(scenarioId, {
        promptId: testPromptId,
        personaId: customPersonaId,
      });

      const doc = await executionModel.findOne({ executionId });
      expect(doc!.personaId!.toString()).toBe(customPersonaId);

      expect(mockEnqueueExecution).toHaveBeenCalledWith(
        executionId,
        scenarioId,
        expect.objectContaining({
          personaId: customPersonaId,
        }),
      );
    });

    it('should throw NotFoundException for non-existent scenario', async () => {
      const fakeId = new Types.ObjectId().toString();
      await expect(service.execute(fakeId, { promptId: testPromptId })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for non-active scenario', async () => {
      const draftScenario = await scenarioModel.create({
        name: 'Draft Scenario',
        prompt: 'Test',
        category: 'support',
        difficulty: 'easy',
        status: 'draft',
        personaIds: [new Types.ObjectId(personaId)],
        createdBy: 'test',
        tags: [],
      });

      await expect(
        service.execute(draftScenario._id.toString(), { promptId: testPromptId }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set triggeredBy from options', async () => {
      const executionId = await service.execute(scenarioId, {
        promptId: testPromptId,
        triggeredBy: 'user123',
      });

      const doc = await executionModel.findOne({ executionId });
      expect(doc!.triggeredBy).toBe('user123');
    });
  });

  // ──────────────── getExecution() ────────────────

  describe('getExecution()', () => {
    it('should return an execution by executionId', async () => {
      const executionId = await service.execute(scenarioId, { promptId: testPromptId });

      const result = (await service.getExecution(executionId)) as ExecutionJson;

      expect(result).toBeDefined();
      expect(result.executionId).toBe(executionId);
      expect(result.status).toBe('queued');
      expect(result.id).toBeDefined();
    });

    it('should throw NotFoundException for non-existent execution', async () => {
      await expect(
        service.getExecution('exec_nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

  });

  // ──────────────── listExecutions() ────────────────

  describe('listExecutions()', () => {
    it('should return all executions with total count', async () => {
      await service.execute(scenarioId, { promptId: testPromptId });
      await service.execute(scenarioId, { promptId: testPromptId });
      await service.execute(scenarioId, { promptId: testPromptId });

      const result = await service.listExecutions();

      expect(result.executions).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should filter by status', async () => {
      const execId1 = await service.execute(scenarioId, { promptId: testPromptId });
      await service.execute(scenarioId, { promptId: testPromptId });

      // Manually update one execution to 'completed'
      await executionModel.findOneAndUpdate(
        { executionId: execId1 },
        { status: 'completed' },
      );

      const result = await service.listExecutions({ status: 'queued' });

      expect(result.executions).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by scenarioId', async () => {
      // Create a second scenario
      const otherScenario = await scenarioModel.create({
        name: 'Other Scenario',
        prompt: 'Other prompt',
        category: 'sales',
        difficulty: 'easy',
        status: 'active',
        personaIds: [new Types.ObjectId(personaId)],
        createdBy: 'test',
        tags: [],
      });

      await service.execute(scenarioId, { promptId: testPromptId });
      await service.execute(otherScenario._id.toString(), { promptId: testPromptId });

      const result = await service.listExecutions({
        scenarioId,
      });

      expect(result.executions).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by personaId', async () => {
      const customPersonaId = new Types.ObjectId().toString();
      await service.execute(scenarioId, { promptId: testPromptId, personaId: customPersonaId });
      await service.execute(scenarioId, { promptId: testPromptId });

      const result = await service.listExecutions({
        personaId: customPersonaId,
      });

      expect(result.executions).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should apply pagination with limit', async () => {
      for (let i = 0; i < 5; i++) {
        await service.execute(scenarioId, { promptId: testPromptId });
      }

      const result = await service.listExecutions(
        undefined,
        { limit: 2, offset: 0 },
      );

      expect(result.executions).toHaveLength(2);
      expect(result.total).toBe(5);
    });

    it('should apply pagination with offset', async () => {
      for (let i = 0; i < 5; i++) {
        await service.execute(scenarioId, { promptId: testPromptId });
      }

      const result = await service.listExecutions(
        undefined,
        { limit: 2, offset: 3 },
      );

      expect(result.executions).toHaveLength(2);
      expect(result.total).toBe(5);
    });

    it('should return empty results when no executions match', async () => {
      const result = await service.listExecutions({ status: 'failed' });

      expect(result.executions).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ──────────────── cancelExecution() ────────────────

  describe('cancelExecution()', () => {
    it('should cancel a queued execution', async () => {
      const executionId = await service.execute(scenarioId, { promptId: testPromptId });

      await service.cancelExecution(executionId);

      const doc = await executionModel.findOne({ executionId });
      expect(doc!.status).toBe('cancelled');
      expect(doc!.endTime).toBeDefined();
    });

    it('should cancel a running execution', async () => {
      const executionId = await service.execute(scenarioId, { promptId: testPromptId });

      // Manually set to running
      await executionModel.findOneAndUpdate(
        { executionId },
        { status: 'running' },
      );

      await service.cancelExecution(executionId);

      const doc = await executionModel.findOne({ executionId });
      expect(doc!.status).toBe('cancelled');
    });

    it('should throw NotFoundException for non-existent execution', async () => {
      await expect(
        service.cancelExecution('exec_nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for completed execution', async () => {
      const executionId = await service.execute(scenarioId, { promptId: testPromptId });

      // Manually set to completed
      await executionModel.findOneAndUpdate(
        { executionId },
        { status: 'completed' },
      );

      await expect(
        service.cancelExecution(executionId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for failed execution', async () => {
      const executionId = await service.execute(scenarioId, { promptId: testPromptId });

      await executionModel.findOneAndUpdate(
        { executionId },
        { status: 'failed' },
      );

      await expect(
        service.cancelExecution(executionId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for already cancelled execution', async () => {
      const executionId = await service.execute(scenarioId, { promptId: testPromptId });

      await service.cancelExecution(executionId);

      // Attempting again should fail
      await expect(
        service.cancelExecution(executionId),
      ).rejects.toThrow(BadRequestException);
    });

  });
});

// ──────────────────────────────────────────────────────────────────────
// ExecutionProcessor tests
// ──────────────────────────────────────────────────────────────────────

describe('ExecutionProcessor', () => {
  let processor: ExecutionProcessor;
  let scenarioModel: Model<ScenarioDocument>;
  let executionModel: Model<ScenarioExecutionDocument>;
  let personaModel: Model<PersonaDocument>;
  let adapterRegistry: AdapterRegistry;
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let mockAdapter: MockAdapter;

  let scenarioId: string;
  let personaId: string;
  const processorPromptId = new Types.ObjectId().toString();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Scenario.name, schema: ScenarioSchema },
          { name: ScenarioExecution.name, schema: ScenarioExecutionSchema },
          { name: Persona.name, schema: PersonaSchema },
          { name: ToolFixture.name, schema: ToolFixtureSchema },
        ]),
      ],
      providers: [
        ExecutionProcessor,
        AdapterRegistry,
        AgentConfigResolver,
        PersonaStrategyRegistry,
        PersonaSimulatorService,
        ToolFixtureService,
        MockResolver,
        {
          provide: EvaluationService,
          useValue: {
            evaluate: jest.fn().mockResolvedValue({
              overallScore: 8,
              passed: true,
              resultId: 'mock-result',
              scorecardId: 'mock-sc',
              categoryScores: {},
              criteriaResults: [],
              status: 'completed',
            }),
          },
        },
      ],
    }).compile();
    await module.init();

    processor = module.get<ExecutionProcessor>(ExecutionProcessor);
    scenarioModel = module.get<Model<ScenarioDocument>>(
      getModelToken(Scenario.name),
    );
    executionModel = module.get<Model<ScenarioExecutionDocument>>(
      getModelToken(ScenarioExecution.name),
    );
    personaModel = module.get<Model<PersonaDocument>>(
      getModelToken(Persona.name),
    );
    adapterRegistry = module.get<AdapterRegistry>(AdapterRegistry);

    // Register mock adapter (overrides the default openai adapter)
    mockAdapter = new MockAdapter();
    adapterRegistry.register(mockAdapter);

    // Create test persona
    const persona = await personaModel.create({
      name: 'Processor Test Persona',
      gender: 'male',
      emotion: 'frustrated',
      language: 'english',
      accent: 'british',
      intentClarity: 'slightly unclear',
      speechStyle: 'fast',
      backgroundNoise: false,
      allowInterruptions: false,
      createdBy: 'test',
      tags: [],
      isActive: true,
      isDefault: false,
      variables: {},
    });
    personaId = persona._id.toString();

    // Create test scenario
    const scenario = await scenarioModel.create({
      name: 'Processor Test Scenario',
      prompt: 'I have a problem with my order',
      category: 'support',
      difficulty: 'medium',
      status: 'active',
      personaIds: [new Types.ObjectId(personaId)],
      createdBy: 'test',
      tags: ['test'],
    });
    scenarioId = scenario._id.toString();

    // Create test prompt (the agent under test)
    const connection = module.get<import('mongoose').Connection>('DatabaseConnection');
    await connection.db!.collection('prompts').insertOne({
      _id: new Types.ObjectId(processorPromptId),
      name: 'Processor Test Prompt',
      content: 'You are a test support agent. Help with customer issues.',
      status: 'active',
      tags: [],
      adapterConfig: { adapterType: 'openai', model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 512 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await executionModel.deleteMany({});
  });

  /**
   * Helper to create a mock Bull job.
   */
  function createMockJob(data: any): any {
    return {
      id: `job-${Date.now()}`,
      data,
      progress: jest.fn().mockResolvedValue(undefined),
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('should run a conversation loop, store transcript, and mark completed', async () => {
    const executionId = `exec_test_${Date.now()}`;

    // Create execution doc
    await executionModel.create({
      executionId,
      scenarioId: new Types.ObjectId(scenarioId),
      personaId: new Types.ObjectId(personaId),

      status: 'queued',
      startTime: new Date(),
      triggeredBy: 'test',
      parameters: {},
    });

    const job = createMockJob({
      executionId,
      scenarioId,
      personaId,
      promptId: processorPromptId,
      adapterType: 'mock',
      maxTurns: 5,
    });

    const result = await processor.processExecution(job);

    // Verify result
    expect(result).toBeDefined();
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThan(0);
    expect(result.transcript).toBeDefined();
    expect(result.transcript.length).toBeGreaterThan(0);

    // Verify transcript has both persona and agent entries
    const personaEntries = result.transcript.filter((e) => e.role === 'persona');
    const agentEntries = result.transcript.filter((e) => e.role === 'agent');
    expect(personaEntries.length).toBeGreaterThan(0);
    expect(agentEntries.length).toBeGreaterThan(0);

    // Verify all agent entries have latency
    for (const entry of agentEntries) {
      expect(entry.latencyMs).toBeDefined();
      expect(entry.latencyMs).toBeGreaterThan(0);
    }

    // Verify execution doc was updated to completed
    const doc = await executionModel.findOne({ executionId });
    expect(doc!.status).toBe('completed');
    expect(doc!.endTime).toBeDefined();
    expect(doc!.overallScore).toBeGreaterThan(0);
    expect(doc!.stepResults!.length).toBeGreaterThan(0);

    // Verify progress was reported
    expect(job.progress).toHaveBeenCalled();
  });

  it('should update status to running before processing', async () => {
    const executionId = `exec_running_${Date.now()}`;

    await executionModel.create({
      executionId,
      scenarioId: new Types.ObjectId(scenarioId),
      personaId: new Types.ObjectId(personaId),

      status: 'queued',
      startTime: new Date(),
      triggeredBy: 'test',
      parameters: {},
    });

    // Track the status during processing
    const originalFindOneAndUpdate =
      executionModel.findOneAndUpdate.bind(executionModel);
    const statusUpdates: string[] = [];

    jest
      .spyOn(executionModel, 'findOneAndUpdate')
      .mockImplementation(function (this: any, filter: any, update: any, options: any) {
        if (update?.$set?.status) {
          statusUpdates.push(update.$set.status);
        }
        return originalFindOneAndUpdate(filter, update, options);
      });

    const job = createMockJob({
      executionId,
      scenarioId,
      personaId,
      promptId: processorPromptId,
      adapterType: 'mock',
      maxTurns: 2,
    });

    await processor.processExecution(job);

    // Should have transitioned through: running -> completed
    expect(statusUpdates).toContain('running');
    expect(statusUpdates).toContain('completed');

    // Restore
    jest.restoreAllMocks();
  });

  it('should update status to failed when scenario is not found', async () => {
    const executionId = `exec_fail_${Date.now()}`;
    const fakeScenarioId = new Types.ObjectId().toString();

    await executionModel.create({
      executionId,
      scenarioId: new Types.ObjectId(fakeScenarioId),
      status: 'queued',
      startTime: new Date(),
      triggeredBy: 'test',
      parameters: {},
    });

    const job = createMockJob({
      executionId,
      scenarioId: fakeScenarioId,
      promptId: processorPromptId,
    });

    await expect(processor.processExecution(job)).rejects.toThrow(
      /not found/,
    );

    const doc = await executionModel.findOne({ executionId });
    expect(doc!.status).toBe('failed');
    expect(doc!.errorMessages!.length).toBeGreaterThan(0);
  });

  it('should update status to failed when adapter type is not registered', async () => {
    const executionId = `exec_adapter_${Date.now()}`;

    // Create a prompt with a non-existent adapter type
    const badPromptId = new Types.ObjectId();
    const connection = module.get<import('mongoose').Connection>('DatabaseConnection');
    await connection.db!.collection('prompts').insertOne({
      _id: badPromptId,
      name: 'Bad Adapter Prompt',
      content: 'Test prompt',
      status: 'active',
      tags: [],
      adapterConfig: { adapterType: 'nonexistent-adapter' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await executionModel.create({
      executionId,
      scenarioId: new Types.ObjectId(scenarioId),
      personaId: new Types.ObjectId(personaId),
      status: 'queued',
      startTime: new Date(),
      triggeredBy: 'test',
      parameters: {},
    });

    const job = createMockJob({
      executionId,
      scenarioId,
      promptId: badPromptId.toString(),
    });

    await expect(processor.processExecution(job)).rejects.toThrow(
      /No adapter registered/,
    );

    const doc = await executionModel.findOne({ executionId });
    expect(doc!.status).toBe('failed');
  });

  it('should handle conversation that ends early via goodbye phrase', async () => {
    const executionId = `exec_early_${Date.now()}`;

    await executionModel.create({
      executionId,
      scenarioId: new Types.ObjectId(scenarioId),
      personaId: new Types.ObjectId(personaId),

      status: 'queued',
      startTime: new Date(),
      triggeredBy: 'test',
      parameters: {},
    });

    // MockAdapter returns "goodbye" on 3rd call, so with maxTurns=10
    // it should stop after 3 turns
    const job = createMockJob({
      executionId,
      scenarioId,
      personaId,
      promptId: processorPromptId,
      adapterType: 'mock',
      maxTurns: 10,
    });

    const result = await processor.processExecution(job);

    // Should have ended early (3 agent turns, not 10)
    const agentEntries = result.transcript.filter((e) => e.role === 'agent');
    expect(agentEntries.length).toBeLessThanOrEqual(3);
    expect(result.passed).toBe(true);
  });

  it('should work without a persona (uses scenario prompt directly)', async () => {
    const executionId = `exec_no_persona_${Date.now()}`;

    await executionModel.create({
      executionId,
      scenarioId: new Types.ObjectId(scenarioId),

      status: 'queued',
      startTime: new Date(),
      triggeredBy: 'test',
      parameters: {},
    });

    const job = createMockJob({
      executionId,
      scenarioId,
      // No personaId -- should use scenario default or prompt directly
      promptId: processorPromptId,
      adapterType: 'mock',
      maxTurns: 3,
    });

    const result = await processor.processExecution(job);

    expect(result).toBeDefined();
    expect(result.passed).toBe(true);
    expect(result.transcript.length).toBeGreaterThan(0);
  });

  it('should report metrics in the result', async () => {
    const executionId = `exec_metrics_${Date.now()}`;

    await executionModel.create({
      executionId,
      scenarioId: new Types.ObjectId(scenarioId),
      personaId: new Types.ObjectId(personaId),

      status: 'queued',
      startTime: new Date(),
      triggeredBy: 'test',
      parameters: {},
    });

    const job = createMockJob({
      executionId,
      scenarioId,
      personaId,
      promptId: processorPromptId,
      adapterType: 'mock',
      maxTurns: 3,
    });

    const result = await processor.processExecution(job);

    expect(result.metrics).toBeDefined();
    expect(result.metrics!.totalTurns).toBeGreaterThan(0);
    expect(result.metrics!.avgLatencyMs).toBeGreaterThanOrEqual(0);
  });
});

// ──────────────────────────────────────────────────────────────────────
// QueueProducerService (unit test with mock queue)
// ──────────────────────────────────────────────────────────────────────

describe('QueueProducerService', () => {
  it('should call queue.add with correct job data', async () => {
    const mockAdd = jest.fn().mockResolvedValue({ id: 'job-1' });
    const mockGetJobCounts = jest.fn().mockResolvedValue({
      waiting: 1,
      active: 0,
    });

    const mockQueue = {
      add: mockAdd,
      getJobCounts: mockGetJobCounts,
    };

    // Instantiate with mock queue via constructor injection hack
    const producer = new QueueProducerService(mockQueue as any);

    const queuePromptId = new Types.ObjectId().toString();
    const job = await producer.enqueueExecution('exec_123', 'scenario_456', {
      promptId: queuePromptId,
      maxTurns: 5,
    });

    expect(job.id).toBe('job-1');
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith(
      'execute',
      {
        executionId: 'exec_123',
        scenarioId: 'scenario_456',
        promptId: queuePromptId,
        maxTurns: 5,
      },
      expect.objectContaining({
        jobId: 'exec_123',
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      }),
    );
  });

  it('should return queue counts', async () => {
    const mockGetJobCounts = jest.fn().mockResolvedValue({
      waiting: 3,
      active: 1,
      completed: 10,
      failed: 2,
    });

    const producer = new QueueProducerService({
      add: jest.fn(),
      getJobCounts: mockGetJobCounts,
    } as any);

    const counts = await producer.getQueueCounts();

    expect(counts.waiting).toBe(3);
    expect(counts.active).toBe(1);
    expect(counts.completed).toBe(10);
    expect(counts.failed).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PersonaSimulator integration with processor
// ──────────────────────────────────────────────────────────────────────

describe('PersonaSimulator integration', () => {
  it('should generate a system prompt from persona traits', () => {
    const simulator = new PersonaSimulatorService();

    const prompt = simulator.toSystemPrompt(
      {
        name: 'Test Karen',
        emotion: 'frustrated',
        speechStyle: 'fast',
        intentClarity: 'very clear',
        behavior: {
          cooperationLevel: 'difficult',
          patience: 'impatient',
        },
      },
      'I want a refund for my broken product',
    );

    expect(prompt).toContain('You are Test Karen');
    expect(prompt).toContain('I want a refund for my broken product');
    expect(prompt).toContain('frustrated');
    expect(prompt).toContain('Cooperation Level');
    expect(prompt).toContain('Patience');
  });
});
