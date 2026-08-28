import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ScenarioExecutionService } from '../services/scenario-execution.service';
import { QueueProducerService } from '../../execution/queue-producer.service';
import {
  SIMULATION_CONFIG_PROVIDER,
  SimulationConfigProvider,
} from '../../execution/simulation-config.provider';
import { EvaluationService } from '@chanl/scorecards-core';
import {
  ScenarioExecution,
  ScenarioExecutionSchema,
  ScenarioExecutionDocument,
} from '../schemas/scenario-execution.schema';
import { Scenario, ScenarioSchema, ScenarioDocument } from '../schemas/scenario.schema';

/**
 * The service that decides whether a run happens and whether it gets scored.
 *
 * It was untestable while it read the settings collection directly; the injected simulation-config
 * provider is what allows credential resolution to be exercised without a live database or real
 * environment variables.
 */
describe('ScenarioExecutionService', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let service: ScenarioExecutionService;
  let scenarioModel: Model<ScenarioDocument>;
  let executionModel: Model<ScenarioExecutionDocument>;
  let enqueue: jest.Mock;
  let simulationConfig: SimulationConfigProvider;

  const ENV_KEYS = [
    'CHANL_OPENAI_API_KEY',
    'CHANL_ANTHROPIC_API_KEY',
    'CHANL_SIMULATION_BASE_URL',
  ];
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

    mongod = await MongoMemoryServer.create();
    enqueue = jest.fn().mockResolvedValue(undefined);

    simulationConfig = {
      getApiKey: jest.fn().mockResolvedValue(undefined),
      getSimulationBaseUrl: jest.fn().mockResolvedValue(undefined),
    };

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Scenario.name, schema: ScenarioSchema },
          { name: ScenarioExecution.name, schema: ScenarioExecutionSchema },
        ]),
      ],
      providers: [
        ScenarioExecutionService,
        { provide: QueueProducerService, useValue: { enqueueExecution: enqueue } },
        { provide: EvaluationService, useValue: { evaluate: jest.fn() } },
        { provide: SIMULATION_CONFIG_PROVIDER, useValue: simulationConfig },
      ],
    }).compile();
    await module.init();

    service = module.get(ScenarioExecutionService);
    scenarioModel = module.get(getModelToken(Scenario.name));
    executionModel = module.get(getModelToken(ScenarioExecution.name));
  }, 120_000);

  afterAll(async () => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k]!;
    }
    await module?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await scenarioModel.deleteMany({});
    await executionModel.deleteMany({});
    enqueue.mockClear();
    for (const k of ENV_KEYS) delete process.env[k];
    (simulationConfig.getApiKey as jest.Mock).mockResolvedValue(undefined);
    (simulationConfig.getSimulationBaseUrl as jest.Mock).mockResolvedValue(undefined);
  });

  async function seedScenario(status = 'active') {
    return scenarioModel.create({
      name: 'Test scenario',
      prompt: 'A customer wants a refund.',
      status,
      category: 'support',
      difficulty: 'easy',
      personaIds: [new Types.ObjectId()],
    });
  }

  const dto = (promptId = new Types.ObjectId().toString()) => ({
    promptId,
    mode: 'text' as const,
  });

  describe('execute', () => {
    it('creates a queued execution and enqueues exactly one job', async () => {
      const scenario = await seedScenario();

      const execution = await service.execute(scenario.id, dto());

      expect(execution.status).toBe('queued');
      expect(execution.executionId).toMatch(/^exec_/);
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(await executionModel.countDocuments({})).toBe(1);
    });

    it('refuses a scenario that is not active', async () => {
      const scenario = await seedScenario('draft');

      await expect(service.execute(scenario.id, dto())).rejects.toBeInstanceOf(
        BadRequestException,
      );
      // Nothing queued and nothing recorded — a refused run must leave no trace.
      expect(enqueue).not.toHaveBeenCalled();
      expect(await executionModel.countDocuments({})).toBe(0);
    });

    it('refuses an unknown scenario', async () => {
      await expect(
        service.execute(new Types.ObjectId().toString(), dto()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('accepts either the mongo id or the executionId', async () => {
      const scenario = await seedScenario();
      const created = await service.execute(scenario.id, dto());

      const byUuid = await service.findOne(created.executionId!);
      const byObjectId = await service.findOne((created as any).id);

      expect(byUuid.executionId).toBe(created.executionId);
      expect(byObjectId.executionId).toBe(created.executionId);
    });

    it('raises NotFound for an unknown id', async () => {
      await expect(service.findOne('exec_missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('cancel', () => {
    it('raises NotFound rather than silently succeeding', async () => {
      await expect(service.cancel('exec_missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('judge credential resolution', () => {
    // Reaches the private resolver through its only caller's dependency, which is the seam A6
    // introduced. Previously this path read the settings collection directly and could not be
    // exercised without a live database.
    async function resolve() {
      return (service as any).resolveJudgeConfig();
    }

    it('prefers the operator-configured OpenAI key', async () => {
      (simulationConfig.getApiKey as jest.Mock).mockImplementation(
        async (p: string) => (p === 'openai' ? 'sk-from-settings' : undefined),
      );

      expect(await resolve()).toMatchObject({
        judgeApiKey: 'sk-from-settings',
        judgeKind: 'openai',
      });
    });

    it('falls back to Anthropic when only that key is configured', async () => {
      (simulationConfig.getApiKey as jest.Mock).mockImplementation(
        async (p: string) => (p === 'anthropic' ? 'sk-ant' : undefined),
      );

      expect(await resolve()).toMatchObject({
        judgeApiKey: 'sk-ant',
        judgeKind: 'anthropic',
      });
    });

    it('passes the simulation host through', async () => {
      (simulationConfig.getApiKey as jest.Mock).mockResolvedValue('sk-x');
      (simulationConfig.getSimulationBaseUrl as jest.Mock).mockResolvedValue(
        'http://localhost:11434/v1',
      );

      expect(await resolve()).toMatchObject({
        judgeBaseUrl: 'http://localhost:11434/v1',
      });
    });

    it('reports no key when none is configured, rather than inventing one', async () => {
      const resolved = await resolve();
      expect(resolved.judgeApiKey).toBeUndefined();
    });

    it('degrades to no key when the config provider throws', async () => {
      // A settings lookup failure must not abort the run; it means the judge is unavailable, which
      // the scoring path already reports as N/A rather than as a bad score.
      (simulationConfig.getApiKey as jest.Mock).mockRejectedValue(
        new Error('database unreachable'),
      );

      const resolved = await resolve();
      expect(resolved.judgeApiKey).toBeUndefined();
      expect(resolved.judgeKind).toBe('openai');
    });

    it('reads no environment variables of its own', async () => {
      // Configuration resolution belongs to the application layer. This package is consumed as a
      // library, so an env read here would be invisible to whoever wires it up.
      process.env.CHANL_OPENAI_API_KEY = 'sk-should-be-ignored';

      const resolved = await resolve();

      expect(resolved.judgeApiKey).toBeUndefined();
    });
  });
});
