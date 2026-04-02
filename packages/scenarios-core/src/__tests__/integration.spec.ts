/**
 * Task 14: End-to-End Integration Test
 *
 * Tests the full scenario execution pipeline:
 *   1. Create persona (angry customer) + scenario + scorecard
 *   2. Execute scenario in text mode with mocked adapter
 *   3. Persona simulator generates system prompt from traits
 *   4. Execution processor runs conversation loop
 *   5. Transcript stored in execution result
 *   6. Scorecard evaluated against transcript
 *   7. Verify results: transcript, overallScore, criteriaResults, passed, duration
 */
import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { BullModule, getQueueToken } from '@nestjs/bull';

// scenarios-core imports
import {
  Persona,
  PersonaSchema,
  PersonaDocument,
} from '../personas/schemas/persona.schema';
import {
  Scenario,
  ScenarioSchema,
  ScenarioDocument,
} from '../scenarios/schemas/scenario.schema';
import {
  ScenarioExecution,
  ScenarioExecutionSchema,
  ScenarioExecutionDocument,
} from '../scenarios/schemas/scenario-execution.schema';
import {
  AgentAdapter,
  AgentAdapterConfig,
  AgentMessage,
  AgentResponse,
} from '../adapters/agent-adapter.interface';
import { AdapterRegistry } from '../adapters/adapter-registry';
import { PersonaSimulatorService } from '../simulator/persona-simulator.service';
import { ExecutionProcessor } from '../execution/execution-processor';
import { ExecutionService } from '../execution/execution.service';
import { QueueProducerService } from '../execution/queue-producer.service';
import { QUEUE_NAMES } from '../execution/queues.config';
import { ToolFixtureService } from '../tool-fixtures/tool-fixture.service';
import { MockResolver } from '../tool-fixtures/mock-resolver.service';
import { ToolFixture, ToolFixtureSchema } from '../tool-fixtures/schemas/tool-fixture.schema';
import { AgentConfigResolver } from '../execution/agent-config-resolver';
import { PersonaStrategyRegistry } from '../execution/persona-strategy-registry';

// scorecards-core imports
import {
  Scorecard,
  ScorecardSchema,
  ScorecardCategory,
  ScorecardCategorySchema,
  ScorecardCriteria,
  ScorecardCriteriaSchema,
  ScorecardResult,
  ScorecardResultSchema,
  CriteriaType,
} from '@chanl/scorecards-core';
import {
  EvaluationService,
  CriteriaHandlerRegistry,
  KeywordHandler,
  ResponseTimeHandler,
  ToolCallHandler,
  PromptHandler,
  EvaluationContext,
} from '@chanl/scorecards-core';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Agent Adapter — simulates an OpenAI-style agent
// ─────────────────────────────────────────────────────────────────────────────
class MockOpenAIAdapter implements AgentAdapter {
  readonly name = 'Mock OpenAI';
  readonly type = 'openai';

  private connected = false;
  private callCount = 0;

  async connect(_config: AgentAdapterConfig): Promise<void> {
    this.connected = true;
    this.callCount = 0;
  }

