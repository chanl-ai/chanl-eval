import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { ScenarioService } from '../services/scenario.service';
import {
  Scenario,
  ScenarioSchema,
  ScenarioDocument,
} from '../schemas/scenario.schema';
import {
  ScenarioExecution,
  ScenarioExecutionSchema,
} from '../schemas/scenario-execution.schema';

type ScenarioJson = Scenario & { id: string };

describe('ScenarioService.createDefaultScenarios', () => {
  let service: ScenarioService;
  let scenarioModel: Model<ScenarioDocument>;
  let mongod: MongoMemoryServer;
  let module: TestingModule;

  const personaMap: Record<string, string> = {
    'Angry - Karen': new Types.ObjectId().toString(),
    'Stressed - Mei': new Types.ObjectId().toString(),
    'Curious - Maria': new Types.ObjectId().toString(),
  };

  const scorecardId = new Types.ObjectId().toString();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Scenario.name, schema: ScenarioSchema },
          { name: ScenarioExecution.name, schema: ScenarioExecutionSchema },
        ]),
      ],
      providers: [ScenarioService],
    }).compile();

    service = module.get<ScenarioService>(ScenarioService);
    scenarioModel = module.get<Model<ScenarioDocument>>(
      getModelToken(Scenario.name),
    );
  });

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await scenarioModel.deleteMany({});
  });

  it('should create 3 default scenarios', async () => {
    const result = await service.createDefaultScenarios(
      personaMap,
      scorecardId,
    );

    expect(result).toHaveLength(3);
    expect(result.map((s) => s.name).sort()).toEqual([
      'Angry Customer Refund',
      'Confused Billing Inquiry',
      'Product Interest Call',
    ]);
  });

  it('should create scenarios as active status', async () => {
    const result = await service.createDefaultScenarios(
      personaMap,
      scorecardId,
    );

    for (const scenario of result) {
      expect(scenario.status).toBe('active');
    }
  });

  it('should tag all defaults with _default', async () => {
    const result = await service.createDefaultScenarios(
      personaMap,
      scorecardId,
    );

    for (const scenario of result) {
      expect(scenario.tags).toContain('_default');
    }
  });

  it('should assign correct personas to each scenario', async () => {
    const result = await service.createDefaultScenarios(
      personaMap,
      scorecardId,
    );

    const angry = result.find((s) => s.name === 'Angry Customer Refund');
    const confused = result.find(
      (s) => s.name === 'Confused Billing Inquiry',
    );
    const product = result.find(
      (s) => s.name === 'Product Interest Call',
    );

    expect(angry!.personaIds.map((p) => p.toString())).toContain(
      personaMap['Angry - Karen'],
    );
    expect(confused!.personaIds.map((p) => p.toString())).toContain(
      personaMap['Stressed - Mei'],
    );
    expect(product!.personaIds.map((p) => p.toString())).toContain(
      personaMap['Curious - Maria'],
    );
  });

  it('should set scorecardId on all scenarios', async () => {
    const result = await service.createDefaultScenarios(
      personaMap,
      scorecardId,
    );

    for (const scenario of result) {
      expect(scenario.scorecardId?.toString()).toBe(scorecardId);
    }
  });

  it('should assign correct categories', async () => {
    const result = await service.createDefaultScenarios(
      personaMap,
      scorecardId,
    );

    const angry = result.find((s) => s.name === 'Angry Customer Refund');
    const product = result.find(
      (s) => s.name === 'Product Interest Call',
    );

    expect(angry!.category).toBe('support');
    expect(product!.category).toBe('sales');
  });

  it('should be idempotent — skip if defaults exist', async () => {
    const first = await service.createDefaultScenarios(
      personaMap,
      scorecardId,
    );
    expect(first).toHaveLength(3);

    const second = await service.createDefaultScenarios(
      personaMap,
      scorecardId,
    );
    expect(second).toHaveLength(3);

    // Should still have only 3 in DB
    const count = await scenarioModel.countDocuments({ tags: '_default' });
    expect(count).toBe(3);
  });

  it('should not duplicate when seeders run concurrently', async () => {
    // The unique index is what enforces this, so it has to exist before the race.
    await scenarioModel.createIndexes();

    const runs = await Promise.all([
      service.createDefaultScenarios(personaMap, scorecardId),
      service.createDefaultScenarios(personaMap, scorecardId),
      service.createDefaultScenarios(personaMap, scorecardId),
    ]);

    for (const run of runs) {
      expect(run).toHaveLength(3);
    }

    const count = await scenarioModel.countDocuments({ tags: '_default' });
    expect(count).toBe(3);
  });

  it('should let the database reject a second row for a seeded name', async () => {
    // The upsert alone leaves a read-then-write window, so the guarantee rests on the index.
    // Written against the driver to bypass the service and assert the constraint itself.
    await scenarioModel.createIndexes();
    await service.createDefaultScenarios(personaMap, scorecardId);

    await expect(
      scenarioModel.collection.insertOne({
        name: 'Angry Customer Refund',
        createdBy: 'system',
      }),
    ).rejects.toThrow(/E11000/);
  });

  it('should leave user scenarios unconstrained', async () => {
    await scenarioModel.createIndexes();
    await service.createDefaultScenarios(personaMap, scorecardId);

    // Importing the same YAML twice, or cloning twice, legitimately repeats a name.
    const personaIds = [personaMap['Angry - Karen']];
    await service.create({
      name: 'Angry Customer Refund',
      category: 'support',
      difficulty: 'medium',
      prompt: 'Mine',
      personaIds,
    });
    await service.create({
      name: 'Angry Customer Refund',
      category: 'support',
      difficulty: 'medium',
      prompt: 'Mine again',
      personaIds,
    });

    const mine = await service.findAll({ createdBy: 'local' });
    expect(mine.total).toBe(2);
  });

  it('should not overwrite a default the user has edited', async () => {
    const [seeded] = await service.createDefaultScenarios(
      personaMap,
      scorecardId,
    );
    await scenarioModel.updateOne(
      { name: seeded.name },
      { $set: { prompt: 'Edited by the user', difficulty: 'hard' } },
    );

    await service.createDefaultScenarios(personaMap, scorecardId);

    const after = await scenarioModel.findOne({ name: seeded.name });
    expect(after!.prompt).toBe('Edited by the user');
    expect(after!.difficulty).toBe('hard');
  });

  it('should work without scorecardId', async () => {
    const result = await service.createDefaultScenarios(personaMap);

    expect(result).toHaveLength(3);
    for (const scenario of result) {
      expect(scenario.scorecardId).toBeUndefined();
    }
  });

  it('should handle empty persona map gracefully', async () => {
    const result = await service.createDefaultScenarios({}, scorecardId);

    expect(result).toHaveLength(3);
    for (const scenario of result) {
      expect(scenario.personaIds).toHaveLength(0);
    }
  });

  it('should have non-empty prompts on all scenarios', async () => {
    const result = await service.createDefaultScenarios(
      personaMap,
      scorecardId,
    );

    for (const scenario of result) {
      expect(scenario.prompt).toBeTruthy();
      expect(scenario.prompt.length).toBeGreaterThan(10);
    }
  });

  it('should have descriptions on all scenarios', async () => {
    const result = await service.createDefaultScenarios(
      personaMap,
      scorecardId,
    );

    for (const scenario of result) {
      expect(scenario.description).toBeTruthy();
      expect(scenario.description!.length).toBeGreaterThan(20);
    }
  });

  it('should set createdBy to system', async () => {
    const result = await service.createDefaultScenarios(
      personaMap,
      scorecardId,
    );

    for (const scenario of result) {
      expect(scenario.createdBy).toBe('system');
    }
  });
});
