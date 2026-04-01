import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, FilterQuery } from 'mongoose';
import { Scorecard, ScorecardDocument } from './schemas/scorecard.schema';
import {
  ScorecardCategory,
  ScorecardCategoryDocument,
} from './schemas/scorecard-category.schema';
import {
  ScorecardCriteria,
  ScorecardCriteriaDocument,
  CriteriaType,
} from './schemas/scorecard-criteria.schema';
import {
  ScorecardResult,
  ScorecardResultDocument,
} from './schemas/scorecard-result.schema';
import { CreateScorecardDto } from './dto/create-scorecard.dto';
import { UpdateScorecardDto } from './dto/update-scorecard.dto';
import { CreateScorecardCategoryDto } from './dto/create-scorecard-category.dto';
import { UpdateScorecardCategoryDto } from './dto/update-scorecard-category.dto';
import { CreateScorecardCriteriaDto } from './dto/create-scorecard-criteria.dto';
import { UpdateScorecardCriteriaDto } from './dto/update-scorecard-criteria.dto';
import { CreateScorecardResultDto } from './dto/create-scorecard-result.dto';

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

@Injectable()
export class ScorecardsService {
  private readonly logger = new Logger(ScorecardsService.name);

  constructor(
    @InjectModel(Scorecard.name)
    private scorecardModel: Model<ScorecardDocument>,
    @InjectModel(ScorecardCategory.name)
    private categoryModel: Model<ScorecardCategoryDocument>,
    @InjectModel(ScorecardCriteria.name)
    private criteriaModel: Model<ScorecardCriteriaDocument>,
    @InjectModel(ScorecardResult.name)
    private resultModel: Model<ScorecardResultDocument>,
  ) {}

  // ============================================================================
  // SCORECARD CRUD
  // ============================================================================

  async createScorecard(
    dto: CreateScorecardDto,
  ): Promise<Scorecard> {
    const scorecard = new this.scorecardModel({
      ...dto,
      categoryIds: [],
    });
    const saved = await scorecard.save();
    this.logger.log(
      `Created scorecard ${saved._id}`,
    );
    return saved;
  }

