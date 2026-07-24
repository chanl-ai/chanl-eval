import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Types } from 'mongoose';
import { BootstrapService } from '../bootstrap/bootstrap.service';
import { BootstrapModule } from '../bootstrap/bootstrap.module';
import { PersonaService } from '@chanl/scenarios-core';
import { ScenarioService } from '@chanl/scenarios-core';
import { ScorecardsService } from '@chanl/scorecards-core';
import { ApiKeyService } from '../auth/api-key.service';
import { PromptsService } from '../prompts/prompts.service';

// ════════════════════════════════════════════════════════════════════════════
// First-run contract — assertions on STATE, not on mock calls.
//
// The mock-based suite below could not catch a seeder that was never wired: it asserts
// `expect(mockX.createDefaults).toHaveBeenCalled()`, and a service that is never invoked has no
// mock to fail. That shape let the quickstart ship with zero prompts seeded, so a fresh install
// hit "promptId must be a string" on the very first Run while this file stayed green.
//
// These tests boot the real services against an in-memory Mongo and assert what a first-run user
// actually needs to exist. They fail if any seeder is dropped, renamed, or never called.
// ════════════════════════════════════════════════════════════════════════════
describe('BootstrapService — first-run contract (real DB)', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let service: BootstrapService;
  // Must come from the Nest module: MongooseModule opens its own connection, so the global
  // `mongoose.connection` is never connected here and every query would hang until the test timeout.
  let connection: Connection;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    module = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(mongod.getUri()), BootstrapModule],
    }).compile();
    await module.init();
    connection = module.get<Connection>(getConnectionToken());
    service = module.get(BootstrapService);
    await service.onApplicationBootstrap();
  }, 120_000);

  afterAll(async () => {
    await module?.close();
    await mongod?.stop();
  });

  it('reports itself seeded', () => {
    expect(service.isSeeded).toBe(true);
  });

  it.each([
    ['personas', 'a scenario needs a persona to drive the conversation'],
    ['scorecards', 'a run needs a rubric to be scored against'],
    ['scenarios', 'there must be something to run'],
    ['prompts', 'execute requires a promptId — with none, the first Run 400s'],
  ])('seeds at least one document into %s (%s)', async (collection) => {
    const count = await connection.collection(collection).countDocuments({});
    expect(count).toBeGreaterThan(0);
  });

  it('seeds a runnable pair: a scenario and a prompt to execute it against', async () => {
    // This is the actual first-run contract. Either half alone is useless.
    const [scenarios, prompts] = await Promise.all([
      connection.collection('scenarios').countDocuments({}),
      connection.collection('prompts').countDocuments({}),
    ]);
    expect({ scenarios: scenarios > 0, prompts: prompts > 0 }).toEqual({
      scenarios: true,
      prompts: true,
    });
  });

  it('gives every seeded prompt the adapter config a run needs', async () => {
    const prompts = await connection.collection('prompts').find({}).toArray();
    for (const p of prompts) {
      expect(p.content?.length).toBeGreaterThan(0);
      expect(p.adapterConfig?.adapterType).toBeTruthy();
      expect(p.adapterConfig?.model).toBeTruthy();
    }
  });

  it('is idempotent — a second boot does not duplicate seed data', async () => {
    const before = await connection.collection('prompts').countDocuments({});

    await service.onApplicationBootstrap();

    const after = await connection.collection('prompts').countDocuments({});
    expect(after).toBe(before);
  });
});

