import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as yaml from 'js-yaml';
import {
  Scenario,
  ScenarioDocument,
  DifficultyLevel,
} from '../schemas/scenario.schema';
import {
  ScenarioExecution,
  ScenarioExecutionDocument,
} from '../schemas/scenario-execution.schema';
import { CreateScenarioDto } from '../dto/create-scenario.dto';
import { UpdateScenarioDto } from '../dto/update-scenario.dto';

/**
 * Safely convert a Mongoose ScenarioDocument to a plain Scenario object.
 * The virtualIdPlugin ensures toJSON() returns `id` (string) instead of `_id`.
 */
function toScenario(doc: ScenarioDocument): Scenario {
  return doc.toJSON() as unknown as Scenario;
}

/** Plain-object shape returned by toJSON() — includes `id` but no Mongoose internals. */
interface ScenarioJSON extends Omit<Scenario, 'personaIds' | 'scorecardId' | 'parentScenarioId'> {
  id: string;
  _id?: string;
  personaIds: (Types.ObjectId | string)[];
  scorecardId?: Types.ObjectId | string;
  parentScenarioId?: Types.ObjectId | string;
}

@Injectable()
export class ScenarioService {
  private readonly logger = new Logger(ScenarioService.name);

  constructor(
    @InjectModel(Scenario.name) private scenarioModel: Model<ScenarioDocument>,
    @InjectModel(ScenarioExecution.name)
    private scenarioExecutionModel: Model<ScenarioExecutionDocument>,
  ) {}