  async findAllScorecards(
    options: {
      status?: string;
      tags?: string[];
      search?: string;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {},
  ): Promise<PaginatedResponse<Scorecard>> {
    const filter: FilterQuery<ScorecardDocument> = {};

    if (options.status) {
      filter.status = options.status;
    }
    if (options.tags && options.tags.length > 0) {
      filter.tags = { $in: options.tags };
    }
    if (options.search) {
      filter.$or = [
        { name: { $regex: options.search, $options: 'i' } },
        { description: { $regex: options.search, $options: 'i' } },
      ];
    }

    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;
    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
    const sortBy = options.sortBy || 'createdAt';

    const [data, total] = await Promise.all([
      this.scorecardModel
        .find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.scorecardModel.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async findScorecardById(
    scorecardId: string,
  ): Promise<Scorecard | null> {
    return this.scorecardModel.findById(scorecardId);
  }

  async updateScorecard(
    scorecardId: string,
    dto: UpdateScorecardDto,
  ): Promise<Scorecard | null> {
    return this.scorecardModel.findByIdAndUpdate(
      scorecardId,
      { $set: dto },
      { new: true },
    );
  }

  async deleteScorecard(
    scorecardId: string,
  ): Promise<boolean> {
    const result = await this.scorecardModel.deleteOne({
      _id: new Types.ObjectId(scorecardId),
    });

    if (result.deletedCount === 0) {
      return false;
    }

    // Cascade delete related categories and criteria
    await Promise.all([
      this.categoryModel.deleteMany({ scorecardId: new Types.ObjectId(scorecardId) }),
      this.criteriaModel.deleteMany({ scorecardId: new Types.ObjectId(scorecardId) }),
    ]);

    this.logger.log(`Deleted scorecard ${scorecardId} and related data`);
    return true;
  }

  // ============================================================================
  // CATEGORY CRUD
  // ============================================================================

  async createCategory(
    scorecardId: string,
    dto: CreateScorecardCategoryDto,
  ): Promise<ScorecardCategory> {
    // Verify scorecard exists
    const scorecard = await this.findScorecardById(scorecardId);
    if (!scorecard) {
      throw new NotFoundException(`Scorecard ${scorecardId} not found`);
    }

    const category = new this.categoryModel({
      ...dto,
      scorecardId: new Types.ObjectId(scorecardId),
      criteriaIds: [],
      version: 1,
    });
    const saved = await category.save();

    // Add category to scorecard's categoryIds
    await this.scorecardModel.findByIdAndUpdate(scorecardId, {
      $push: { categoryIds: saved._id },
    });

    this.logger.log(
      `Created category ${saved._id} for scorecard ${scorecardId}`,
    );
    return saved;
  }

  async findCategoriesByScorecard(
    scorecardId: string,
  ): Promise<ScorecardCategory[]> {
    // Verify scorecard exists
    const scorecard = await this.findScorecardById(scorecardId);
    if (!scorecard) {
      throw new NotFoundException(`Scorecard ${scorecardId} not found`);
    }

    return this.categoryModel
      .find({ scorecardId: new Types.ObjectId(scorecardId) })
      .sort({ order: 1 })
      .exec();
  }

  async findCategoryById(
    categoryId: string,
  ): Promise<ScorecardCategory | null> {
    return this.categoryModel.findById(categoryId);
  }

  async updateCategory(
    categoryId: string,
    dto: UpdateScorecardCategoryDto,
  ): Promise<ScorecardCategory | null> {
    const category = await this.findCategoryById(categoryId);
    if (!category) {
      return null;
    }

    return this.categoryModel.findByIdAndUpdate(
      categoryId,
      { $set: { ...dto, version: category.version + 1 } },
      { new: true },
    );
  }

  async deleteCategory(
    categoryId: string,
  ): Promise<boolean> {
    const category = await this.findCategoryById(categoryId);
    if (!category) {
      return false;
    }

    // Remove from scorecard's categoryIds
    await this.scorecardModel.findByIdAndUpdate(category.scorecardId, {
      $pull: { categoryIds: new Types.ObjectId(categoryId) },
    });

    // Delete category and its criteria
    await Promise.all([
      this.categoryModel.deleteOne({ _id: new Types.ObjectId(categoryId) }),
      this.criteriaModel.deleteMany({ categoryId: new Types.ObjectId(categoryId) }),
    ]);

    this.logger.log(`Deleted category ${categoryId} and related criteria`);
    return true;
  }

  // ============================================================================
  // CRITERIA CRUD
  // ============================================================================

  async createCriteria(
    scorecardId: string,
    categoryId: string,
    dto: CreateScorecardCriteriaDto,
  ): Promise<ScorecardCriteria> {
    // Verify scorecard exists
    const scorecard = await this.findScorecardById(scorecardId);
    if (!scorecard) {
      throw new NotFoundException(`Scorecard ${scorecardId} not found`);
    }

    // Verify category exists
    const category = await this.findCategoryById(categoryId);
    if (!category) {
      throw new NotFoundException(`Category ${categoryId} not found`);
    }

    // Auto-generate key if not provided
    const key = dto.key || this.generateKey(dto.name);

    const criteria = new this.criteriaModel({
      ...dto,
      key,
      scorecardId: new Types.ObjectId(scorecardId),
      categoryId: new Types.ObjectId(categoryId),
      version: 1,
      isActive: dto.isActive ?? true,
    });
    const saved = await criteria.save();

    // Add criteria to category's criteriaIds
    await this.categoryModel.findByIdAndUpdate(categoryId, {
      $push: { criteriaIds: saved._id },
    });

    this.logger.log(
      `Created criteria ${saved._id} for category ${categoryId}`,
    );
    return saved;
  }

  async findCriteriaByCategory(
    categoryId: string,
  ): Promise<ScorecardCriteria[]> {
    // Verify category exists
    const category = await this.findCategoryById(categoryId);
    if (!category) {
      throw new NotFoundException(`Category ${categoryId} not found`);
    }

    return this.criteriaModel
      .find({ categoryId: new Types.ObjectId(categoryId), isActive: true })
      .sort({ order: 1 })
      .exec();
  }

  async findCriteriaByScorecard(
    scorecardId: string,
  ): Promise<ScorecardCriteria[]> {
    // Verify scorecard exists
    const scorecard = await this.findScorecardById(scorecardId);
    if (!scorecard) {
      throw new NotFoundException(`Scorecard ${scorecardId} not found`);
    }

    return this.criteriaModel
      .find({ scorecardId: new Types.ObjectId(scorecardId), isActive: true })
      .sort({ order: 1 })
      .exec();
  }

  async findCriteriaById(
    criteriaId: string,
  ): Promise<ScorecardCriteria | null> {
    return this.criteriaModel.findById(criteriaId);
  }

  async updateCriteria(
    criteriaId: string,
    dto: UpdateScorecardCriteriaDto,
  ): Promise<ScorecardCriteria | null> {
    const criteria = await this.findCriteriaById(criteriaId);
    if (!criteria) {
      return null;
    }

    return this.criteriaModel.findByIdAndUpdate(
      criteriaId,
      { $set: { ...dto, version: criteria.version + 1 } },
      { new: true },
    );
  }

  async deleteCriteria(
    criteriaId: string,
  ): Promise<boolean> {
    const criteria = await this.findCriteriaById(criteriaId);
    if (!criteria) {
      return false;
    }

    // Remove from category's criteriaIds
    await this.categoryModel.findByIdAndUpdate(criteria.categoryId, {
      $pull: { criteriaIds: new Types.ObjectId(criteriaId) },
    });

    // Delete criteria
    await this.criteriaModel.deleteOne({
      _id: new Types.ObjectId(criteriaId),
    });

    this.logger.log(`Deleted criteria ${criteriaId}`);
    return true;
  }

  // ============================================================================
  // RESULT CRUD
  // ============================================================================

  async createResult(
    dto: CreateScorecardResultDto,
  ): Promise<ScorecardResult> {
    // Verify scorecard exists
    const scorecard = await this.findScorecardById(dto.scorecardId);
    if (!scorecard) {
      throw new NotFoundException(`Scorecard ${dto.scorecardId} not found`);
    }

    const result = new this.resultModel({
      ...dto,
      scorecardId: new Types.ObjectId(dto.scorecardId),
    });
    const saved = await result.save();

    this.logger.log(
      `Created scorecard result ${saved._id} for scorecard ${dto.scorecardId}`,
    );
    return saved;
  }

  async findAllResults(
    options: {
      scorecardId?: string;
      status?: string;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {},
  ): Promise<PaginatedResponse<ScorecardResult>> {
    const filter: FilterQuery<ScorecardResultDocument> = {};

    if (options.scorecardId) {
      filter.scorecardId = new Types.ObjectId(options.scorecardId);
    }
    if (options.status) {
      filter.status = options.status;
    }

    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;
    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
    const sortBy = options.sortBy || 'createdAt';

    const [data, total] = await Promise.all([
      this.resultModel
        .find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.resultModel.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async findResultById(
    resultId: string,
  ): Promise<ScorecardResult | null> {
    return this.resultModel.findById(resultId);
  }

  async findResultsByCall(
    callId: string,
  ): Promise<ScorecardResult[]> {
    return this.resultModel.find({ callId });
  }

  async findResultsByExecution(
    executionId: string,
  ): Promise<ScorecardResult[]> {
    // Accepts both MongoDB _id and scenarioExecutionId (exec_uuid)
    return this.resultModel.find({ scenarioExecutionId: executionId });
  }

  async deleteResult(
    resultId: string,
  ): Promise<boolean> {
    const result = await this.resultModel.deleteOne({
      _id: new Types.ObjectId(resultId),
    });
    return result.deletedCount > 0;
  }

  // ============================================================================
  // DEFAULT SCORECARD
  // ============================================================================

  /**
   * Get the default scorecard.
   * Resolution: Most recently created active scorecard.
   * Returns null if no active scorecards exist.
   */
  async getDefault(): Promise<{ scorecard: Scorecard; source: 'most_recent' } | null> {
    const scorecard = await this.scorecardModel
      .findOne({ status: 'active' })
      .sort({ createdAt: -1 })
      .exec();

    if (!scorecard) {
      return null;
    }

    return {
      scorecard,
      source: 'most_recent',
    };
  }

  /**
   * Create a default scorecard if none exists.
   * Used to ensure at least one scorecard exists for evaluation.
   */
  async createDefaultScorecardIfNeeded(): Promise<Types.ObjectId | null> {
    try {
      // Check if an active scorecard already exists
      const existing = await this.scorecardModel.findOne({ status: 'active' }).exec();

      if (existing) {
        this.logger.log(
          `Default scorecard already exists: ${existing._id}`,
        );
        return existing._id as Types.ObjectId;
      }

      // Get default scorecard data structure
      const defaultData = this.getDefaultScorecardData();

      // Create the scorecard
      const createdScorecard = await this.createScorecard({
        name: defaultData.name,
        description: defaultData.description,
        status: defaultData.status,
      });

      const scorecardId = (createdScorecard as any)._id;
      if (!scorecardId) {
        throw new Error('Failed to extract scorecard ID after creation');
      }

      const scorecardObjectId =
        typeof scorecardId === 'string'
          ? new Types.ObjectId(scorecardId)
          : scorecardId;

      // Create categories and criteria
      for (const categoryData of defaultData.categories) {
        const category = await this.createCategory(
          scorecardObjectId.toString(),
          {
            name: categoryData.name,
            description: categoryData.description,
            weight: categoryData.weight,
          },
        );

        const categoryIdStr =
          (category as any)._id?.toString() || '';

        for (const criteriaData of categoryData.criteria) {
          await this.createCriteria(
            scorecardObjectId.toString(),
            categoryIdStr,
            {
              categoryId: categoryIdStr,
              key: criteriaData.key,
              name: criteriaData.name,
              type: criteriaData.type,
              settings: criteriaData.settings,
              threshold: criteriaData.threshold,
            },
          );
        }
      }

      this.logger.log(
        `Created default scorecard ${scorecardObjectId}`,
      );

      return scorecardObjectId;
    } catch (error: any) {
      this.logger.error(
        `Failed to create default scorecard: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Get default scorecard data structure.
   * Creates a comprehensive scorecard with 5 categories covering all aspects of call quality.
   */
  private getDefaultScorecardData(): {
    name: string;
    description: string;
    status: string;
    categories: Array<{
      name: string;
      description: string;
      weight: number;
      criteria: Array<{
        key: string;
        name: string;
        type: string;
        settings: any;
        threshold?: any;
      }>;
    }>;
  } {
    return {
      name: 'Call Quality Scorecard',
      description:
        'Comprehensive call quality evaluation with communication, problem-solving, and timing metrics',
      status: 'active',
      categories: [
        {
          name: 'Opening & Greeting',
          description: 'Evaluates how the agent opens the call',
          weight: 15,
          criteria: [
            {
              key: 'proper_greeting',
              name: 'Proper Greeting',
              type: CriteriaType.PROMPT,
              settings: {
                description:
                  'Did the agent introduce themselves and greet the customer professionally?',
                evaluationType: 'boolean',
              },
              threshold: { expectedValue: true },
            },
            {
              key: 'greeting_keywords',
              name: 'Greeting Keywords',
              type: CriteriaType.KEYWORD,
              settings: {
                matchType: 'must_contain',
                keyword: [
                  'hello',
                  'hi',
                  'good morning',
                  'good afternoon',
                  'good evening',
                  'thank you for calling',
                  'how can I help',
                ],
              },
            },
          ],
        },
        {
          name: 'Problem Resolution',
          description:
            'Evaluates how well the agent addresses customer issues',
          weight: 35,
          criteria: [
            {
              key: 'issue_identified',
              name: 'Issue Identified',
              type: CriteriaType.PROMPT,
              settings: {
                description:
                  "Did the agent correctly identify and understand the customer's issue or request?",
                evaluationType: 'boolean',
              },
              threshold: { expectedValue: true },
            },
            {
              key: 'resolution_quality',
              name: 'Resolution Quality',
              type: CriteriaType.PROMPT,
              settings: {
                description:
                  "Rate how effectively the agent resolved or addressed the customer's issue (0-10, where 10 is fully resolved)",
                evaluationType: 'score',
              },
              threshold: { min: 7, max: 10 },
            },
            {
              key: 'clear_explanation',
              name: 'Clear Explanation',
              type: CriteriaType.PROMPT,
              settings: {
                description:
                  'Did the agent provide clear and understandable explanations?',
                evaluationType: 'boolean',
              },
              threshold: { expectedValue: true },
            },
          ],
        },
        {
          name: 'Communication Quality',
          description:
            'Evaluates professionalism and communication style',
          weight: 25,
          criteria: [
            {
              key: 'politeness_score',
              name: 'Politeness & Professionalism',
              type: CriteriaType.PROMPT,
              settings: {
                description:
                  "Rate the agent's overall politeness and professional demeanor (0-10)",
                evaluationType: 'score',
              },
              threshold: { min: 7, max: 10 },
            },
            {
              key: 'empathy_shown',
              name: 'Empathy Demonstrated',
              type: CriteriaType.PROMPT,
              settings: {
                description:
                  "Did the agent show empathy and understanding toward the customer's situation?",
                evaluationType: 'boolean',
              },
              threshold: { expectedValue: true },
            },
            {
              key: 'no_inappropriate_language',
              name: 'Professional Language',
              type: CriteriaType.KEYWORD,
              settings: {
                matchType: 'must_not_contain',
                keyword: [
                  'damn',
                  'hell',
                  'crap',
                  'stupid',
                  'idiot',
                  'shut up',
                ],
              },
            },
          ],
        },
        {
          name: 'Closing & Follow-up',
          description: 'Evaluates how the agent closes the call',
          weight: 10,
          criteria: [
            {
              key: 'proper_closing',
              name: 'Proper Closing',
              type: CriteriaType.PROMPT,
              settings: {
                description:
                  'Did the agent properly close the call by thanking the customer and offering further assistance?',
                evaluationType: 'boolean',
              },
              threshold: { expectedValue: true },
            },
            {
              key: 'closing_keywords',
              name: 'Closing Keywords',
              type: CriteriaType.KEYWORD,
              settings: {
                matchType: 'must_contain',
                keyword: [
                  'thank you',
                  'thanks',
                  'have a great day',
                  'is there anything else',
                  'goodbye',
                  'bye',
                ],
              },
            },
          ],
        },
        {
          name: 'Timing Metrics',
          description:
            'Evaluates response time and call efficiency',
          weight: 15,
          criteria: [
            {
              key: 'agent_response_time',
              name: 'Agent Response Time',
              type: CriteriaType.RESPONSE_TIME,
              settings: { participant: 'agent' },
              threshold: { max: 5 },
            },
          ],
        },
      ],
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  generateKey(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .replace(/^[0-9]/, '_$&');
  }
}
