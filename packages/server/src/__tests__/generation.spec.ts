import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  GenerationService,
  PersistSuiteResult,
} from '../generation/generation.service';
import { GenerationController } from '../generation/generation.controller';
import {
  ScenarioService,
  PersonaService,
  GeneratedSuite,
} from '@chanl/scenarios-core';
import { ScorecardsService } from '@chanl/scorecards-core';
import { SettingsService } from '../settings/settings.service';

// ---------------------------------------------------------------------------
// Mock the core generateTestSuite function from scenarios-core
// ---------------------------------------------------------------------------

jest.mock('@chanl/scenarios-core', () => ({
  ...jest.requireActual('@chanl/scenarios-core'),
  generateTestSuite: jest.fn(),
}));

import { generateTestSuite } from '@chanl/scenarios-core';
const mockGenerateTestSuite = generateTestSuite as jest.MockedFunction<
  typeof generateTestSuite
>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const personaId1 = new Types.ObjectId().toString();
const personaId2 = new Types.ObjectId().toString();
const personaId3 = new Types.ObjectId().toString();
const scorecardId = new Types.ObjectId().toString();
const categoryId = new Types.ObjectId().toString();
const scenarioId1 = new Types.ObjectId().toString();
const scenarioId2 = new Types.ObjectId().toString();
const scenarioId3 = new Types.ObjectId().toString();

const fakeSuite: GeneratedSuite = {
  scenarios: [
    {
      name: 'Refund Request',
      description: 'Customer wants a refund',
      prompt: 'I want to return my order and get a refund.',
      category: 'support',
      difficulty: 'easy',
      tags: ['refund'],
      context: { situation: 'Customer purchased item online' },
      groundTruth: 'Process refund per policy',
    },
    {
      name: 'Billing Dispute',
      description: 'Customer disputes a charge',
      prompt: 'I was charged twice for the same item.',
      category: 'support',
      difficulty: 'medium',
      tags: ['billing'],
    },
    {
      name: 'Angry Escalation',
      description: 'Customer demands manager',
      prompt: 'I want to speak to your manager right now!',
      category: 'support',
      difficulty: 'hard',
      tags: ['escalation'],
    },
  ],
  personas: [
    {
      name: 'Polite Pat',
      gender: 'female',
      emotion: 'calm',
      language: 'en',
      accent: 'neutral',
      intentClarity: 'very clear',
      speechStyle: 'normal',
      backgroundNoise: false,
      allowInterruptions: false,
      description: 'A calm, polite customer',
      backstory: 'You are a patient customer who speaks clearly.',
      behavior: {
        personality: 'friendly',
        cooperationLevel: 'cooperative',
        patience: 'patient',
        communicationStyle: 'direct',
      },
      variables: {},
      tags: ['polite'],
    },
    {
      name: 'Frustrated Frank',
      gender: 'male',
      emotion: 'frustrated',
      language: 'en',
      accent: 'neutral',
      intentClarity: 'very clear',
      speechStyle: 'fast',
      backgroundNoise: false,
      allowInterruptions: true,
      description: 'A frustrated customer',
      backstory: 'You are an impatient customer who has been on hold.',
      behavior: {
        personality: 'assertive',
        cooperationLevel: 'difficult',
        patience: 'impatient',
        communicationStyle: 'direct',
      },
      variables: {},
      tags: ['frustrated'],
    },
    {
      name: 'Angry Alex',
      gender: 'male',
      emotion: 'irritated',
      language: 'en',
      accent: 'neutral',
      intentClarity: 'slightly unclear',
      speechStyle: 'fast',
      backgroundNoise: true,
      allowInterruptions: true,
      description: 'A very angry customer',
      backstory: 'You are furious after being overcharged three times.',
      behavior: {
        personality: 'demanding',
        cooperationLevel: 'hostile',
        patience: 'very impatient',
        communicationStyle: 'verbose',
      },
      variables: {},
      tags: ['angry'],
    },
  ],
  scorecard: {
    name: 'Support Evaluation',
    description: 'Scorecard for support agent evaluation',
    criteria: [
      {
        key: 'greeting',
        name: 'Greeting Quality',
        description: 'Did the agent greet the customer properly?',
        type: 'prompt',
        settings: { prompt: 'Evaluate the greeting quality' },
        threshold: { min: 70 },
      },
      {
        key: 'resolution',
        name: 'Resolution',
        description: 'Was the issue resolved?',
        type: 'prompt',
        settings: { prompt: 'Evaluate issue resolution' },
      },
    ],
  },
  summary: 'Test suite for customer support agent',
  domain: 'customer-support',
};

