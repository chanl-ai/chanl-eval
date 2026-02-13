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
   * workspaceId is optional for OSS mode (no workspaces).
   */
  async create(
    createScenarioDto: CreateScenarioDto,
    workspaceId?: string,
    userId?: string,
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

        if (
          !createScenarioDto.agentIds ||
          createScenarioDto.agentIds.length === 0
        ) {
          throw new BadRequestException(
            'agentIds array is required and must contain at least one agent ID',
          );
        }
      }

      // Convert IDs to ObjectIds
      const personaIds = createScenarioDto.personaIds
        ? createScenarioDto.personaIds.map((id) => new Types.ObjectId(id))
        : [];

      const agentIds = createScenarioDto.agentIds
        ? createScenarioDto.agentIds.map((id) => new Types.ObjectId(id))
        : [];

      const scenarioData: any = {
        ...createScenarioDto,
        status: createScenarioDto.status || 'active',
        personaIds,
        agentIds,
        createdBy: userId || 'system',
      };

      if (workspaceId) {
        scenarioData.workspaceId = new Types.ObjectId(workspaceId);
      }

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
      return savedScenario.toJSON() as any as Scenario;
    } catch (error: any) {
      this.logger.error(
        `Failed to create scenario: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Find all scenarios, optionally filtered by workspace.
   * When workspaceId is not provided, returns all scenarios (OSS mode).
   */
  async findAll(
    workspaceId?: string,
    filters?: {
      agentId?: string;
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
      const query: any = {};

      if (workspaceId) {
        query.workspaceId = new Types.ObjectId(workspaceId);
      }

      if (filters) {
        if (filters.agentId) {
          query['agentIds'] = new Types.ObjectId(filters.agentId);
        }
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
        (doc) => doc.toJSON() as any as Scenario,
      );
      return { scenarios: serializedScenarios, total };
    } catch (error: any) {
      this.logger.error(
        `Failed to find scenarios: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Find scenario by ID
   */
  async findOne(id: string, workspaceId?: string): Promise<Scenario> {
    try {
      const scenario = await this.scenarioModel.findById(id);

      if (!scenario) {
        throw new NotFoundException(`Scenario with ID ${id} not found`);
      }

      if (workspaceId && scenario.workspaceId?.toString() !== workspaceId) {
        throw new NotFoundException(`Scenario with ID ${id} not found`);
      }

      return scenario.toJSON() as any as Scenario;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to find scenario: ${error.message}`,
        error.stack,
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
    workspaceId?: string,
    userId?: string,
  ): Promise<Scenario> {
    try {
      const updateQuery: any = {
        ...updateScenarioDto,
        updatedAt: new Date(),
      };

      if (userId) {
        updateQuery.lastModifiedBy = userId;
      }

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

      if (
        updateScenarioDto.agentIds &&
        updateScenarioDto.agentIds.length > 0
      ) {
        updateQuery.agentIds = updateScenarioDto.agentIds.map(
          (aid) => new Types.ObjectId(aid),
        );
      } else {
        delete updateQuery.agentIds;
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

      return scenario.toJSON() as any as Scenario;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update scenario: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete a scenario (archive -- soft delete)
   */
  async remove(id: string, workspaceId?: string): Promise<void> {
    try {
      const scenario = await this.scenarioModel.findById(id).exec();
      if (!scenario) {
        throw new NotFoundException(`Scenario with ID ${id} not found`);
      }

      if (workspaceId && scenario.workspaceId?.toString() !== workspaceId) {
        throw new NotFoundException(`Scenario with ID ${id} not found`);
      }

      // Archive instead of hard delete
      await this.scenarioModel.findByIdAndUpdate(id, { status: 'archived' });

      this.logger.log(`Archived scenario ${id}`);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete scenario: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Clone/duplicate a scenario
   */
  async clone(
    id: string,
    userId?: string,
    name?: string,
    workspaceId?: string,
  ): Promise<Scenario> {
    try {
      const originalScenario = await this.findOne(id, workspaceId);

      const scenarioDoc = originalScenario as any;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: originalId, _id: originalObjectId, ...rest } = scenarioDoc;
      const parentId = originalObjectId || originalId;

      const clonedScenario = new this.scenarioModel({
        ...rest,
        name: name || `${originalScenario.name} (Clone)`,
        status: 'draft',
        version: 1,
        parentScenarioId: parentId,
        createdBy: userId || 'system',
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
      return savedClone.toJSON() as any as Scenario;
    } catch (error: any) {
      this.logger.error(
        `Failed to clone scenario: ${error.message}`,
        error.stack,
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
    workspaceId?: string,
    personaLookup?: (personaId: string) => Promise<any>,
  ): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    try {
      const scenario = await this.findOne(id, workspaceId);
      const errors: string[] = [];
      const warnings: string[] = [];

      // Check required fields
      if (!scenario.prompt || scenario.prompt.length === 0) {
        errors.push('Prompt is required');
      }

      if (!scenario.personaIds || scenario.personaIds.length === 0) {
        errors.push('At least one persona is required');
      }

      if (!scenario.agentIds || scenario.agentIds.length === 0) {
        errors.push('At least one agent is required');
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
    } catch (error: any) {
      this.logger.error(
        `Failed to validate scenario: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Publish a scenario (draft/paused -> active)
   */
  async publish(
    id: string,
    workspaceId?: string,
    userId?: string,
    personaLookup?: (personaId: string) => Promise<any>,
  ): Promise<{
    scenario: Scenario;
    previousStatus: string;
  }> {
    try {
      const scenario = await this.findOne(id, workspaceId);
      const previousStatus = scenario.status;

      // Validate before publishing
      const validation = await this.validate(
        id,
        workspaceId,
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
          lastModifiedBy: userId,
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
        scenario: updatedScenario.toJSON() as any as Scenario,
        previousStatus,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to publish scenario: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Unpublish a scenario (active -> paused)
   */
  async unpublish(
    id: string,
    workspaceId?: string,
    userId?: string,
  ): Promise<{
    scenario: Scenario;
    previousStatus: string;
  }> {
    try {
      const scenario = await this.findOne(id, workspaceId);
      const previousStatus = scenario.status;

      const updatedScenario = await this.scenarioModel.findByIdAndUpdate(
        id,
        {
          status: 'paused',
          updatedAt: new Date(),
          lastModifiedBy: userId,
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
        scenario: updatedScenario.toJSON() as any as Scenario,
        previousStatus,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to unpublish scenario: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get scenario statistics, optionally filtered by workspace.
   */
  async getScenarioStats(workspaceId?: string): Promise<{
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
      const matchStage: any = {};
      if (workspaceId) {
        matchStage.workspaceId = new Types.ObjectId(workspaceId);
      }

      const execMatchStage: any = {};
      if (workspaceId) {
        execMatchStage.workspaceId = new Types.ObjectId(workspaceId);
      }

      const [scenarioStats, totalRuns, activeRuns, executionMetrics] =
        await Promise.all([
          this.scenarioModel.aggregate([
            { $match: matchStage },
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
          this.scenarioExecutionModel.countDocuments(execMatchStage),
          this.scenarioExecutionModel.countDocuments({
            ...execMatchStage,
            status: { $in: ['running', 'queued'] },
          }),
          this.scenarioExecutionModel.aggregate([
            { $match: execMatchStage },
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
    } catch (error: any) {
      this.logger.error(
        `Failed to get scenario stats: ${error.message}`,
        error.stack,
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
    workspaceId?: string,
    userId?: string,
  ): Promise<Scenario> {
    try {
      const parsed = yaml.load(yamlString) as Record<string, any>;

      if (!parsed || typeof parsed !== 'object') {
        throw new BadRequestException('Invalid YAML: must be an object');
      }

      const dto: CreateScenarioDto = {
        name: parsed.name,
        description: parsed.description,
        context: parsed.context,
        prompt: parsed.prompt,
        status: parsed.status,
        promptVariables: parsed.promptVariables,
        category: parsed.category || 'support',
        difficulty: parsed.difficulty || 'medium',
        tags: parsed.tags,
        personaIds: parsed.personaIds || [],
        agentIds: parsed.agentIds || [],
        scorecardId: parsed.scorecardId,
        agentOverrides: parsed.agentOverrides,
        phoneNumber: parsed.phoneNumber,
        simulationMode: parsed.simulationMode,
        createdBy: parsed.createdBy,
      };

      return this.create(dto, workspaceId, userId);
    } catch (error: any) {
      this.logger.error(
        `Failed to import scenario from YAML: ${error.message}`,
        error.stack,
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
        return updated.map((doc) => doc.toJSON() as any as Scenario);
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

        const scenarioData: any = {
          name: def.name,
          description: def.description,
          prompt: def.prompt,
          category: def.category,
          difficulty: def.difficulty,
          tags: def.tags,
          status: 'active',
          personaIds,
          agentIds: [],
          createdBy: 'system',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        if (scorecardId) {
          scenarioData.scorecardId = new Types.ObjectId(scorecardId);
        }

        const scenario = new this.scenarioModel(scenarioData);
        const saved = await scenario.save();
        scenarios.push(saved.toJSON() as any as Scenario);
      }

      this.logger.log(`Created ${scenarios.length} default scenarios`);
      return scenarios;
    } catch (error: any) {
      this.logger.error(
        `Failed to create default scenarios: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Export a scenario to a YAML string.
   */
  toYaml(scenario: Scenario): string {
    const doc = scenario as any;

    const exportData: Record<string, any> = {
      name: doc.name,
      description: doc.description,
      prompt: doc.prompt,
      status: doc.status,
      category: doc.category,
      difficulty: doc.difficulty,
      tags: doc.tags,
      personaIds: (doc.personaIds || []).map((id: any) => id.toString()),
      agentIds: (doc.agentIds || []).map((id: any) => id.toString()),
    };

    if (doc.context) {
      exportData.context = doc.context;
    }

    if (doc.promptVariables && doc.promptVariables.length > 0) {
      exportData.promptVariables = doc.promptVariables;
    }

    if (doc.scorecardId) {
      exportData.scorecardId = doc.scorecardId.toString();
    }

    if (doc.simulationMode) {
      exportData.simulationMode = doc.simulationMode;
    }

    if (doc.phoneNumber) {
      exportData.phoneNumber = doc.phoneNumber;
    }

    if (doc.agentOverrides) {
      exportData.agentOverrides = doc.agentOverrides;
    }

    return yaml.dump(exportData, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });
  }
}
