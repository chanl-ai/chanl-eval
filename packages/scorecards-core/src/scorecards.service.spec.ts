import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types, Connection } from 'mongoose';
import { NotFoundException } from '@nestjs/common';
import { ScorecardsService } from './scorecards.service';
import { Scorecard, ScorecardDocument, ScorecardSchema } from './schemas/scorecard.schema';
import {
  ScorecardCategory,
  ScorecardCategoryDocument,
  ScorecardCategorySchema,
} from './schemas/scorecard-category.schema';
import {
  ScorecardCriteria,
  ScorecardCriteriaDocument,
  ScorecardCriteriaSchema,
  CriteriaType,
} from './schemas/scorecard-criteria.schema';
import {
  ScorecardResult,
  ScorecardResultDocument,
  ScorecardResultSchema,
} from './schemas/scorecard-result.schema';

describe('ScorecardsService', () => {
  let service: ScorecardsService;
  let mongod: MongoMemoryServer;
  let scorecardModel: Model<ScorecardDocument>;
  let categoryModel: Model<ScorecardCategoryDocument>;
  let criteriaModel: Model<ScorecardCriteriaDocument>;
  let resultModel: Model<ScorecardResultDocument>;
  let module: TestingModule;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Scorecard.name, schema: ScorecardSchema },
          { name: ScorecardCategory.name, schema: ScorecardCategorySchema },
          { name: ScorecardCriteria.name, schema: ScorecardCriteriaSchema },
          { name: ScorecardResult.name, schema: ScorecardResultSchema },
        ]),
      ],
      providers: [ScorecardsService],
    }).compile();

    service = module.get<ScorecardsService>(ScorecardsService);
    scorecardModel = module.get<Model<ScorecardDocument>>(getModelToken(Scorecard.name));
    categoryModel = module.get<Model<ScorecardCategoryDocument>>(getModelToken(ScorecardCategory.name));
    criteriaModel = module.get<Model<ScorecardCriteriaDocument>>(getModelToken(ScorecardCriteria.name));
    resultModel = module.get<Model<ScorecardResultDocument>>(getModelToken(ScorecardResult.name));
  });

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  afterEach(async () => {
    // Clean up all collections between tests
    await scorecardModel.deleteMany({});
    await categoryModel.deleteMany({});
    await criteriaModel.deleteMany({});
    await resultModel.deleteMany({});
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================================================
  // SCORECARD CRUD
  // ============================================================================

  describe('Scorecard CRUD', () => {
    it('should create a scorecard', async () => {
      const scorecard = await service.createScorecard({
        name: 'Test Scorecard',
        description: 'A test scorecard',
        status: 'draft',
      });

      expect(scorecard).toBeDefined();
      expect((scorecard as any)._id).toBeDefined();
      expect(scorecard.name).toBe('Test Scorecard');
      expect(scorecard.description).toBe('A test scorecard');
      expect(scorecard.status).toBe('draft');
      expect(scorecard.categoryIds).toEqual([]);
    });

    it('should create a scorecard with default values', async () => {
      const scorecard = await service.createScorecard({
        name: 'Defaults Scorecard',
      });

      expect(scorecard.status).toBe('draft');
      expect(scorecard.passingThreshold).toBe(70);
      expect(scorecard.scoringAlgorithm).toBe('weighted_average');
      expect(scorecard.tags).toEqual([]);
    });

    it('should find a scorecard by ID', async () => {
      const created = await service.createScorecard({
        name: 'Find Me',
      });
      const scorecardId = (created as any)._id.toString();

      const found = await service.findScorecardById(scorecardId);

      expect(found).toBeDefined();
      expect(found!.name).toBe('Find Me');
    });

    it('should return null for non-existent scorecard', async () => {
      const fakeId = new Types.ObjectId().toString();
      const found = await service.findScorecardById(fakeId);
      expect(found).toBeNull();
    });

    it('should update a scorecard', async () => {
      const created = await service.createScorecard({
        name: 'Before Update',
        status: 'draft',
      });
      const scorecardId = (created as any)._id.toString();

      const updated = await service.updateScorecard(scorecardId, {
        name: 'After Update',
        status: 'active',
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('After Update');
      expect(updated!.status).toBe('active');
    });

    it('should return null when updating non-existent scorecard', async () => {
      const fakeId = new Types.ObjectId().toString();
      const result = await service.updateScorecard(fakeId, { name: 'Nope' });
      expect(result).toBeNull();
    });

    it('should find all scorecards with pagination', async () => {
      await service.createScorecard({ name: 'Scorecard 1' });
      await service.createScorecard({ name: 'Scorecard 2' });
      await service.createScorecard({ name: 'Scorecard 3' });

      const result = await service.findAllScorecards({
        page: 1,
        limit: 2,
      });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(3);
      expect(result.pagination.totalPages).toBe(2);
      expect(result.pagination.hasNextPage).toBe(true);
      expect(result.pagination.hasPrevPage).toBe(false);
    });

    it('should filter scorecards by status', async () => {
      await service.createScorecard({ name: 'Active 1', status: 'active' });
      await service.createScorecard({ name: 'Draft 1', status: 'draft' });
      await service.createScorecard({ name: 'Active 2', status: 'active' });

      const result = await service.findAllScorecards({ status: 'active' });

      expect(result.data).toHaveLength(2);
      expect(result.data.every((s) => s.status === 'active')).toBe(true);
    });

    it('should delete a scorecard', async () => {
      const created = await service.createScorecard({
        name: 'Delete Me',
      });
      const scorecardId = (created as any)._id.toString();

      const deleted = await service.deleteScorecard(scorecardId);
      expect(deleted).toBe(true);

      const found = await service.findScorecardById(scorecardId);
      expect(found).toBeNull();
    });

    it('should return false when deleting non-existent scorecard', async () => {
      const fakeId = new Types.ObjectId().toString();
      const result = await service.deleteScorecard(fakeId);
      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // CATEGORY CRUD
  // ============================================================================

  describe('Category CRUD', () => {
    let scorecardId: string;

    beforeEach(async () => {
      const scorecard = await service.createScorecard({
        name: 'Category Test Scorecard',
        status: 'active',
      });
      scorecardId = (scorecard as any)._id.toString();
    });

    it('should create a category and add it to scorecard.categoryIds', async () => {
      const category = await service.createCategory(scorecardId, {
        name: 'Test Category',
        description: 'A test category',
        weight: 50,
      });

      expect(category).toBeDefined();
      expect((category as any)._id).toBeDefined();
      expect(category.name).toBe('Test Category');
      expect(category.weight).toBe(50);
      expect(category.version).toBe(1);

      // Verify it was added to scorecard's categoryIds
      const scorecard = await service.findScorecardById(scorecardId);
      expect(scorecard!.categoryIds).toHaveLength(1);
      expect(scorecard!.categoryIds[0].toString()).toBe(
        (category as any)._id.toString(),
      );
    });

    it('should throw NotFoundException when creating category for non-existent scorecard', async () => {
      const fakeId = new Types.ObjectId().toString();
      await expect(
        service.createCategory(fakeId, { name: 'Orphan' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should find categories by scorecard', async () => {
      await service.createCategory(scorecardId, { name: 'Cat A', order: 1 });
      await service.createCategory(scorecardId, { name: 'Cat B', order: 0 });

      const categories = await service.findCategoriesByScorecard(scorecardId);

      expect(categories).toHaveLength(2);
      // Should be sorted by order
      expect(categories[0].name).toBe('Cat B');
      expect(categories[1].name).toBe('Cat A');
    });

    it('should throw NotFoundException when finding categories for non-existent scorecard', async () => {
      const fakeId = new Types.ObjectId().toString();
      await expect(
        service.findCategoriesByScorecard(fakeId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should find category by ID', async () => {
      const created = await service.createCategory(scorecardId, {
        name: 'Find Category',
      });
      const categoryId = (created as any)._id.toString();

      const found = await service.findCategoryById(categoryId);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Find Category');
    });

    it('should return null for non-existent category', async () => {
      const fakeId = new Types.ObjectId().toString();
      const found = await service.findCategoryById(fakeId);
      expect(found).toBeNull();
    });

    it('should update a category and increment version', async () => {
      const created = await service.createCategory(scorecardId, {
        name: 'Before',
        weight: 25,
      });
      const categoryId = (created as any)._id.toString();

      const updated = await service.updateCategory(categoryId, {
        name: 'After',
        weight: 50,
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('After');
      expect(updated!.weight).toBe(50);
      expect(updated!.version).toBe(2);
    });

    it('should delete a category and remove from scorecard.categoryIds', async () => {
      const category = await service.createCategory(scorecardId, {
        name: 'Delete Me',
      });
      const categoryId = (category as any)._id.toString();

      // Verify it exists in scorecard
      let scorecard = await service.findScorecardById(scorecardId);
      expect(scorecard!.categoryIds).toHaveLength(1);

      const deleted = await service.deleteCategory(categoryId);
      expect(deleted).toBe(true);

      // Verify removed from scorecard
      scorecard = await service.findScorecardById(scorecardId);
      expect(scorecard!.categoryIds).toHaveLength(0);

      // Verify category is gone
      const found = await service.findCategoryById(categoryId);
      expect(found).toBeNull();
    });
  });

  // ============================================================================
  // CRITERIA CRUD
  // ============================================================================

  describe('Criteria CRUD', () => {
    let scorecardId: string;
    let categoryId: string;

    beforeEach(async () => {
      const scorecard = await service.createScorecard({
        name: 'Criteria Test Scorecard',
        status: 'active',
      });
      scorecardId = (scorecard as any)._id.toString();

      const category = await service.createCategory(scorecardId, {
        name: 'Test Category',
        weight: 100,
      });
      categoryId = (category as any)._id.toString();
    });

    it('should create criteria with auto-generated key', async () => {
      const criteria = await service.createCriteria(
        scorecardId,
        categoryId,
        {
          categoryId,
          name: 'Proper Greeting',
          type: 'prompt',
          settings: {
            description: 'Did the agent greet properly?',
            evaluationType: 'boolean',
          },
          threshold: { expectedValue: true },
        },
      );

      expect(criteria).toBeDefined();
      expect((criteria as any)._id).toBeDefined();
      expect(criteria.name).toBe('Proper Greeting');
      expect(criteria.key).toBe('proper_greeting');
      expect(criteria.type).toBe('prompt');
      expect(criteria.version).toBe(1);
      expect(criteria.isActive).toBe(true);
    });

    it('should use provided key when specified', async () => {
      const criteria = await service.createCriteria(
        scorecardId,
        categoryId,
        {
          categoryId,
          key: 'custom_key',
          name: 'Custom Key Test',
          type: 'prompt',
          settings: {
            description: 'Test',
            evaluationType: 'boolean',
          },
        },
      );

      expect(criteria.key).toBe('custom_key');
    });

    it('should add criteria to category.criteriaIds', async () => {
      const criteria = await service.createCriteria(
        scorecardId,
        categoryId,
        {
          categoryId,
          name: 'Test Criteria',
          type: 'keyword',
          settings: {
            matchType: 'must_contain',
            keyword: ['hello'],
          },
        },
      );

      const category = await service.findCategoryById(categoryId);
      expect(category!.criteriaIds).toHaveLength(1);
      expect(category!.criteriaIds[0].toString()).toBe(
        (criteria as any)._id.toString(),
      );
    });

    it('should throw NotFoundException for non-existent scorecard', async () => {
      const fakeId = new Types.ObjectId().toString();
      await expect(
        service.createCriteria(fakeId, categoryId, {
          categoryId,
          name: 'Orphan',
          type: 'prompt',
          settings: { description: 'Test', evaluationType: 'boolean' },
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent category', async () => {
      const fakeId = new Types.ObjectId().toString();
      await expect(
        service.createCriteria(scorecardId, fakeId, {
          categoryId: fakeId,
          name: 'Orphan',
          type: 'prompt',
          settings: { description: 'Test', evaluationType: 'boolean' },
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should find criteria by category', async () => {
      await service.createCriteria(scorecardId, categoryId, {
        categoryId,
        name: 'Criteria A',
        type: 'prompt',
        settings: { description: 'A', evaluationType: 'boolean' },
      });
      await service.createCriteria(scorecardId, categoryId, {
        categoryId,
        name: 'Criteria B',
        type: 'keyword',
        settings: { matchType: 'must_contain', keyword: ['test'] },
      });

      const criteria = await service.findCriteriaByCategory(categoryId);
      expect(criteria).toHaveLength(2);
    });

    it('should find criteria by scorecard', async () => {
      await service.createCriteria(scorecardId, categoryId, {
        categoryId,
        name: 'Criteria X',
        type: 'prompt',
        settings: { description: 'X', evaluationType: 'boolean' },
      });

      const criteria = await service.findCriteriaByScorecard(scorecardId);
      expect(criteria).toHaveLength(1);
      expect(criteria[0].name).toBe('Criteria X');
    });

    it('should find criteria by ID', async () => {
      const created = await service.createCriteria(
        scorecardId,
        categoryId,
        {
          categoryId,
          name: 'Find Me',
          type: 'prompt',
          settings: { description: 'Find', evaluationType: 'boolean' },
        },
      );
      const criteriaId = (created as any)._id.toString();

      const found = await service.findCriteriaById(criteriaId);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Find Me');
    });

    it('should update criteria and increment version', async () => {
      const created = await service.createCriteria(
        scorecardId,
        categoryId,
        {
          categoryId,
          name: 'Before Update',
          type: 'prompt',
          settings: { description: 'Before', evaluationType: 'boolean' },
        },
      );
      const criteriaId = (created as any)._id.toString();

      const updated = await service.updateCriteria(criteriaId, {
        name: 'After Update',
      } as any);

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('After Update');
      expect(updated!.version).toBe(2);
    });

    it('should delete criteria and remove from category.criteriaIds', async () => {
      const created = await service.createCriteria(
        scorecardId,
        categoryId,
        {
          categoryId,
          name: 'Delete Me',
          type: 'prompt',
          settings: { description: 'Delete', evaluationType: 'boolean' },
        },
      );
      const criteriaId = (created as any)._id.toString();

      // Verify exists in category
      let category = await service.findCategoryById(categoryId);
      expect(category!.criteriaIds).toHaveLength(1);

      const deleted = await service.deleteCriteria(criteriaId);
      expect(deleted).toBe(true);

      // Verify removed from category
      category = await service.findCategoryById(categoryId);
      expect(category!.criteriaIds).toHaveLength(0);
    });
  });

  // ============================================================================
  // RESULT CRUD
  // ============================================================================

  describe('Result CRUD', () => {
    let scorecardId: string;

    beforeEach(async () => {
      const scorecard = await service.createScorecard({
        name: 'Result Test Scorecard',
        status: 'active',
      });
      scorecardId = (scorecard as any)._id.toString();
    });

    it('should create a result', async () => {
      const result = await service.createResult({
        scorecardId,
        callId: 'call-123',
      });

      expect(result).toBeDefined();
      expect((result as any)._id).toBeDefined();
      expect(result.scorecardId.toString()).toBe(scorecardId);
      expect(result.status).toBe('pending');
    });

    it('should throw NotFoundException for non-existent scorecard', async () => {
      const fakeId = new Types.ObjectId().toString();
      await expect(
        service.createResult({ scorecardId: fakeId }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should find result by ID', async () => {
      const created = await service.createResult({
        scorecardId,
        callId: 'call-456',
      });
      const resultId = (created as any)._id.toString();

      const found = await service.findResultById(resultId);
      expect(found).toBeDefined();
      expect(found!.callId).toBe('call-456');
    });

    it('should find results by call', async () => {
      await service.createResult({
        scorecardId,
        callId: 'call-789',
      });
      await service.createResult({
        scorecardId,
        callId: 'call-789',
      });

      const results = await service.findResultsByCall('call-789');
      expect(results).toHaveLength(2);
    });

    it('should find all results with pagination', async () => {
      await service.createResult({ scorecardId, callId: 'c1' });
      await service.createResult({ scorecardId, callId: 'c2' });
      await service.createResult({ scorecardId, callId: 'c3' });

      const result = await service.findAllResults({ page: 1, limit: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(3);
    });

    it('should delete a result', async () => {
      const created = await service.createResult({
        scorecardId,
        callId: 'delete-me',
      });
      const resultId = (created as any)._id.toString();

      const deleted = await service.deleteResult(resultId);
      expect(deleted).toBe(true);

      const found = await service.findResultById(resultId);
      expect(found).toBeNull();
    });

    it('should return false when deleting non-existent result', async () => {
      const fakeId = new Types.ObjectId().toString();
      const result = await service.deleteResult(fakeId);
      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // DEFAULT SCORECARD
  // ============================================================================

  describe('Default Scorecard', () => {
    it('should create default scorecard with 5 categories and 13 criteria', async () => {
      const scorecardId = await service.createDefaultScorecardIfNeeded();

      expect(scorecardId).toBeDefined();
      expect(scorecardId).toBeInstanceOf(Types.ObjectId);

      // Verify scorecard
      const scorecard = await service.findScorecardById(
        scorecardId!.toString(),
      );
      expect(scorecard).toBeDefined();
      expect(scorecard!.name).toBe('Call Quality Scorecard');
      expect(scorecard!.status).toBe('active');

      // Verify 5 categories
      const categories = await service.findCategoriesByScorecard(
        scorecardId!.toString(),
      );
      expect(categories).toHaveLength(5);

      // Verify category names and weights
      const categoryNames = categories.map((c) => c.name);
      expect(categoryNames).toContain('Opening & Greeting');
      expect(categoryNames).toContain('Problem Resolution');
      expect(categoryNames).toContain('Communication Quality');
      expect(categoryNames).toContain('Closing & Follow-up');
      expect(categoryNames).toContain('Timing Metrics');

      // Verify weights
      const openingCat = categories.find(
        (c) => c.name === 'Opening & Greeting',
      );
      expect(openingCat!.weight).toBe(15);
      const problemCat = categories.find(
        (c) => c.name === 'Problem Resolution',
      );
      expect(problemCat!.weight).toBe(35);

      // Verify 13 total criteria
      const allCriteria = await service.findCriteriaByScorecard(
        scorecardId!.toString(),
      );
      expect(allCriteria).toHaveLength(13);

      // Verify specific criteria
      const criteriaKeys = allCriteria.map((c) => c.key);
      expect(criteriaKeys).toContain('proper_greeting');
      expect(criteriaKeys).toContain('greeting_keywords');
      expect(criteriaKeys).toContain('issue_identified');
      expect(criteriaKeys).toContain('resolution_quality');
      expect(criteriaKeys).toContain('clear_explanation');
      expect(criteriaKeys).toContain('politeness_score');
      expect(criteriaKeys).toContain('empathy_shown');
      expect(criteriaKeys).toContain('no_inappropriate_language');
      expect(criteriaKeys).toContain('proper_closing');
      expect(criteriaKeys).toContain('closing_keywords');
      expect(criteriaKeys).toContain('agent_response_time');
      expect(criteriaKeys).toContain('agent_talk_ratio');
      expect(criteriaKeys).toContain('max_silence');

      // Verify criteria types
      const greetingCriteria = allCriteria.find(
        (c) => c.key === 'proper_greeting',
      );
      expect(greetingCriteria!.type).toBe(CriteriaType.PROMPT);

      const keywordCriteria = allCriteria.find(
        (c) => c.key === 'greeting_keywords',
      );
      expect(keywordCriteria!.type).toBe(CriteriaType.KEYWORD);

      const responseTimeCriteria = allCriteria.find(
        (c) => c.key === 'agent_response_time',
      );
      expect(responseTimeCriteria!.type).toBe(CriteriaType.RESPONSE_TIME);

      const talkTimeCriteria = allCriteria.find(
        (c) => c.key === 'agent_talk_ratio',
      );
      expect(talkTimeCriteria!.type).toBe(CriteriaType.TALK_TIME);

      const silenceCriteria = allCriteria.find(
        (c) => c.key === 'max_silence',
      );
      expect(silenceCriteria!.type).toBe(CriteriaType.SILENCE_DURATION);
    });

    it('should be idempotent - calling twice returns existing scorecard', async () => {
      const firstId = await service.createDefaultScorecardIfNeeded();
      const secondId = await service.createDefaultScorecardIfNeeded();

      expect(firstId).toBeDefined();
      expect(secondId).toBeDefined();
      expect(firstId!.toString()).toBe(secondId!.toString());

      // Verify only one scorecard exists
      const all = await service.findAllScorecards({ status: 'active' });
      expect(all.data).toHaveLength(1);
    });

    it('should create default scorecard without workspaceId', async () => {
      const scorecardId =
        await service.createDefaultScorecardIfNeeded();

      expect(scorecardId).toBeDefined();

      const scorecard = await service.findScorecardById(
        scorecardId!.toString(),
      );
      expect(scorecard).toBeDefined();
    });
  });

  // ============================================================================
  // SCORING ALGORITHMS
  // ============================================================================

  describe('Scoring Algorithms', () => {
    it('should support weighted_average scoring algorithm', async () => {
      const scorecard = await service.createScorecard({
        name: 'Weighted',
        scoringAlgorithm: 'weighted_average',
      });
      expect(scorecard.scoringAlgorithm).toBe('weighted_average');
    });

    it('should support simple_average scoring algorithm', async () => {
      const scorecard = await service.createScorecard({
        name: 'Simple',
        scoringAlgorithm: 'simple_average',
      });
      expect(scorecard.scoringAlgorithm).toBe('simple_average');
    });

    it('should support minimum_all scoring algorithm', async () => {
      const scorecard = await service.createScorecard({
        name: 'Minimum',
        scoringAlgorithm: 'minimum_all',
      });
      expect(scorecard.scoringAlgorithm).toBe('minimum_all');
    });

    it('should support pass_fail scoring algorithm', async () => {
      const scorecard = await service.createScorecard({
        name: 'Pass/Fail',
        scoringAlgorithm: 'pass_fail',
      });
      expect(scorecard.scoringAlgorithm).toBe('pass_fail');
    });
  });

  // ============================================================================
  // CASCADING DELETE
  // ============================================================================

  describe('Cascading Delete', () => {
    it('should delete categories and criteria when deleting a scorecard', async () => {
      // Create scorecard with categories and criteria
      const scorecard = await service.createScorecard({
        name: 'Cascade Test',
        status: 'active',
      });
      const sid = (scorecard as any)._id.toString();

      const cat1 = await service.createCategory(sid, {
        name: 'Cat 1',
        weight: 50,
      });
      const cat1Id = (cat1 as any)._id.toString();

      const cat2 = await service.createCategory(sid, {
        name: 'Cat 2',
        weight: 50,
      });
      const cat2Id = (cat2 as any)._id.toString();

      await service.createCriteria(sid, cat1Id, {
        categoryId: cat1Id,
        name: 'Criteria 1',
        type: 'prompt',
        settings: { description: 'Test', evaluationType: 'boolean' },
      });
      await service.createCriteria(sid, cat1Id, {
        categoryId: cat1Id,
        name: 'Criteria 2',
        type: 'keyword',
        settings: { matchType: 'must_contain', keyword: ['test'] },
      });
      await service.createCriteria(sid, cat2Id, {
        categoryId: cat2Id,
        name: 'Criteria 3',
        type: 'prompt',
        settings: { description: 'Test 3', evaluationType: 'score' },
      });

      // Verify everything exists
      const categoriesBefore = await categoryModel.countDocuments({});
      expect(categoriesBefore).toBe(2);
      const criteriaBefore = await criteriaModel.countDocuments({});
      expect(criteriaBefore).toBe(3);

      // Delete scorecard
      const deleted = await service.deleteScorecard(sid);
      expect(deleted).toBe(true);

      // Verify cascade
      const categoriesAfter = await categoryModel.countDocuments({});
      expect(categoriesAfter).toBe(0);
      const criteriaAfter = await criteriaModel.countDocuments({});
      expect(criteriaAfter).toBe(0);
    });

    it('should delete criteria when deleting a category', async () => {
      const scorecard = await service.createScorecard({
        name: 'Cat Cascade',
        status: 'active',
      });
      const sid = (scorecard as any)._id.toString();

      const cat = await service.createCategory(sid, {
        name: 'Delete Cat',
      });
      const catId = (cat as any)._id.toString();

      await service.createCriteria(sid, catId, {
        categoryId: catId,
        name: 'Orphan Soon',
        type: 'prompt',
        settings: { description: 'Will be deleted', evaluationType: 'boolean' },
      });

      // Verify criteria exists
      const criteriaBefore = await criteriaModel.countDocuments({
        categoryId: new Types.ObjectId(catId),
      });
      expect(criteriaBefore).toBe(1);

      // Delete category
      await service.deleteCategory(catId);

      // Verify criteria cascade deleted
      const criteriaAfter = await criteriaModel.countDocuments({
        categoryId: new Types.ObjectId(catId),
      });
      expect(criteriaAfter).toBe(0);
    });
  });

  // ============================================================================
  // HELPER: generateKey
  // ============================================================================

  describe('generateKey', () => {
    it('should convert name to snake_case', () => {
      expect(service.generateKey('Proper Greeting')).toBe('proper_greeting');
    });

    it('should strip non-alphanumeric characters', () => {
      expect(service.generateKey('Hello! World?')).toBe('hello_world');
    });

    it('should handle multiple spaces', () => {
      expect(service.generateKey('Agent   Response   Time')).toBe(
        'agent_response_time',
      );
    });

    it('should prefix with underscore if starts with number', () => {
      expect(service.generateKey('3rd Party Check')).toBe('_3rd_party_check');
    });

    it('should handle empty-like name', () => {
      // Spaces become underscores, leading digit prefix applied
      expect(service.generateKey('   ')).toBe('_');
    });
  });

  // ============================================================================
  // GET DEFAULT
  // ============================================================================

  describe('getDefault', () => {
    it('should return null when no active scorecards exist', async () => {
      const result = await service.getDefault();
      expect(result).toBeNull();
    });

    it('should return the most recently created active scorecard', async () => {
      await service.createScorecard({
        name: 'Older Active',
        status: 'active',
      });
      // Small delay to ensure different createdAt timestamps
      await new Promise((r) => setTimeout(r, 50));
      await service.createScorecard({
        name: 'Newer Active',
        status: 'active',
      });

      const result = await service.getDefault();
      expect(result).toBeDefined();
      expect(result!.scorecard.name).toBe('Newer Active');
      expect(result!.source).toBe('most_recent');
    });

    it('should ignore draft and inactive scorecards', async () => {
      await service.createScorecard({
        name: 'Draft',
        status: 'draft',
      });
      await service.createScorecard({
        name: 'Inactive',
        status: 'inactive',
      });

      const result = await service.getDefault();
      expect(result).toBeNull();
    });
  });
});