  async sendMessage(
    message: string,
    _history: AgentMessage[],
  ): Promise<AgentResponse> {
    if (!this.connected) throw new Error('Not connected');
    this.callCount++;

    // Simulate realistic agent responses for an angry customer refund scenario
    const responses: Record<number, string> = {
      1: 'Hello! I\'m sorry to hear about your issue. How can I help you today with your refund request?',
      2: 'I understand your frustration. Let me pull up your order right away. Can you provide me with your order number?',
      3: 'Thank you for that information. I can see the order in our system. I\'ll process a full refund for you right now.',
      4: 'The refund has been processed and you should see it in your account within 3-5 business days. Is there anything else I can help you with?',
    };

    // After 4 exchanges, end the conversation
    if (this.callCount >= 5) {
      return {
        content: 'Thank you for contacting us. Have a great day! Goodbye.',
        latencyMs: 120,
      };
    }

    return {
      content: responses[this.callCount] || `Response #${this.callCount}`,
      latencyMs: 80 + this.callCount * 20,
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

// ─────────────────────────────────────────────────────────────────────────────
// Mock queue producer — no real Redis needed
// ─────────────────────────────────────────────────────────────────────────────
const mockEnqueue = jest.fn().mockResolvedValue({ id: 'mock-job-id' });

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
});

afterAll(async () => {
  await mongod.stop();
});

describe('Integration: Full Scenario Execution Pipeline', () => {
  let module: TestingModule;
  let executionService: ExecutionService;
  let evaluationService: EvaluationService;
  let processor: ExecutionProcessor;
  let personaSimulator: PersonaSimulatorService;
  let adapterRegistry: AdapterRegistry;

  // Models
  let personaModel: Model<PersonaDocument>;
  let scenarioModel: Model<ScenarioDocument>;
  let executionModel: Model<ScenarioExecutionDocument>;
  let scorecardModel: Model<any>;
  let categoryModel: Model<any>;
  let criteriaModel: Model<any>;
  let resultModel: Model<any>;

  // Test data IDs
  let personaId: string;
  let scenarioId: string;
  let scorecardId: string;
  const testPromptId = new Types.ObjectId().toString();

  beforeEach(async () => {
    // Build handler registry
    const handlerRegistry = new CriteriaHandlerRegistry();
    handlerRegistry.register(new KeywordHandler());
    handlerRegistry.register(new PromptHandler());
    handlerRegistry.register(new ResponseTimeHandler());
    handlerRegistry.register(new ToolCallHandler());

    // Build adapter registry
    const adapters = new AdapterRegistry();
    adapters.register(new MockOpenAIAdapter());

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri(), {
          dbName: `integration_test_${Date.now()}`,
        }),
        MongooseModule.forFeature([
          { name: Persona.name, schema: PersonaSchema },
          { name: Scenario.name, schema: ScenarioSchema },
          { name: ScenarioExecution.name, schema: ScenarioExecutionSchema },
          { name: Scorecard.name, schema: ScorecardSchema },
          { name: ScorecardCategory.name, schema: ScorecardCategorySchema },
          { name: ScorecardCriteria.name, schema: ScorecardCriteriaSchema },
          { name: ScorecardResult.name, schema: ScorecardResultSchema },
          { name: ToolFixture.name, schema: ToolFixtureSchema },
        ]),
      ],
      providers: [
        ExecutionService,
        ExecutionProcessor,
        AgentConfigResolver,
        PersonaStrategyRegistry,
        PersonaSimulatorService,
        EvaluationService,
        ToolFixtureService,
        MockResolver,
        { provide: AdapterRegistry, useValue: adapters },
        { provide: CriteriaHandlerRegistry, useValue: handlerRegistry },
        {
          provide: QueueProducerService,
          useValue: { enqueueExecution: mockEnqueue },
        },
      ],
    }).compile();

    // Manually init persona strategies (module.init() would overwrite our mock adapters)
    const strategyRegistry = module.get(PersonaStrategyRegistry);
    strategyRegistry.onModuleInit();

    executionService = module.get(ExecutionService);
    evaluationService = module.get(EvaluationService);
    processor = module.get(ExecutionProcessor);
    personaSimulator = module.get(PersonaSimulatorService);
    adapterRegistry = module.get(AdapterRegistry);

    personaModel = module.get(getModelToken(Persona.name));
    scenarioModel = module.get(getModelToken(Scenario.name));
    executionModel = module.get(getModelToken(ScenarioExecution.name));
    scorecardModel = module.get(getModelToken(Scorecard.name));
    categoryModel = module.get(getModelToken(ScorecardCategory.name));
    criteriaModel = module.get(getModelToken(ScorecardCriteria.name));
    resultModel = module.get(getModelToken(ScorecardResult.name));

    // ── Create test data ──