// ---------------------------------------------------------------------------
// GenerationService Tests
// ---------------------------------------------------------------------------

describe('GenerationService', () => {
  let service: GenerationService;
  let mockScenarioService: any;
  let mockPersonaService: any;
  let mockScorecardsService: any;
  let mockSettingsService: any;

  beforeEach(async () => {
    mockScenarioService = {
      create: jest.fn(),
    };

    mockPersonaService = {
      create: jest.fn(),
    };

    mockScorecardsService = {
      createScorecard: jest.fn(),
      createCategory: jest.fn(),
      createCriteria: jest.fn(),
    };

    mockSettingsService = {
      get: jest.fn().mockResolvedValue(null),
    };

    // Default: generateTestSuite returns the fake suite
    mockGenerateTestSuite.mockResolvedValue(fakeSuite);

    // Default: persona create returns docs with sequential IDs
    const personaIds = [personaId1, personaId2, personaId3];
    mockPersonaService.create
      .mockResolvedValueOnce({ id: personaIds[0], name: 'Polite Pat' })
      .mockResolvedValueOnce({ id: personaIds[1], name: 'Frustrated Frank' })
      .mockResolvedValueOnce({ id: personaIds[2], name: 'Angry Alex' });

    // Default: scorecard create returns doc with ID
    mockScorecardsService.createScorecard.mockResolvedValue({
      id: scorecardId,
    });
    mockScorecardsService.createCategory.mockResolvedValue({
      id: categoryId,
    });
    mockScorecardsService.createCriteria.mockResolvedValue({ id: 'crit-1' });

    // Default: scenario create returns docs with sequential IDs
    const scenarioIds = [scenarioId1, scenarioId2, scenarioId3];
    mockScenarioService.create
      .mockResolvedValueOnce({ id: scenarioIds[0] })
      .mockResolvedValueOnce({ id: scenarioIds[1] })
      .mockResolvedValueOnce({ id: scenarioIds[2] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenerationService,
        { provide: ScenarioService, useValue: mockScenarioService },
        { provide: PersonaService, useValue: mockPersonaService },
        { provide: ScorecardsService, useValue: mockScorecardsService },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    service = module.get<GenerationService>(GenerationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── generatePreview ──────────────────────────────────────────────────

  describe('generatePreview', () => {
    it('should call generateTestSuite with enriched settings', async () => {
      const request = {
        systemPrompt: 'You are a helpful support agent.',
        count: 3,
      };

      const result = await service.generatePreview(request);

      expect(mockGenerateTestSuite).toHaveBeenCalledTimes(1);
      expect(mockGenerateTestSuite).toHaveBeenCalledWith(
        expect.objectContaining({ systemPrompt: request.systemPrompt }),
      );
      expect(result).toEqual(fakeSuite);
    });

    it('should enrich request with settings when no apiKey provided', async () => {
      mockSettingsService.get.mockResolvedValue({
        simulationProvider: 'anthropic',
        simulationApiKey: 'sk-test-key',
        simulationModel: 'claude-3-haiku-20240307',
      });

      const request = { systemPrompt: 'You are a support agent.' };
      await service.generatePreview(request);

      expect(mockGenerateTestSuite).toHaveBeenCalledWith(
        expect.objectContaining({
          adapterType: 'anthropic',
          adapterConfig: expect.objectContaining({
            apiKey: 'sk-test-key',
            model: 'claude-3-haiku-20240307',
          }),
        }),
      );
    });

    it('should skip settings enrichment when apiKey already provided', async () => {
      mockSettingsService.get.mockResolvedValue({
        simulationProvider: 'anthropic',
        simulationApiKey: 'sk-settings-key',
      });

      const request = {
        systemPrompt: 'You are a support agent.',
        adapterConfig: { apiKey: 'sk-request-key' },
      };
      await service.generatePreview(request);

      // Should use the request's own apiKey, not the settings one
      expect(mockGenerateTestSuite).toHaveBeenCalledWith(
        expect.objectContaining({
          adapterConfig: expect.objectContaining({
            apiKey: 'sk-request-key',
          }),
        }),
      );
    });
  });

  // ── generateAndPersist ───────────────────────────────────────────────

  describe('generateAndPersist', () => {
    it('should create personas first, then scorecard, then scenarios', async () => {
      const callOrder: string[] = [];
      mockPersonaService.create.mockReset();
      mockPersonaService.create.mockImplementation(async () => {
        callOrder.push('persona');
        return { id: new Types.ObjectId().toString() };
      });
      mockScorecardsService.createScorecard.mockImplementation(async () => {
        callOrder.push('scorecard');
        return { id: scorecardId };
      });
      mockScorecardsService.createCategory.mockImplementation(async () => {
        callOrder.push('category');
        return { id: categoryId };
      });
      mockScorecardsService.createCriteria.mockImplementation(async () => {
        callOrder.push('criteria');
        return { id: 'crit-1' };
      });
      mockScenarioService.create.mockReset();
      mockScenarioService.create.mockImplementation(async () => {
        callOrder.push('scenario');
        return { id: new Types.ObjectId().toString() };
      });

      await service.generateAndPersist({
        systemPrompt: 'You are a support agent.',
      });

      // All personas before any scorecard or scenario
      const firstScorecard = callOrder.indexOf('scorecard');
      const firstScenario = callOrder.indexOf('scenario');
      const lastPersona = callOrder.lastIndexOf('persona');

      expect(lastPersona).toBeLessThan(firstScorecard);
      expect(firstScorecard).toBeLessThan(firstScenario);
    });

    it('should link persona IDs to scenarios correctly (1:1 by index)', async () => {
      await service.generateAndPersist({
        systemPrompt: 'You are a support agent.',
      });

      // 3 scenarios, 3 personas — each scenario gets its corresponding persona
      expect(mockScenarioService.create).toHaveBeenCalledTimes(3);

      // Scenario 0 gets personaId1
      const scenario0Call = mockScenarioService.create.mock.calls[0][0];
      expect(scenario0Call.personaIds).toEqual([personaId1]);

      // Scenario 1 gets personaId2
      const scenario1Call = mockScenarioService.create.mock.calls[1][0];
      expect(scenario1Call.personaIds).toEqual([personaId2]);

      // Scenario 2 gets personaId3
      const scenario2Call = mockScenarioService.create.mock.calls[2][0];
      expect(scenario2Call.personaIds).toEqual([personaId3]);
    });

    it('should handle persona creation failure gracefully (logs warning, continues)', async () => {
      // Second persona fails
      mockPersonaService.create.mockReset();
      mockPersonaService.create
        .mockResolvedValueOnce({ id: personaId1 })
        .mockRejectedValueOnce(new Error('DB write failed'))
        .mockResolvedValueOnce({ id: personaId3 });

      const result = await service.generateAndPersist({
        systemPrompt: 'You are a support agent.',
      });

      // Should still create all 3 scenarios, with only 2 persona IDs
      expect(result.personaIds).toHaveLength(2);
      expect(result.personaIds).toEqual([personaId1, personaId3]);
      expect(mockScenarioService.create).toHaveBeenCalledTimes(3);
    });

    it('should return correct counts in result', async () => {
      const result = await service.generateAndPersist({
        systemPrompt: 'You are a support agent.',
      });

      expect(result.scenarioIds).toHaveLength(3);
      expect(result.personaIds).toHaveLength(3);
      expect(result.scorecardId).toBe(scorecardId);
      expect(result.summary).toBe('Test suite for customer support agent');
      expect(result.domain).toBe('customer-support');
    });

    it('should pass scorecardId to created scenarios', async () => {
      await service.generateAndPersist({
        systemPrompt: 'You are a support agent.',
      });

      for (const call of mockScenarioService.create.mock.calls) {
        expect(call[0].scorecardId).toBe(scorecardId);
      }
    });

    it('should tag scenarios and pass auto-generate as source', async () => {
      await service.generateAndPersist({
        systemPrompt: 'You are a support agent.',
      });

      for (const call of mockScenarioService.create.mock.calls) {
        expect(call[0].tags).toContain('auto-generated');
        expect(call[0].status).toBe('active');
        expect(call[1]).toBe('auto-generate');
      }
    });

    it('should handle scorecard creation failure gracefully', async () => {
      mockScorecardsService.createScorecard.mockRejectedValue(
        new Error('Scorecard DB error'),
      );

      const result = await service.generateAndPersist({
        systemPrompt: 'You are a support agent.',
      });

      expect(result.scorecardId).toBeNull();
      // Scenarios should still be created, scorecardId will be undefined
      expect(result.scenarioIds).toHaveLength(3);
      for (const call of mockScenarioService.create.mock.calls) {
        expect(call[0].scorecardId).toBeUndefined();
      }
    });

    it('should create criteria under a default category', async () => {
      await service.generateAndPersist({
        systemPrompt: 'You are a support agent.',
      });

      expect(mockScorecardsService.createCategory).toHaveBeenCalledWith(
        scorecardId,
        expect.objectContaining({
          name: 'Auto-Generated Criteria',
        }),
      );

      // 2 criteria in the fixture
      expect(mockScorecardsService.createCriteria).toHaveBeenCalledTimes(2);
      expect(mockScorecardsService.createCriteria).toHaveBeenCalledWith(
        scorecardId,
        categoryId,
        expect.objectContaining({ key: 'greeting' }),
      );
      expect(mockScorecardsService.createCriteria).toHaveBeenCalledWith(
        scorecardId,
        categoryId,
        expect.objectContaining({ key: 'resolution' }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// GenerationController Tests
// ---------------------------------------------------------------------------

describe('GenerationController', () => {
  let controller: GenerationController;
  let mockGenerationService: any;

  beforeEach(async () => {
    mockGenerationService = {
      generatePreview: jest.fn().mockResolvedValue(fakeSuite),
      generateAndPersist: jest.fn().mockResolvedValue({
        scenarioIds: [scenarioId1, scenarioId2],
        personaIds: [personaId1, personaId2],
        scorecardId,
        summary: 'Test suite for support',
        domain: 'support',
      } as PersistSuiteResult),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GenerationController],
      providers: [
        { provide: GenerationService, useValue: mockGenerationService },
      ],
    }).compile();

    controller = module.get<GenerationController>(GenerationController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /generation/preview', () => {
    it('should return 200 with suite', async () => {
      const result = await controller.preview({
        systemPrompt: 'You are a helpful agent.',
        count: 3,
      });

      expect(result).toEqual({ suite: fakeSuite });
      expect(mockGenerationService.generatePreview).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: 'You are a helpful agent.',
          count: 3,
        }),
      );
    });

    it('should throw BadRequestException with empty systemPrompt', async () => {
      await expect(
        controller.preview({ systemPrompt: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with whitespace-only systemPrompt', async () => {
      await expect(
        controller.preview({ systemPrompt: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should pass optional parameters through to service', async () => {
      await controller.preview({
        systemPrompt: 'Agent prompt',
        count: 5,
        difficulties: ['easy', 'hard'],
        includeAdversarial: true,
        domain: 'sales',
      });

      expect(mockGenerationService.generatePreview).toHaveBeenCalledWith({
        systemPrompt: 'Agent prompt',
        count: 5,
        difficulties: ['easy', 'hard'],
        includeAdversarial: true,
        domain: 'sales',
      });
    });
  });

  describe('POST /generation/from-prompt', () => {
    it('should return 201 with result', async () => {
      const result = await controller.fromPrompt({
        systemPrompt: 'You are a helpful agent.',
      });

      expect(result).toEqual({
        result: expect.objectContaining({
          scenarioIds: [scenarioId1, scenarioId2],
          personaIds: [personaId1, personaId2],
          scorecardId,
        }),
      });
      expect(mockGenerationService.generateAndPersist).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: 'You are a helpful agent.',
        }),
      );
    });

    it('should throw BadRequestException with empty systemPrompt', async () => {
      await expect(
        controller.fromPrompt({ systemPrompt: '' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
