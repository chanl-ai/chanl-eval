import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { ScorecardsService } from '@chanl/scorecards-core';
import { RunSetService } from '../run-set.service';
import { RunSet, RunSetSchema } from '../schemas/run-set.schema';
import {
  ScenarioExecution,
  ScenarioExecutionSchema,
} from '../../scenarios/schemas/scenario-execution.schema';
import { Persona, PersonaSchema } from '../../personas/schemas/persona.schema';
import { Scenario, ScenarioSchema } from '../../scenarios/schemas/scenario.schema';
import { ToolFixture, ToolFixtureSchema } from '../../tool-fixtures/schemas/tool-fixture.schema';
import { ToolFixtureService } from '../../tool-fixtures/tool-fixture.service';
import { ScenarioExecutionService } from '../../scenarios/services/scenario-execution.service';

/**
 * Run sets against a real Mongo. The queue is the edge: the fake execution service records what
 * each run was queued with instead of starting a conversation.
 */
describe('RunSetService', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let service: RunSetService;
  let fixtures: Model<any>;
  let scenarios: Model<any>;
  let executions: Model<any>;
  let queued: Array<{ scenarioId: string; dto: any }>;
  let results: any[];

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const executionService = {
      execute: jest.fn(async (scenarioId: string, dto: any, internal: any) => {
        queued.push({ scenarioId, dto });
        const executionId = `exec_${queued.length}_${Date.now()}`;
        await executions.create({
          executionId,
          scenarioId: new Types.ObjectId(scenarioId),
          personaId: new Types.ObjectId(dto.personaId),
          status: 'queued',
          startTime: new Date(),
          triggeredBy: 'system',
          runSetId: internal.runSetId,
        });
        return { executionId };
      }),
    };
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: RunSet.name, schema: RunSetSchema },
          { name: ScenarioExecution.name, schema: ScenarioExecutionSchema },
          { name: Persona.name, schema: PersonaSchema },
          { name: Scenario.name, schema: ScenarioSchema },
          { name: ToolFixture.name, schema: ToolFixtureSchema },
        ]),
      ],
      providers: [
        RunSetService,
        ToolFixtureService,
        { provide: ScenarioExecutionService, useValue: executionService },
        {
          provide: ScorecardsService,
          useValue: { findResultsByExecutions: async (ids: string[]) =>
            results.filter((r) => ids.includes(r.scenarioExecutionId)) },
        },
      ],
    }).compile();
    service = module.get(RunSetService);
    fixtures = module.get(getModelToken(ToolFixture.name));
    scenarios = module.get(getModelToken(Scenario.name));
    executions = module.get(getModelToken(ScenarioExecution.name));
  });

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    queued = [];
    results = [];
    await Promise.all([fixtures.deleteMany({}), scenarios.deleteMany({}), executions.deleteMany({})]);
  });

  const scorecardId = new Types.ObjectId().toString();
  const personaId = new Types.ObjectId().toString();
  const promptId = new Types.ObjectId().toString();

  async function seed() {
    const tool = (name: string, isActive = true) =>
      fixtures.create({ name, description: name, isActive, mockResponses: [] });
    const [lookup, refund] = [await tool('lookup_order'), await tool('issue_refund')];
    await tool('old_tool', false);
    const scenario = await scenarios.create({
      name: 'Late Refund Request',
      prompt: 'refund please',
      status: 'active',
      scorecardId: new Types.ObjectId(scorecardId),
    });
    return { ids: [lookup._id.toString(), refund._id.toString()], scenarioId: scenario._id.toString() };
  }

  it('gives every run all active tools and the scenario scorecard when the request names none', async () => {
    const { ids, scenarioId } = await seed();

    const { id } = await service.create({
      kind: 'reliability', scenarioId, promptId, personaIds: [personaId], k: 2,
    });

    expect(queued).toHaveLength(2);
    for (const q of queued) {
      expect([...q.dto.toolFixtureIds].sort()).toEqual([...ids].sort());
      expect(q.dto.scorecardId).toBe(scorecardId);
    }
    const view = await service.get(id);
    expect([...view.toolFixtureIds].sort()).toEqual([...ids].sort());
    expect(view.scorecardId).toBe(scorecardId);
  });

  it("uses the agent's own tools when the request names none", async () => {
    const { ids, scenarioId } = await seed();
    const agent = new Types.ObjectId();
    await scenarios.db.collection('prompts').insertOne({ _id: agent, name: 'Acme', content: 'x', toolFixtureIds: [ids[1]] });

    await service.create({ kind: 'reliability', scenarioId, promptId: agent.toString(), personaIds: [personaId], k: 1 });

    expect(queued[0].dto.toolFixtureIds).toEqual([ids[1]]);
  });

  it('runs a set compared against a baseline with the baseline tools and scorecard', async () => {
    const { ids, scenarioId } = await seed();
    const otherScorecard = new Types.ObjectId().toString();
    const baseline = await service.create({
      kind: 'reliability', scenarioId, promptId, personaIds: [personaId], k: 1,
      toolFixtureIds: [ids[0]], scorecardId: otherScorecard,
    });
    queued = [];

    const after = await service.create({
      kind: 'compare', scenarioId, promptId, personaIds: [personaId], k: 1,
      baselineRunSetId: baseline.id,
    });

    expect(queued[0].dto.toolFixtureIds).toEqual([ids[0]]);
    expect(queued[0].dto.scorecardId).toBe(otherScorecard);
    expect((await service.get(after.id)).scorecardId).toBe(otherScorecard);
  });

  it('counts every recent run for the wall and leaves out failures older than the window', async () => {
    const scenarioId = new Types.ObjectId();
    const now = new Date();
    const old = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    await executions.collection.insertMany([
      { executionId: 'exec_single', scenarioId, status: 'completed', createdAt: now },
      { executionId: 'exec_chat', status: 'running', mode: 'manual', createdAt: now },
      { executionId: 'exec_old', scenarioId, status: 'completed', createdAt: old },
    ]);
    const failed = (exec: string, name: string) => ({
      scenarioExecutionId: exec,
      status: 'completed',
      passed: false,
      criteriaResults: [{ criteriaKey: name, criteriaName: name, passed: false }],
    });
    results = [failed('exec_single', 'States 30 days'), failed('exec_old', 'Rehearsal check')];

    const stats = await service.roomStats(now);

    expect(stats.runsLast10Min).toBe(2);
    expect(stats.topFailingChecks.map((c) => c.name)).toEqual(['States 30 days']);
  });
});
