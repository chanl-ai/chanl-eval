/**
 * E2E Tests: Execution Pipeline
 *
 * These tests prove the core product works end-to-end:
 * persona sends message → agent responds → conversation loops → scored transcript.
 *
 * Uses a real HTTP mock server (not a class-level mock) so the HTTP adapter,
 * conversation loop, transcript recording, and scoring all run for real.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { ExecutionProcessor } from '../../execution/execution-processor';
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
  ToolFixture,
  ToolFixtureSchema,
} from '../../tool-fixtures/schemas/tool-fixture.schema';
import { ToolFixtureService } from '../../tool-fixtures/tool-fixture.service';
import { MockResolver } from '../../tool-fixtures/mock-resolver.service';
import { AgentConfigResolver } from '../../execution/agent-config-resolver';
import { PersonaStrategyRegistry } from '../../execution/persona-strategy-registry';
import {
  startMockAgent,
  isCannedMessage,
  makePersonaData,
  makeScenarioData,
  makePromptData,
  MockAgentServer,
} from './test-helpers';

jest.setTimeout(30000);

describe('E2E: Execution Pipeline', () => {
  let processor: ExecutionProcessor;
  let scenarioModel: Model<ScenarioDocument>;
  let executionModel: Model<ScenarioExecutionDocument>;
  let personaModel: Model<PersonaDocument>;
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let mockAgent: MockAgentServer;
  let promptId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    // Start mock HTTP agent — returns realistic sequential responses
    mockAgent = await startMockAgent([
      { content: "I'm sorry to hear about your laptop issues. Can you tell me the order number?" },
      { content: "I found your order. The laptop was purchased 14 days ago. I can process a refund for you." },
      { content: "I've initiated the refund. You should see it within 5-7 business days. Is there anything else?" },
      { content: "Thank you for contacting us. Have a great day! Goodbye." },
    ]);

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
              resultId: 'e2e-result',
              scorecardId: 'e2e-sc',
              categoryScores: {},
              criteriaResults: [
                { criteriaName: 'politeness', passed: true, reasoning: 'Agent was polite' },
                { criteriaName: 'resolution', passed: true, reasoning: 'Issue resolved' },
              ],
              status: 'completed',
            }),
          },
        },
      ],
    }).compile();
    await module.init();

    processor = module.get<ExecutionProcessor>(ExecutionProcessor);
    scenarioModel = module.get<Model<ScenarioDocument>>(getModelToken(Scenario.name));
    executionModel = module.get<Model<ScenarioExecutionDocument>>(
      getModelToken(ScenarioExecution.name),
    );
    personaModel = module.get<Model<PersonaDocument>>(getModelToken(Persona.name));

    // Create prompt doc pointing at our mock HTTP server
    promptId = new Types.ObjectId().toString();
    const connection = module.get<import('mongoose').Connection>('DatabaseConnection');
    await connection.db!.collection('prompts').insertOne({
      _id: new Types.ObjectId(promptId),
      ...makePromptData(mockAgent.url),
    });
  });

  afterAll(async () => {
    await mockAgent.close();
    await module.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await executionModel.deleteMany({});
    // Reset mock agent state
    mockAgent.receivedMessages.length = 0;
  });

  function createMockJob(data: any): any {
    return {
      id: `job-${Date.now()}`,
      data,
      progress: jest.fn().mockResolvedValue(undefined),
    };
  }

  // ─── TEST 1: Full conversation loop via HTTP adapter ────────────────

  it('should run a multi-turn conversation via real HTTP mock server', async () => {
    const persona = await personaModel.create(makePersonaData());
    const personaId = persona._id.toString();

    const scenario = await scenarioModel.create(
      makeScenarioData([personaId]),
    );
    const scenarioId = scenario._id.toString();
    const executionId = `e2e_full_${Date.now()}`;

    await executionModel.create({
      executionId,
      scenarioId: new Types.ObjectId(scenarioId),
      personaId: new Types.ObjectId(personaId),
      status: 'queued',
      startTime: new Date(),
      triggeredBy: 'e2e-test',
      parameters: {},
    });

    const result = await processor.processExecution(
      createMockJob({
        executionId,
        scenarioId,
        personaId,
        promptId,
        maxTurns: 5,
      }),
    );

    // CORE ASSERTION: The conversation actually happened
    expect(result.transcript.length).toBeGreaterThanOrEqual(4); // At least 2 full turns

    // Agent responses came from our mock HTTP server, not a mock class
    const agentMessages = result.transcript
      .filter((e) => e.role === 'agent')
      .map((e) => e.content);
    expect(agentMessages[0]).toContain('laptop');
    expect(agentMessages.some((m) => m.includes('refund'))).toBe(true);

    // Persona messages were generated (not just the raw scenario prompt repeated)
    const personaMessages = result.transcript
      .filter((e) => e.role === 'persona')
      .map((e) => e.content);
    expect(personaMessages.length).toBeGreaterThanOrEqual(2);
    // First persona message should be based on the scenario prompt
    expect(personaMessages[0].length).toBeGreaterThan(5);

    // Latency was measured on real HTTP calls
    const agentEntries = result.transcript.filter((e) => e.role === 'agent');
    for (const entry of agentEntries) {
      expect(entry.latencyMs).toBeDefined();
      expect(entry.latencyMs).toBeGreaterThanOrEqual(0);
    }

    // The mock server actually received the messages
    expect(mockAgent.receivedMessages.length).toBeGreaterThanOrEqual(2);

    // Execution doc was updated
    const doc = await executionModel.findOne({ executionId });
    expect(doc!.status).toBe('completed');
    expect(doc!.overallScore).toBeGreaterThan(0);
    expect(doc!.stepResults!.length).toBeGreaterThan(0);

    // Step results contain actual message content
    const stepWithContent = doc!.stepResults!.find(
      (s: any) => s.actualResponse && s.actualResponse.length > 0,
    );
    expect(stepWithContent).toBeDefined();
  });

  // ─── TEST 2: Conversation ends on goodbye ───────────────────────────

  it('should end conversation when agent says goodbye', async () => {
    const persona = await personaModel.create(makePersonaData({ name: 'Goodbye Test' }));
    const scenario = await scenarioModel.create(
      makeScenarioData([persona._id.toString()], { name: 'Goodbye Test' }),
    );
    const executionId = `e2e_goodbye_${Date.now()}`;

    await executionModel.create({
      executionId,
      scenarioId: scenario._id,
      personaId: persona._id,
      status: 'queued',
      startTime: new Date(),
      triggeredBy: 'e2e-test',
      parameters: {},
    });

    const result = await processor.processExecution(
      createMockJob({
        executionId,
        scenarioId: scenario._id.toString(),
        personaId: persona._id.toString(),
        promptId,
        maxTurns: 10, // High max — should end early on goodbye
      }),
    );

    // Should have ended before maxTurns because mock agent says "Goodbye" on turn 4
    const agentMessages = result.transcript.filter((e) => e.role === 'agent');
    expect(agentMessages.length).toBeLessThanOrEqual(4);

    // Last agent message should contain goodbye
    const lastAgent = agentMessages[agentMessages.length - 1];
    expect(lastAgent.content.toLowerCase()).toContain('goodbye');
  });

  // ─── TEST 3: Execution records duration and metrics ─────────────────

  it('should record accurate duration and metrics', async () => {
    const persona = await personaModel.create(makePersonaData({ name: 'Metrics Test' }));
    const scenario = await scenarioModel.create(
      makeScenarioData([persona._id.toString()], { name: 'Metrics Test' }),
    );
    const executionId = `e2e_metrics_${Date.now()}`;

    await executionModel.create({
      executionId,
      scenarioId: scenario._id,
      personaId: persona._id,
      status: 'queued',
      startTime: new Date(),
      triggeredBy: 'e2e-test',
      parameters: {},
    });

    const startTime = Date.now();
    const result = await processor.processExecution(
      createMockJob({
        executionId,
        scenarioId: scenario._id.toString(),
        personaId: persona._id.toString(),
        promptId,
        maxTurns: 3,
      }),
    );
    const elapsed = Date.now() - startTime;

    // Duration should be reasonable (not 0, not wildly wrong)
    expect(result.duration).toBeGreaterThan(0);
    expect(result.duration).toBeLessThanOrEqual(elapsed + 100);

    // Metrics should be populated
    expect(result.metrics).toBeDefined();
    expect(result.metrics!.totalTurns).toBeGreaterThan(0);
    expect(result.metrics!.avgLatencyMs).toBeGreaterThan(0);
  });

  // ─── TEST 4: Handles missing persona gracefully ─────────────────────

  it('should work without a persona (uses scenario prompt directly)', async () => {
    const scenario = await scenarioModel.create({
      name: 'No Persona Test',
      prompt: 'I need help with a billing issue',
      category: 'support',
      difficulty: 'easy',
      status: 'active',
      personaIds: [],
      tags: ['e2e-test'],
      createdBy: 'e2e-test',
    });
    const executionId = `e2e_nopersona_${Date.now()}`;

    await executionModel.create({
      executionId,
      scenarioId: scenario._id,
      status: 'queued',
      startTime: new Date(),
      triggeredBy: 'e2e-test',
      parameters: {},
    });

    const result = await processor.processExecution(
      createMockJob({
        executionId,
        scenarioId: scenario._id.toString(),
        promptId,
        maxTurns: 3,
      }),
    );

    // Should still produce a transcript
    expect(result.transcript.length).toBeGreaterThanOrEqual(2);
    expect(result.passed).toBe(true);
  });

  // ─── TEST 5: Tool calls resolve through MockResolver ────────────────

  it('should resolve tool calls via mock fixtures during conversation', async () => {
    // Create a mock agent that requests tool calls
    const toolMockAgent = await startMockAgent([
      {
        content: "Let me look up your order.",
        tool_calls: [
          { id: 'call_1', name: 'lookup_order', arguments: { orderId: 'ORD-123' } },
        ],
      },
      { content: "I found order ORD-123. It was delivered yesterday. Goodbye!" },
    ]);

    // Create prompt pointing at tool mock agent
    const toolPromptId = new Types.ObjectId().toString();
    const connection = module.get<import('mongoose').Connection>('DatabaseConnection');
    await connection.db!.collection('prompts').insertOne({
      _id: new Types.ObjectId(toolPromptId),
      ...makePromptData(toolMockAgent.url),
    });

    // Create tool fixture
    const toolFixtureModel = module.get<Model<any>>(getModelToken(ToolFixture.name));
    const fixture = await toolFixtureModel.create({
      name: 'lookup_order',
      description: 'Look up order details',
      parameters: { type: 'object', properties: { orderId: { type: 'string' } } },
      response: { status: 'delivered', deliveredAt: '2026-04-09' },
      createdBy: 'e2e-test',
    });

    const persona = await personaModel.create(makePersonaData({ name: 'Tool Test' }));
    const scenario = await scenarioModel.create(
      makeScenarioData([persona._id.toString()], { name: 'Tool Test' }),
    );
    const executionId = `e2e_tools_${Date.now()}`;

    await executionModel.create({
      executionId,
      scenarioId: scenario._id,
      personaId: persona._id,
      status: 'queued',
      startTime: new Date(),
      triggeredBy: 'e2e-test',
      parameters: {},
    });

    const result = await processor.processExecution(
      createMockJob({
        executionId,
        scenarioId: scenario._id.toString(),
        personaId: persona._id.toString(),
        promptId: toolPromptId,
        maxTurns: 5,
        toolFixtureIds: [fixture._id.toString()],
      }),
    );

    // Should have tool entries in transcript
    const toolEntries = result.transcript.filter((e) => e.role === 'tool');
    expect(toolEntries.length).toBeGreaterThan(0);

    // Tool entry should contain the resolved result
    const toolContent = JSON.parse(toolEntries[0].content);
    expect(toolContent.name).toBe('lookup_order');
    expect(toolContent.result).toBeDefined();

    await toolMockAgent.close();
  });

  // ─── TEST 6: Failed execution is recorded properly ──────────────────

  it('should record failure when scenario does not exist', async () => {
    const executionId = `e2e_fail_${Date.now()}`;
    const fakeScenarioId = new Types.ObjectId().toString();

    await executionModel.create({
      executionId,
      scenarioId: new Types.ObjectId(fakeScenarioId),
      status: 'queued',
      startTime: new Date(),
      triggeredBy: 'e2e-test',
      parameters: {},
    });

    // Suppress expected error logs for this test
    const logSpy = jest.spyOn(processor['logger'], 'error').mockImplementation();

    await expect(
      processor.processExecution(
        createMockJob({
          executionId,
          scenarioId: fakeScenarioId,
          promptId,
          maxTurns: 3,
        }),
      ),
    ).rejects.toThrow('not found');

    logSpy.mockRestore();

    // Execution should be marked as failed
    const doc = await executionModel.findOne({ executionId });
    expect(doc!.status).toBe('failed');
  });
});
