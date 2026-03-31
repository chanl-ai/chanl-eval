import { Test, TestingModule } from '@nestjs/testing';
import { BootstrapService } from '../bootstrap/bootstrap.service';
import { PersonaService } from '@chanl/scenarios-core';
import { ScenarioService } from '@chanl/scenarios-core';
import { ScorecardsService } from '@chanl/scorecards-core';
import { ApiKeyService } from '../auth/api-key.service';
import { Types } from 'mongoose';

describe('BootstrapService', () => {
  let service: BootstrapService;
  let mockPersonaService: any;
  let mockScenarioService: any;
  let mockScorecardsService: any;
  let mockApiKeyService: any;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BootstrapService,
        { provide: PersonaService, useValue: mockPersonaService },
        { provide: ScenarioService, useValue: mockScenarioService },
        { provide: ScorecardsService, useValue: mockScorecardsService },
        { provide: ApiKeyService, useValue: mockApiKeyService },
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