describe('BootstrapService', () => {
  let service: BootstrapService;
  let mockPersonaService: any;
  let mockScenarioService: any;
  let mockScorecardsService: any;
  let mockApiKeyService: any;
  let mockPromptsService: any;

  const fakePersonas = [
    { name: 'Angry - Karen', id: new Types.ObjectId().toString() },
    { name: 'Stressed - Mei', id: new Types.ObjectId().toString() },
    { name: 'Curious - Maria', id: new Types.ObjectId().toString() },
    { name: 'Friendly - Sophia', id: new Types.ObjectId().toString() },
  ];

  const fakeScorecardId = new Types.ObjectId();

  beforeEach(async () => {
    mockPersonaService = {
      createDefaultPersonas: jest.fn().mockResolvedValue(fakePersonas),
    };

    mockScenarioService = {
      createDefaultScenarios: jest.fn().mockResolvedValue([
        { name: 'Angry Customer Refund' },
        { name: 'Confused Billing Inquiry' },
        { name: 'Product Interest Call' },
      ]),
    };

    mockScorecardsService = {
      createDefaultScorecardIfNeeded: jest
        .fn()
        .mockResolvedValue(fakeScorecardId),
    };

    mockApiKeyService = {
      hasAnyKeys: jest.fn().mockResolvedValue(false),
      createApiKey: jest.fn().mockResolvedValue({
        key: 'eval_bootstrap123',
        name: 'bootstrap',
      }),
    };

    mockPromptsService = {
      createDefaultPromptsIfNeeded: jest
        .fn()
        .mockResolvedValue([{ name: 'Customer Support Agent' }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BootstrapService,
        { provide: PersonaService, useValue: mockPersonaService },
        { provide: ScenarioService, useValue: mockScenarioService },
        { provide: ScorecardsService, useValue: mockScorecardsService },
        { provide: ApiKeyService, useValue: mockApiKeyService },
        { provide: PromptsService, useValue: mockPromptsService },
      ],
    }).compile();

    service = module.get<BootstrapService>(BootstrapService);
  });

  it('should not be seeded before onApplicationBootstrap', () => {
    expect(service.isSeeded).toBe(false);
  });

  it('should seed all defaults on fresh DB', async () => {
    await service.onApplicationBootstrap();

    expect(service.isSeeded).toBe(true);
    expect(mockApiKeyService.hasAnyKeys).toHaveBeenCalled();
    expect(mockApiKeyService.createApiKey).toHaveBeenCalledWith('bootstrap');
    expect(mockPersonaService.createDefaultPersonas).toHaveBeenCalledWith(
      'system',
    );
    expect(
      mockScorecardsService.createDefaultScorecardIfNeeded,
    ).toHaveBeenCalled();
    expect(mockPromptsService.createDefaultPromptsIfNeeded).toHaveBeenCalled();
    expect(mockScenarioService.createDefaultScenarios).toHaveBeenCalledWith(
      expect.objectContaining({
        'Angry - Karen': fakePersonas[0].id,
        'Stressed - Mei': fakePersonas[1].id,
        'Curious - Maria': fakePersonas[2].id,
      }),
      fakeScorecardId.toString(),
    );
  });

  it('should skip API key creation when keys already exist', async () => {
    mockApiKeyService.hasAnyKeys.mockResolvedValue(true);

    await service.onApplicationBootstrap();

    expect(mockApiKeyService.createApiKey).not.toHaveBeenCalled();
    expect(service.isSeeded).toBe(true);
  });

  it('should pass persona IDs to createDefaultScenarios', async () => {
    await service.onApplicationBootstrap();

    const personaMap =
      mockScenarioService.createDefaultScenarios.mock.calls[0][0];
    expect(personaMap['Angry - Karen']).toBe(fakePersonas[0].id);
    expect(personaMap['Stressed - Mei']).toBe(fakePersonas[1].id);
    expect(personaMap['Curious - Maria']).toBe(fakePersonas[2].id);
    expect(personaMap['Friendly - Sophia']).toBe(fakePersonas[3].id);
  });

  it('should pass scorecard ID to createDefaultScenarios', async () => {
    await service.onApplicationBootstrap();

    const scorecardArg =
      mockScenarioService.createDefaultScenarios.mock.calls[0][1];
    expect(scorecardArg).toBe(fakeScorecardId.toString());
  });

  it('should never crash server on error', async () => {
    mockPersonaService.createDefaultPersonas.mockRejectedValue(
      new Error('DB connection failed'),
    );

    // Should NOT throw
    await service.onApplicationBootstrap();

    // seeded stays false on error
    expect(service.isSeeded).toBe(false);
  });

  it('should be idempotent (createDefaultPersonas handles it)', async () => {
    // First boot
    await service.onApplicationBootstrap();
    expect(service.isSeeded).toBe(true);

    // Second boot — services internally skip if defaults exist
    mockApiKeyService.hasAnyKeys.mockResolvedValue(true);
    await service.onApplicationBootstrap();
    expect(service.isSeeded).toBe(true);
    expect(mockApiKeyService.createApiKey).toHaveBeenCalledTimes(1);
  });

  it('should handle null scorecard ID gracefully', async () => {
    mockScorecardsService.createDefaultScorecardIfNeeded.mockResolvedValue(
      null,
    );

    await service.onApplicationBootstrap();

    expect(mockScenarioService.createDefaultScenarios).toHaveBeenCalledWith(
      expect.any(Object),
      undefined,
    );
    expect(service.isSeeded).toBe(true);
  });
});
