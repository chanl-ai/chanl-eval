import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { EvaluationService } from './evaluation.service';
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
} from '../schemas';
import {
  CriteriaHandlerRegistry,
  KeywordHandler,
  ResponseTimeHandler,
  ToolCallHandler,
  PromptHandler,
  EvaluationContext,
} from '../handlers';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
});

afterAll(async () => {
  await mongod.stop();
});

describe('EvaluationService', () => {
  let service: EvaluationService;
  let module: TestingModule;
  let scorecardModel: Model<any>;
  let categoryModel: Model<any>;
  let criteriaModel: Model<any>;
  let resultModel: Model<any>;

  // Helper: create a full scorecard with categories and criteria
  async function createTestScorecard(opts?: {
    algorithm?: string;
    passingThreshold?: number;
  }) {
    const scorecard = await scorecardModel.create({
      name: 'Test Scorecard',
      status: 'active',
      scoringAlgorithm: opts?.algorithm || 'weighted_average',
      passingThreshold: opts?.passingThreshold ?? 70,
    });

    const cat1 = await categoryModel.create({
      scorecardId: scorecard._id,
      name: 'Communication',
      weight: 60,
      order: 0,
      version: 1,
    });

    const cat2 = await categoryModel.create({
      scorecardId: scorecard._id,
      name: 'Timing',
      weight: 40,
      order: 1,
      version: 1,
    });

    // Keyword criterion in Communication
    const c1 = await criteriaModel.create({
      scorecardId: scorecard._id,
      categoryId: cat1._id,
      key: 'greeting',
      name: 'Proper Greeting',
      type: CriteriaType.KEYWORD,
      settings: { matchType: 'must_contain', keyword: ['hello', 'hi', 'how can I help'] },
      threshold: { expectedValue: true },
      isActive: true,
    });

    // Keyword criterion in Communication (must not contain bad words)
    const c2 = await criteriaModel.create({
      scorecardId: scorecard._id,
      categoryId: cat1._id,
      key: 'no_profanity',
      name: 'No Profanity',
      type: CriteriaType.KEYWORD,
      settings: { matchType: 'must_not_contain', keyword: ['damn', 'crap', 'stupid'] },
      isActive: true,
    });

    // Response time criterion in Timing
    const c3 = await criteriaModel.create({
      scorecardId: scorecard._id,
      categoryId: cat2._id,
      key: 'response_time',
      name: 'Agent Response Time',
      type: CriteriaType.RESPONSE_TIME,
      settings: { participant: 'agent' },
      threshold: { max: 5 },
      isActive: true,
    });

    return { scorecard, cat1, cat2, criteria: [c1, c2, c3] };
  }

  function makeContext(overrides?: Partial<EvaluationContext>): EvaluationContext {
    return {
      transcriptText:
        'Agent: Hello, how can I help you today?\nCustomer: I need help with my order.\nAgent: Sure, let me check that for you.\nCustomer: Thank you.',
      segments: [
        { speaker: 'agent', text: 'Hello, how can I help you today?', startTime: 0, endTime: 3 },
        { speaker: 'customer', text: 'I need help with my order.', startTime: 4, endTime: 7 },
        { speaker: 'agent', text: 'Sure, let me check that for you.', startTime: 8, endTime: 12 },
        { speaker: 'customer', text: 'Thank you.', startTime: 13, endTime: 14 },
      ],
      metrics: {
        duration: 14,
        firstResponseLatency: 1.5,
        talkTime: { agent: 8, customer: 5 },
        silence: { total: 1, max: 1, average: 0.5 },
        interruptions: { agent: 0, customer: 0 },
      },
      toolCalls: [],
      ...overrides,
    };
  }

  beforeEach(async () => {
    const registry = new CriteriaHandlerRegistry();
    registry.register(new KeywordHandler());
    registry.register(new PromptHandler());
    registry.register(new ResponseTimeHandler());
    registry.register(new ToolCallHandler());

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri(), {
          dbName: `eval_test_${Date.now()}`,
        }),
        MongooseModule.forFeature([
          { name: Scorecard.name, schema: ScorecardSchema },
          { name: ScorecardCategory.name, schema: ScorecardCategorySchema },
          { name: ScorecardCriteria.name, schema: ScorecardCriteriaSchema },
          { name: ScorecardResult.name, schema: ScorecardResultSchema },
        ]),
      ],
      providers: [
        EvaluationService,
        { provide: CriteriaHandlerRegistry, useValue: registry },
      ],
    }).compile();

    service = module.get<EvaluationService>(EvaluationService);
    scorecardModel = module.get<Model<any>>(getModelToken(Scorecard.name));
    categoryModel = module.get<Model<any>>(getModelToken(ScorecardCategory.name));
    criteriaModel = module.get<Model<any>>(getModelToken(ScorecardCriteria.name));
    resultModel = module.get<Model<any>>(getModelToken(ScorecardResult.name));
  });

  afterEach(async () => {
    await module?.close();
  });

  it('should evaluate a transcript and return results', async () => {
    const { scorecard } = await createTestScorecard();
    const result = await service.evaluate(
      scorecard._id.toString(),
      makeContext(),
    );

    expect(result.status).toBe('completed');
    expect(result.scorecardId).toBe(scorecard._id.toString());
    expect(result.criteriaResults).toHaveLength(3);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(typeof result.passed).toBe('boolean');
  });

  it('should store result in database', async () => {
    const { scorecard } = await createTestScorecard();
    const result = await service.evaluate(
      scorecard._id.toString(),
      makeContext(),
    );

    const dbResult = await resultModel.findById(result.resultId);
    expect(dbResult).not.toBeNull();
    expect(dbResult!.status).toBe('completed');
    expect(dbResult!.overallScore).toBeGreaterThan(0);
    expect(dbResult!.criteriaResults).toHaveLength(3);
  });

  it('should pass keyword criteria when keywords found', async () => {
    const { scorecard } = await createTestScorecard();
    const result = await service.evaluate(
      scorecard._id.toString(),
      makeContext(),
    );

    const greetingResult = result.criteriaResults.find(
      (cr) => cr.criteriaKey === 'greeting',
    );
    expect(greetingResult).toBeDefined();
    expect(greetingResult!.passed).toBe(true);
    expect(greetingResult!.reasoning).toContain('Keywords found');
  });

  it('should pass no-profanity when bad words absent', async () => {
    const { scorecard } = await createTestScorecard();
    const result = await service.evaluate(
      scorecard._id.toString(),
      makeContext(),
    );

    const profanityResult = result.criteriaResults.find(
      (cr) => cr.criteriaKey === 'no_profanity',
    );
    expect(profanityResult).toBeDefined();
    expect(profanityResult!.passed).toBe(true);
  });

  it('should pass response time when within threshold', async () => {
    const { scorecard } = await createTestScorecard();
    const result = await service.evaluate(
      scorecard._id.toString(),
      makeContext(),
    );

    const rtResult = result.criteriaResults.find(
      (cr) => cr.criteriaKey === 'response_time',
    );
    expect(rtResult).toBeDefined();
    expect(rtResult!.result).toBe(1.5);
    expect(rtResult!.passed).toBe(true);
  });

  it('should calculate weighted category scores', async () => {
    const { scorecard } = await createTestScorecard();
    const result = await service.evaluate(
      scorecard._id.toString(),
      makeContext(),
    );

    expect(result.categoryScores['Communication']).toBeDefined();
    expect(result.categoryScores['Timing']).toBeDefined();
    // Communication: greeting=true(10) + profanity=false(not found, passed=true → 10) = avg 10
    expect(result.categoryScores['Communication']).toBe(10);
    // Timing: response_time=1.5 (within threshold → 10) = 10
    expect(result.categoryScores['Timing']).toBe(10);
  });

  it('should fail overall when criteria fail', async () => {
    const { scorecard } = await createTestScorecard({ passingThreshold: 90 });
    // Transcript WITHOUT greeting keyword
    const ctx = makeContext({
      transcriptText: 'Agent: What do you want?\nCustomer: A refund.\nAgent: Fine, damn it.',
      segments: [
        { speaker: 'agent', text: 'What do you want?' },
        { speaker: 'customer', text: 'A refund.' },
        { speaker: 'agent', text: 'Fine, damn it.' },
      ],
    });

    const result = await service.evaluate(
      scorecard._id.toString(),
      ctx,
    );

    const greetingResult = result.criteriaResults.find(
      (cr) => cr.criteriaKey === 'greeting',
    );
    expect(greetingResult!.passed).toBe(false);

    const profanityResult = result.criteriaResults.find(
      (cr) => cr.criteriaKey === 'no_profanity',
    );
    expect(profanityResult!.passed).toBe(false);
  });

  it('should use minimum_all algorithm correctly', async () => {
    const { scorecard } = await createTestScorecard({ algorithm: 'minimum_all' });
    // All should pass with good transcript
    const result = await service.evaluate(
      scorecard._id.toString(),
      makeContext(),
    );

    expect(result.overallScore).toBe(10); // All criteria pass
  });

  it('should return 0 for minimum_all when any criterion fails', async () => {
    const { scorecard } = await createTestScorecard({ algorithm: 'minimum_all' });
    const ctx = makeContext({
      transcriptText: 'Agent: What do you want?\nCustomer: Help.',
    });

    const result = await service.evaluate(
      scorecard._id.toString(),
      ctx,
    );

    // greeting keyword not found → fails
    expect(result.overallScore).toBe(0);
  });

  it('should throw for non-existent scorecard', async () => {
    const fakeId = new Types.ObjectId().toString();
    await expect(
      service.evaluate(fakeId, makeContext()),
    ).rejects.toThrow(/not found/);
  });

  it('should throw for scorecard with no active criteria', async () => {
    const scorecard = await scorecardModel.create({
      name: 'Empty Scorecard',
      status: 'active',
    });

    await expect(
      service.evaluate(scorecard._id.toString(), makeContext()),
    ).rejects.toThrow(/no active criteria/);
  });

  it('should include analysis metadata in result', async () => {
    const { scorecard } = await createTestScorecard();
    const result = await service.evaluate(
      scorecard._id.toString(),
      makeContext(),
      { scenarioExecutionId: 'exec-123' },
    );

    const dbResult = await resultModel.findById(result.resultId);
    expect(dbResult!.analysisMetadata).toBeDefined();
    expect(dbResult!.analysisMetadata.triggeredBy).toBe('scenario');
    expect(dbResult!.analysisMetadata.criteriaCount).toBe(3);
    expect(dbResult!.analysisMetadata.processingTime).toBeGreaterThan(0);
  });

  it('should use simple_average algorithm', async () => {
    const { scorecard } = await createTestScorecard({ algorithm: 'simple_average' });
    const result = await service.evaluate(
      scorecard._id.toString(),
      makeContext(),
    );

    // Both categories should score 10, simple average = 10
    expect(result.overallScore).toBe(10);
  });
});