    // 1. Angry customer persona
    const persona = await personaModel.create({
      name: 'Angry Karen',
      gender: 'female',
      emotion: 'frustrated',
      language: 'english',
      accent: 'american',
      intentClarity: 'very clear',
      speechStyle: 'fast',
      backgroundNoise: false,
      allowInterruptions: false,
      description: 'A frustrated customer demanding a refund for a broken laptop',
      backstory:
        'Purchased a laptop 2 weeks ago that arrived with a cracked screen. Has called support 3 times already with no resolution.',
      behavior: {
        personality: 'demanding',
        emotionalState: 'frustrated',
        cooperationLevel: 'difficult',
        patience: 'impatient',
        communicationStyle: 'direct',
      },
      conversationTraits: {
        allowInterruptions: false,
        interruptionFrequency: 'sometimes',
        asksClarifyingQuestions: true,
        repeatsInformation: true,
        goesOffTopic: false,
      },
      createdBy: 'integration-test',
    });
    personaId = persona._id.toString();

    // 2. Refund scenario
    const scenario = await scenarioModel.create({
      name: 'Angry Customer Refund Request',
      description: 'Customer demands refund for broken laptop',
      prompt:
        'I bought a laptop from your store two weeks ago and the screen is cracked! I want a full refund NOW!',
      difficulty: 'hard',
      status: 'active',
      category: 'support',
      personaIds: [persona._id],
      simulationMode: 'text',
      createdBy: 'integration-test',
    });
    scenarioId = scenario._id.toString();