  /**
   * Create a new scenario.
   */
  async create(
    createScenarioDto: CreateScenarioDto,
    createdBy?: string,
  ): Promise<Scenario> {
    try {
      const isDraft = createScenarioDto.status === 'draft';

      // Validate for non-draft scenarios
      if (!isDraft) {
        if (
          !createScenarioDto.personaIds ||
          createScenarioDto.personaIds.length === 0
        ) {
          throw new BadRequestException(
            'personaIds array is required and must contain at least one persona ID',
          );
        }
      }

      // Convert IDs to ObjectIds
      const personaIds = createScenarioDto.personaIds
        ? createScenarioDto.personaIds.map((id) => new Types.ObjectId(id))
        : [];

      const scenarioData: Record<string, unknown> = {
        ...createScenarioDto,
        status: createScenarioDto.status || 'active',
        personaIds,
        createdBy: createdBy || 'local',
      };

      if (
        createScenarioDto.scorecardId &&
        createScenarioDto.scorecardId !== 'placeholder'
      ) {
        scenarioData.scorecardId = new Types.ObjectId(
          createScenarioDto.scorecardId,
        );
      } else {
        delete scenarioData.scorecardId;
      }

      const scenario = new this.scenarioModel(scenarioData);
      const savedScenario = await scenario.save();
      return toScenario(savedScenario);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to create scenario: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Find all scenarios with optional filters and pagination.
   */
  async findAll(
    filters?: {
      status?: string;
      category?: string;
      difficulty?: string;
      tags?: string[];
      createdBy?: string;
    },
    pagination?: {
      limit?: number;
      offset?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ): Promise<{ scenarios: Scenario[]; total: number }> {
    try {
      const query: Record<string, unknown> = {};

      if (filters) {
        if (filters.status) query.status = filters.status;
        if (filters.category) query.category = filters.category;
        if (filters.difficulty) query.difficulty = filters.difficulty;
        if (filters.tags && filters.tags.length > 0)
          query.tags = { $in: filters.tags };
        if (filters.createdBy) query.createdBy = filters.createdBy;
      }

      let queryBuilder = this.scenarioModel.find(query);

      const sortBy = pagination?.sortBy || 'updatedAt';
      const sortOrder = pagination?.sortOrder === 'asc' ? 1 : -1;
      queryBuilder = queryBuilder.sort({ [sortBy]: sortOrder });

      if (pagination?.offset)
        queryBuilder = queryBuilder.skip(pagination.offset);
      if (pagination?.limit)
        queryBuilder = queryBuilder.limit(pagination.limit);

      const scenarios = await queryBuilder.exec();
      const total = await this.scenarioModel.countDocuments(query);

      const serializedScenarios = scenarios.map(
        (doc) => toScenario(doc),
      );
      return { scenarios: serializedScenarios, total };
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to find scenarios: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Find scenario by ID
   */
  async findOne(id: string): Promise<Scenario> {
    try {
      const scenario = await this.scenarioModel.findById(id);

      if (!scenario) {
        throw new NotFoundException(`Scenario with ID ${id} not found`);
      }

      return toScenario(scenario);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const err = error as Error;
      this.logger.error(
        `Failed to find scenario: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Update a scenario using findByIdAndUpdate
   */
  async update(
    id: string,
    updateScenarioDto: UpdateScenarioDto,
  ): Promise<Scenario> {
    try {
      const updateQuery: Record<string, unknown> = {
        ...updateScenarioDto,
        updatedAt: new Date(),
      };

      // Convert arrays to ObjectIds
      if (
        updateScenarioDto.personaIds &&
        updateScenarioDto.personaIds.length > 0
      ) {
        updateQuery.personaIds = updateScenarioDto.personaIds.map(
          (pid) => new Types.ObjectId(pid),
        );
      } else {
        delete updateQuery.personaIds;
      }

      if (updateScenarioDto.scorecardId) {
        updateQuery.scorecardId = new Types.ObjectId(
          updateScenarioDto.scorecardId,
        );
      } else {
        delete updateQuery.scorecardId;
      }

      const scenario = await this.scenarioModel.findByIdAndUpdate(
        id,
        updateQuery,
        { new: true },
      );

      if (!scenario) {
        throw new NotFoundException(`Scenario with ID ${id} not found`);
      }

      return toScenario(scenario);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const err = error as Error;
      this.logger.error(
        `Failed to update scenario: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Delete a scenario (archive -- soft delete)
   */
  async remove(id: string): Promise<void> {
    try {
      const scenario = await this.scenarioModel.findById(id).exec();
      if (!scenario) {
        throw new NotFoundException(`Scenario with ID ${id} not found`);
      }

      // Archive instead of hard delete
      await this.scenarioModel.findByIdAndUpdate(id, { status: 'archived' });

      this.logger.log(`Archived scenario ${id}`);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const err = error as Error;
      this.logger.error(
        `Failed to delete scenario: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Clone/duplicate a scenario
   */
  async clone(
    id: string,
    createdBy?: string,
    name?: string,
  ): Promise<Scenario> {
    try {
      const originalScenario = await this.findOne(id);

      const scenarioJson = originalScenario as unknown as ScenarioJSON;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: originalId, _id: originalObjectId, ...rest } = scenarioJson;
      const parentId = originalObjectId || originalId;

      const clonedScenario = new this.scenarioModel({
        ...rest,
        name: name || `${originalScenario.name} (Clone)`,
        status: 'draft',
        version: 1,
        parentScenarioId: parentId,
        createdBy: createdBy || 'local',
        lastModifiedBy: undefined,
        metrics: {
          totalExecutions: 0,
          successfulExecutions: 0,
          averageScore: 0,
          lastExecuted: null,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const savedClone = await clonedScenario.save();
      return toScenario(savedClone);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to clone scenario: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Validate scenario for publishing.
   * Checks required fields and optionally validates persona references
   * via an injected lookup function.
   */
  async validate(
    id: string,
    personaLookup?: (personaId: string) => Promise<unknown>,
  ): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    try {
      const scenario = await this.findOne(id);
      const errors: string[] = [];
      const warnings: string[] = [];

      // Check required fields
      if (!scenario.prompt || scenario.prompt.length === 0) {
        errors.push('Prompt is required');
      }

      if (!scenario.personaIds || scenario.personaIds.length === 0) {
        errors.push('At least one persona is required');
      }

      // Validate personas exist if a lookup function is provided
      if (personaLookup) {
        for (const personaId of scenario.personaIds || []) {
          try {
            await personaLookup(personaId.toString());
          } catch {
            errors.push(`Persona ${personaId} not found`);
          }
        }
      }

      // Add warnings for optional fields
      if (!scenario.description) {
        warnings.push('No description provided');
      }

      if (!scenario.tags || scenario.tags.length === 0) {
        warnings.push('No tags provided');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to validate scenario: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Publish a scenario (draft/paused -> active)
   */
  async publish(
    id: string,
    personaLookup?: (personaId: string) => Promise<unknown>,
  ): Promise<{
    scenario: Scenario;
    previousStatus: string;
  }> {
    try {
      const scenario = await this.findOne(id);
      const previousStatus = scenario.status;

      // Validate before publishing
      const validation = await this.validate(
        id,
        personaLookup,
      );
      if (!validation.valid) {
        throw new BadRequestException(
          `Cannot publish scenario: ${validation.errors.join(', ')}`,
        );
      }

      const updatedScenario = await this.scenarioModel.findByIdAndUpdate(
        id,
        {
          status: 'active',
          updatedAt: new Date(),
        },
        { new: true },
      );

      if (!updatedScenario) {
        throw new NotFoundException(`Scenario with ID ${id} not found`);
      }

      this.logger.log(
        `Published scenario ${id}: ${previousStatus} -> active`,
      );

      return {
        scenario: toScenario(updatedScenario),
        previousStatus,
      };
    } catch (error: unknown) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      const err = error as Error;
      this.logger.error(
        `Failed to publish scenario: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Unpublish a scenario (active -> paused)
   */
  async unpublish(
    id: string,
  ): Promise<{
    scenario: Scenario;
    previousStatus: string;
  }> {
    try {
      const scenario = await this.findOne(id);
      const previousStatus = scenario.status;

      const updatedScenario = await this.scenarioModel.findByIdAndUpdate(
        id,
        {
          status: 'paused',
          updatedAt: new Date(),
        },
        { new: true },
      );

      if (!updatedScenario) {
        throw new NotFoundException(`Scenario with ID ${id} not found`);
      }

      this.logger.log(
        `Unpublished scenario ${id}: ${previousStatus} -> paused`,
      );

      return {
        scenario: toScenario(updatedScenario),
        previousStatus,
      };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const err = error as Error;
      this.logger.error(
        `Failed to unpublish scenario: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Get scenario statistics, optionally filtered by workspace.
   */
  async getScenarioStats(): Promise<{
    total: number;
    byType: Array<{ type: string; count: number }>;
    byStatus: Array<{ status: string; count: number }>;
    byCategory: Array<{ category: string; count: number }>;
    totalRuns: number;
    avgScore: number | null;
    avgRuntimeSeconds: number | null;
    activeRuns: number;
  }> {
    try {
      const [scenarioStats, totalRuns, activeRuns, executionMetrics] =
        await Promise.all([
          this.scenarioModel.aggregate([
            { $match: {} },
            {
              $facet: {
                total: [{ $count: 'count' }],
                byType: [
                  { $group: { _id: '$type', count: { $sum: 1 } } },
                  { $project: { _id: 0, type: '$_id', count: 1 } },
                ],
                byStatus: [
                  { $group: { _id: '$status', count: { $sum: 1 } } },
                  { $project: { _id: 0, status: '$_id', count: 1 } },
                ],
                byCategory: [
                  { $group: { _id: '$category', count: { $sum: 1 } } },
                  { $project: { _id: 0, category: '$_id', count: 1 } },
                ],
              },
            },
          ]),
          this.scenarioExecutionModel.countDocuments({}),
          this.scenarioExecutionModel.countDocuments({
            status: { $in: ['running', 'queued'] },
          }),
          this.scenarioExecutionModel.aggregate([
            { $match: {} },
            {
              $group: {
                _id: null,
                avgScore: { $avg: '$overallScore' },
                avgDuration: { $avg: '$duration' },
              },
            },
          ]),
        ]);

      const facetResult = scenarioStats[0] || {
        total: [],
        byType: [],
        byStatus: [],
        byCategory: [],
      };

      const baseStats = {
        total: facetResult.total?.[0]?.count || 0,
        byType: facetResult.byType || [],
        byStatus: facetResult.byStatus || [],
        byCategory: facetResult.byCategory || [],
      };

      const rawAvgScore =
        executionMetrics.length > 0 ? executionMetrics[0].avgScore : null;
      const rawAvgDuration =
        executionMetrics.length > 0 ? executionMetrics[0].avgDuration : null;
      const avgDurationSeconds =
        rawAvgDuration !== null ? rawAvgDuration / 1000 : null;

      return {
        total: baseStats.total,
        byType: baseStats.byType,
        byStatus: baseStats.byStatus,
        byCategory: baseStats.byCategory,
        totalRuns,
        avgScore:
          rawAvgScore !== null ? Math.round(rawAvgScore * 10) / 10 : null,
        avgRuntimeSeconds:
          avgDurationSeconds !== null
            ? Math.round(avgDurationSeconds * 10) / 10
            : null,
        activeRuns,
      };
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to get scenario stats: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Import a scenario from a YAML string.
   * Parses YAML and creates a scenario document.
   */
  async fromYaml(
    yamlString: string,
    createdBy?: string,
  ): Promise<Scenario> {
    try {
      const parsed = yaml.load(yamlString) as Record<string, unknown>;

      if (!parsed || typeof parsed !== 'object') {
        throw new BadRequestException('Invalid YAML: must be an object');
      }

      const dto: CreateScenarioDto = {
        name: parsed.name as string,
        description: parsed.description as string | undefined,
        context: parsed.context as CreateScenarioDto['context'],
        prompt: parsed.prompt as string,
        status: parsed.status as string | undefined,
        promptVariables: parsed.promptVariables as CreateScenarioDto['promptVariables'],
        category: (parsed.category as string) || 'support',
        difficulty: (parsed.difficulty as DifficultyLevel) || 'medium',
        tags: parsed.tags as string[] | undefined,
        personaIds: (parsed.personaIds as string[]) || [],
        scorecardId: parsed.scorecardId as string | undefined,
        phoneNumber: parsed.phoneNumber as string | undefined,
        simulationMode: parsed.simulationMode as CreateScenarioDto['simulationMode'],
        createdBy: parsed.createdBy as string | undefined,
      };

      return this.create(dto, createdBy);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to import scenario from YAML: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Create default starter scenarios. Idempotent — skips if defaults already exist.
   * Creates scenarios as drafts (no agents configured yet).
   */
  async createDefaultScenarios(
    personaMap: Record<string, string>,
    scorecardId?: string,
  ): Promise<Scenario[]> {
    try {
      // Check if defaults already exist
      const existing = await this.scenarioModel
        .find({ tags: '_default' })
        .exec();
      if (existing.length > 0) {
        // Ensure defaults are active (fix for early versions that created them as draft)
        await this.scenarioModel.updateMany(
          { tags: '_default', status: 'draft' },
          { $set: { status: 'active' } },
        );
        const updated = await this.scenarioModel
          .find({ tags: '_default' })
          .exec();
        this.logger.log(
          `Default scenarios already exist (${updated.length} found)`,
        );
        return updated.map((doc) => toScenario(doc));
      }

      const defaults = [
        {
          name: 'Angry Customer Refund',
          description:
            'A frustrated customer demands a full refund for a broken laptop purchased 2 weeks ago. Tests empathy, de-escalation, and resolution skills.',
          prompt:
            "I bought a laptop 2 weeks ago and it's already broken. I want a full refund NOW.",
          category: 'support',
          difficulty: 'medium' as DifficultyLevel,
          personaKey: 'Angry - Karen',
          tags: ['_default', 'refund', 'complaint', 'empathy'],
        },
        {
          name: 'Confused Billing Inquiry',
          description:
            'A worried customer calls about unfamiliar charges on their bill. Tests clarity, patience, and ability to explain complex information.',
          prompt:
            "I don't understand my bill. There are charges I've never seen before and I'm worried.",
          category: 'support',
          difficulty: 'easy' as DifficultyLevel,
          personaKey: 'Stressed - Mei',
          tags: ['_default', 'billing', 'clarity', 'patience'],
        },
        {
          name: 'Product Interest Call',
          description:
            'A curious prospect asks about the premium plan. Tests discovery, engagement, and sales skills.',
          prompt:
            "Hi, I've been looking at your premium plan. Can you tell me more about it?",
          category: 'sales',
          difficulty: 'easy' as DifficultyLevel,
          personaKey: 'Curious - Maria',
          tags: ['_default', 'sales', 'discovery', 'engagement'],
        },
      ];

      const scenarios: Scenario[] = [];

      for (const def of defaults) {
        const personaId = personaMap[def.personaKey];
        const personaIds = personaId
          ? [new Types.ObjectId(personaId)]
          : [];

        const scenarioData: Record<string, unknown> = {
          name: def.name,
          description: def.description,
          prompt: def.prompt,
          category: def.category,
          difficulty: def.difficulty,
          tags: def.tags,
          status: 'active',
          personaIds,
          createdBy: 'system',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        if (scorecardId) {
          scenarioData.scorecardId = new Types.ObjectId(scorecardId);
        }

        const scenario = new this.scenarioModel(scenarioData);
        const saved = await scenario.save();
        scenarios.push(toScenario(saved));
      }

      this.logger.log(`Created ${scenarios.length} default scenarios`);
      return scenarios;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to create default scenarios: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  /**
   * Export a scenario to a YAML string.
   */
  toYaml(scenario: Scenario): string {
    const exportData: Record<string, unknown> = {
      name: scenario.name,
      description: scenario.description,
      prompt: scenario.prompt,
      status: scenario.status,
      category: scenario.category,
      difficulty: scenario.difficulty,
      tags: scenario.tags,
      personaIds: (scenario.personaIds || []).map((id) => id.toString()),
    };

    if (scenario.context) {
      exportData.context = scenario.context;
    }

    if (scenario.promptVariables && scenario.promptVariables.length > 0) {
      exportData.promptVariables = scenario.promptVariables;
    }

    if (scenario.scorecardId) {
      exportData.scorecardId = scenario.scorecardId.toString();
    }

    if (scenario.simulationMode) {
      exportData.simulationMode = scenario.simulationMode;
    }

    if (scenario.phoneNumber) {
      exportData.phoneNumber = scenario.phoneNumber;
    }

    return yaml.dump(exportData, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });
  }
}