    // 2b. Seed a Prompt document (the agent under test)
    const db = module.get<import('mongoose').Connection>('DatabaseConnection').db!;
    await db.collection('prompts').insertOne({
      _id: new Types.ObjectId(testPromptId),
      name: 'Test Support Agent',
      content: 'You are a helpful customer support agent. Assist the customer with their issue.',
      status: 'active',
      tags: [],
      adapterConfig: { adapterType: 'openai', model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 512 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 3. Scorecard with keyword + response_time criteria
    const scorecard = await scorecardModel.create({
      name: 'Customer Service Quality',
      status: 'active',
      scoringAlgorithm: 'weighted_average',
      passingThreshold: 60,
    });
    scorecardId = scorecard._id.toString();

    const commCat = await categoryModel.create({
      scorecardId: scorecard._id,
      name: 'Communication',
      weight: 60,
      order: 0,
      version: 1,
    });

    const timingCat = await categoryModel.create({
      scorecardId: scorecard._id,
      name: 'Timing',
      weight: 40,
      order: 1,
      version: 1,
    });

    // Criteria: Agent should greet properly
    await criteriaModel.create({
      scorecardId: scorecard._id,
      categoryId: commCat._id,
      key: 'greeting',
      name: 'Agent Greeting',
      type: CriteriaType.KEYWORD,
      settings: {
        matchType: 'must_contain',
        keyword: ['hello', 'hi', 'how can I help', 'sorry'],
      },
      threshold: { expectedValue: true },
      isActive: true,
    });

    // Criteria: Agent should not use profanity
    await criteriaModel.create({
      scorecardId: scorecard._id,
      categoryId: commCat._id,
      key: 'no_profanity',
      name: 'No Profanity',
      type: CriteriaType.KEYWORD,
      settings: {
        matchType: 'must_not_contain',
        keyword: ['damn', 'crap', 'stupid', 'idiot'],
      },
      isActive: true,
    });

    // Criteria: Agent should mention refund
    await criteriaModel.create({
      scorecardId: scorecard._id,
      categoryId: commCat._id,
      key: 'refund_mentioned',
      name: 'Refund Mentioned',
      type: CriteriaType.KEYWORD,
      settings: {
        matchType: 'must_contain',
        keyword: ['refund', 'refunded', 'money back'],
      },
      threshold: { expectedValue: true },
      isActive: true,
    });

    // Criteria: Response time under threshold
    await criteriaModel.create({
      scorecardId: scorecard._id,
      categoryId: timingCat._id,
      key: 'response_time',
      name: 'Agent Response Time',
      type: CriteriaType.RESPONSE_TIME,
      settings: { participant: 'agent' },
      threshold: { max: 5 },
      isActive: true,
    });
  });

  afterEach(async () => {
    mockEnqueue.mockClear();
    await module?.close();
  });

  // ─── Test 1: Full pipeline ─────────────────────────────────────────────

  it('should execute scenario and produce transcript with alternating user/agent messages', async () => {
    // Create execution via service (queues job)
    const executionId = await executionService.execute(scenarioId, {
      promptId: testPromptId,
      personaId,
      maxTurns: 5,
    });

    expect(executionId).toMatch(/^exec_/);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);

    // Simulate what the queue processor would do
    const mockJob = {
      data: {
        executionId,
        scenarioId,
        promptId: testPromptId,
        personaId,
        maxTurns: 5,
      },
      progress: jest.fn(),
    } as any;

    const result = await processor.processExecution(mockJob);

    // Verify transcript has alternating persona/agent messages
    expect(result.transcript.length).toBeGreaterThan(0);
    expect(result.transcript.length).toBeGreaterThanOrEqual(4); // At least 2 turns

    for (let i = 0; i < result.transcript.length; i++) {
      const entry = result.transcript[i];
      if (i % 2 === 0) {
        expect(entry.role).toBe('persona');
      } else {
        expect(entry.role).toBe('agent');
        expect(entry.latencyMs).toBeDefined();
        expect(entry.latencyMs).toBeGreaterThan(0);
      }
      expect(entry.content).toBeTruthy();
      expect(entry.timestamp).toBeDefined();
    }

    // Verify score and metrics
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.duration).toBeGreaterThan(0);
    expect(result.passed).toBe(true);
    expect(result.metrics).toBeDefined();
    expect(result.metrics!.totalTurns).toBeGreaterThanOrEqual(2);
    expect(result.metrics!.avgLatencyMs).toBeGreaterThan(0);
  });

  // ─── Test 2: Execution status updates ────────────────────────────────

  it('should update execution status from queued → running → completed', async () => {
    const executionId = await executionService.execute(scenarioId, {
      promptId: testPromptId,
      personaId,
      maxTurns: 3,
    });

    // Before processing: status = queued
    let execution = await executionService.getExecution(executionId);
    expect(execution.status).toBe('queued');

    // Process the job
    const mockJob = {
      data: {
        executionId,
        scenarioId,
        promptId: testPromptId,
        personaId,
        maxTurns: 3,
      },
      progress: jest.fn(),
    } as any;

    await processor.processExecution(mockJob);

    // After processing: status = completed
    execution = await executionService.getExecution(executionId);
    expect(execution.status).toBe('completed');
    expect(execution.overallScore).toBeGreaterThan(0);
    expect(execution.stepResults).toBeDefined();
    expect(execution.stepResults!.length).toBeGreaterThan(0);
  });

  // ─── Test 3: Persona simulator generates system prompt from traits ────

  it('should generate persona system prompt reflecting angry customer traits', () => {
    const prompt = personaSimulator.toSystemPrompt(
      {
        name: 'Angry Karen',
        emotion: 'frustrated',
        speechStyle: 'fast',
        intentClarity: 'very clear',
        backstory:
          'Purchased a laptop 2 weeks ago that arrived with a cracked screen.',
        behavior: {
          cooperationLevel: 'difficult',
          patience: 'impatient',
          communicationStyle: 'direct',
        },
        conversationTraits: {
          interruptionFrequency: 'sometimes',
        },
      },
      'I want a full refund for my broken laptop!',
    );

    // Verify emotional cues
    expect(prompt).toContain('frustrated');
    expect(prompt).toContain('impatien');

    // Verify cooperation cues (difficult → "somewhat resistant")
    expect(prompt).toContain('resistant');

    // Verify the scenario prompt is embedded
    expect(prompt).toContain('refund');
    expect(prompt).toContain('broken laptop');

    // Verify backstory
    expect(prompt).toContain('cracked screen');
  });

  // ─── Test 4: Scorecard evaluation on generated transcript ────────────

  it('should evaluate transcript against scorecard and return scores', async () => {
    // Run execution to get transcript
    const executionId = await executionService.execute(scenarioId, {
      promptId: testPromptId,
      personaId,
      maxTurns: 5,
    });

    const mockJob = {
      data: {
        executionId,
        scenarioId,
        promptId: testPromptId,
        personaId,
        maxTurns: 5,
      },
      progress: jest.fn(),
    } as any;

    const execResult = await processor.processExecution(mockJob);

    // Build evaluation context from transcript
    const transcriptText = execResult.transcript
      .map((t) => `${t.role === 'agent' ? 'Agent' : 'Customer'}: ${t.content}`)
      .join('\n');

    const segments = execResult.transcript.map((t) => ({
      speaker: t.role === 'agent' ? 'agent' : 'customer',
      text: t.content,
    }));

    const agentEntries = execResult.transcript.filter(
      (t) => t.role === 'agent',
    );
    const avgLatency =
      agentEntries.length > 0
        ? agentEntries.reduce((sum, e) => sum + (e.latencyMs || 0), 0) /
          agentEntries.length
        : 0;

    const context: EvaluationContext = {
      transcriptText,
      segments,
      metrics: {
        duration: execResult.duration / 1000,
        firstResponseLatency: avgLatency / 1000,
      },
      toolCalls: [],
    };

    // Evaluate
    const evalResult = await evaluationService.evaluate(scorecardId, context, {
      scenarioExecutionId: executionId,
    });

    // Verify structure
    expect(evalResult.status).toBe('completed');
    expect(evalResult.scorecardId).toBe(scorecardId);
    expect(evalResult.criteriaResults).toHaveLength(4);
    expect(evalResult.overallScore).toBeGreaterThan(0);
    expect(typeof evalResult.passed).toBe('boolean');

    // Verify individual criteria
    const greetingResult = evalResult.criteriaResults.find(
      (cr) => cr.criteriaKey === 'greeting',
    );
    expect(greetingResult).toBeDefined();
    // Mock agent says "Hello" in first response → should pass
    expect(greetingResult!.passed).toBe(true);

    const profanityResult = evalResult.criteriaResults.find(
      (cr) => cr.criteriaKey === 'no_profanity',
    );
    expect(profanityResult).toBeDefined();
    expect(profanityResult!.passed).toBe(true);

    const refundResult = evalResult.criteriaResults.find(
      (cr) => cr.criteriaKey === 'refund_mentioned',
    );
    expect(refundResult).toBeDefined();
    // Mock agent says "refund" → should pass
    expect(refundResult!.passed).toBe(true);

    const rtResult = evalResult.criteriaResults.find(
      (cr) => cr.criteriaKey === 'response_time',
    );
    expect(rtResult).toBeDefined();
    expect(rtResult!.passed).toBe(true);

    // Verify category scores
    expect(evalResult.categoryScores['Communication']).toBeDefined();
    expect(evalResult.categoryScores['Communication']).toBeGreaterThan(0);
    expect(evalResult.categoryScores['Timing']).toBeDefined();
    expect(evalResult.categoryScores['Timing']).toBeGreaterThan(0);
  });

  // ─── Test 5: Result stored in database ───────────────────────────────

  it('should store scorecard result in database with analysis metadata', async () => {
    // Quick execution
    const executionId = await executionService.execute(scenarioId, {
      promptId: testPromptId,
      personaId,
      maxTurns: 3,
    });

    const mockJob = {
      data: {
        executionId,
        scenarioId,
        promptId: testPromptId,
        personaId,
        maxTurns: 3,
      },
      progress: jest.fn(),
    } as any;

    const execResult = await processor.processExecution(mockJob);

    const transcriptText = execResult.transcript
      .map((t) => `${t.role === 'agent' ? 'Agent' : 'Customer'}: ${t.content}`)
      .join('\n');

    const evalResult = await evaluationService.evaluate(
      scorecardId,
      {
        transcriptText,
        segments: execResult.transcript.map((t) => ({
          speaker: t.role === 'agent' ? 'agent' : 'customer',
          text: t.content,
        })),
        metrics: {
          firstResponseLatency: 0.1,
        },
      },
      { scenarioExecutionId: executionId },
    );

    // Verify DB record
    const dbResult = await resultModel.findById(evalResult.resultId);
    expect(dbResult).not.toBeNull();
    expect(dbResult!.status).toBe('completed');
    expect(dbResult!.overallScore).toBeGreaterThan(0);
    expect(dbResult!.criteriaResults).toHaveLength(4);
    expect(dbResult!.analysisMetadata).toBeDefined();
    expect(dbResult!.analysisMetadata.triggeredBy).toBe('scenario');
    expect(dbResult!.analysisMetadata.processingTime).toBeGreaterThan(0);
    expect(dbResult!.scenarioExecutionId).toBe(executionId);
  });

  // ─── Test 6: Cancel execution ────────────────────────────────────────

  it('should cancel a queued execution', async () => {
    const executionId = await executionService.execute(scenarioId, {
      promptId: testPromptId,
      personaId,
    });

    await executionService.cancelExecution(executionId);

    const execution = await executionService.getExecution(executionId);
    expect(execution.status).toBe('cancelled');
  });

  // ─── Test 7: List executions with filters ────────────────────────────

  it('should list executions by status filter', async () => {
    // Create two executions
    const id1 = await executionService.execute(scenarioId, {
      promptId: testPromptId,
      personaId,
    });
    const id2 = await executionService.execute(scenarioId, {
      promptId: testPromptId,
      personaId,
    });

    // Cancel one
    await executionService.cancelExecution(id2);

    // List queued
    const { executions: queued, total: queuedTotal } =
      await executionService.listExecutions({ status: 'queued' });
    expect(queuedTotal).toBe(1);
    expect(queued[0].executionId).toBe(id1);

    // List cancelled
    const { executions: cancelled, total: cancelledTotal } =
      await executionService.listExecutions({ status: 'cancelled' });
    expect(cancelledTotal).toBe(1);
    expect(cancelled[0].executionId).toBe(id2);
  });

  // ─── Test 8: minimum_all scoring algorithm ───────────────────────────

  it('should fail overall with minimum_all when one criterion fails', async () => {
    // Create a strict scorecard with minimum_all
    const strictScorecard = await scorecardModel.create({
      name: 'Strict Quality',
      status: 'active',
      scoringAlgorithm: 'minimum_all',
      passingThreshold: 50,
    });

    const cat = await categoryModel.create({
      scorecardId: strictScorecard._id,
      name: 'Requirements',
      weight: 100,
      order: 0,
      version: 1,
    });

    // One that will pass
    await criteriaModel.create({
      scorecardId: strictScorecard._id,
      categoryId: cat._id,
      key: 'greeting_strict',
      name: 'Must Greet',
      type: CriteriaType.KEYWORD,
      settings: { matchType: 'must_contain', keyword: ['hello'] },
      threshold: { expectedValue: true },
      isActive: true,
    });

    // One that will fail (agent doesn't say "discount")
    await criteriaModel.create({
      scorecardId: strictScorecard._id,
      categoryId: cat._id,
      key: 'discount_offer',
      name: 'Must Offer Discount',
      type: CriteriaType.KEYWORD,
      settings: { matchType: 'must_contain', keyword: ['discount', 'coupon'] },
      threshold: { expectedValue: true },
      isActive: true,
    });

    // Run execution
    const executionId = await executionService.execute(scenarioId, {
      promptId: testPromptId,
      personaId,
      maxTurns: 3,
    });

    const mockJob = {
      data: {
        executionId,
        scenarioId,
        promptId: testPromptId,
        personaId,
        maxTurns: 3,
      },
      progress: jest.fn(),
    } as any;

    const execResult = await processor.processExecution(mockJob);

    const transcriptText = execResult.transcript
      .map((t) => `${t.role === 'agent' ? 'Agent' : 'Customer'}: ${t.content}`)
      .join('\n');

    const evalResult = await evaluationService.evaluate(
      strictScorecard._id.toString(),
      {
        transcriptText,
        segments: execResult.transcript.map((t) => ({
          speaker: t.role === 'agent' ? 'agent' : 'customer',
          text: t.content,
        })),
        metrics: { firstResponseLatency: 0.1 },
      },
    );

    // minimum_all: one fail → overall = 0
    expect(evalResult.overallScore).toBe(0);
    expect(evalResult.passed).toBe(false);

    // Verify the specific criteria
    const discountResult = evalResult.criteriaResults.find(
      (cr) => cr.criteriaKey === 'discount_offer',
    );
    expect(discountResult!.passed).toBe(false);
  });

  // ─── Test 9: Execution with different adapter type ─────────────────

  it('should throw when adapter type is not registered', async () => {
    // Create a prompt with a non-existent adapter type
    const badPromptId = new Types.ObjectId();
    const db = module.get<import('mongoose').Connection>('DatabaseConnection').db!;
    await db.collection('prompts').insertOne({
      _id: badPromptId,
      name: 'Bad Adapter Prompt',
      content: 'Test prompt',
      status: 'active',
      tags: [],
      adapterConfig: { adapterType: 'nonexistent', model: 'test' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const executionId = await executionService.execute(scenarioId, {
      promptId: badPromptId.toString(),
      personaId,
    });

    const mockJob = {
      data: {
        executionId,
        scenarioId,
        promptId: badPromptId.toString(),
        personaId,
        maxTurns: 3,
      },
      progress: jest.fn(),
    } as any;

    await expect(processor.processExecution(mockJob)).rejects.toThrow(
      /No adapter registered/,
    );

    // Execution should be marked as failed
    const execution = await executionService.getExecution(executionId);
    expect(execution.status).toBe('failed');
  });

  // ─── Test 10: Full pipeline produces consistent data across layers ──

  it('should produce consistent execution + evaluation results (end-to-end)', async () => {
    // 1. Execute
    const executionId = await executionService.execute(scenarioId, {
      promptId: testPromptId,
      personaId,
      maxTurns: 4,
    });

    const mockJob = {
      data: {
        executionId,
        scenarioId,
        promptId: testPromptId,
        personaId,
        maxTurns: 4,
      },
      progress: jest.fn(),
    } as any;

    const execResult = await processor.processExecution(mockJob);

    // 2. Evaluate
    const transcriptText = execResult.transcript
      .map((t) => `${t.role === 'agent' ? 'Agent' : 'Customer'}: ${t.content}`)
      .join('\n');

    const evalResult = await evaluationService.evaluate(
      scorecardId,
      {
        transcriptText,
        segments: execResult.transcript.map((t) => ({
          speaker: t.role === 'agent' ? 'agent' : 'customer',
          text: t.content,
        })),
        metrics: {
          duration: execResult.duration / 1000,
          firstResponseLatency: 0.1,
        },
      },
      { scenarioExecutionId: executionId },
    );

    // 3. Verify cross-layer consistency
    // Execution layer
    const dbExec = await executionModel.findOne({ executionId });
    expect(dbExec!.status).toBe('completed');
    expect(dbExec!.overallScore).toBeGreaterThan(0);

    // Evaluation layer
    expect(evalResult.status).toBe('completed');
    expect(evalResult.overallScore).toBeGreaterThan(0);

    // Both reference the same execution
    const dbEvalResult = await resultModel.findById(evalResult.resultId);
    expect(dbEvalResult!.scenarioExecutionId).toBe(executionId);

    // Transcript is non-empty and has persona + agent entries
    const personaEntries = execResult.transcript.filter(
      (t) => t.role === 'persona',
    );
    const agentEntries = execResult.transcript.filter(
      (t) => t.role === 'agent',
    );
    expect(personaEntries.length).toBeGreaterThan(0);
    expect(agentEntries.length).toBeGreaterThan(0);

    // Duration and score are reasonable
    expect(execResult.duration).toBeGreaterThan(0);
    expect(execResult.score).toBeGreaterThan(0);
    expect(evalResult.criteriaResults.length).toBe(4);
  });
});
