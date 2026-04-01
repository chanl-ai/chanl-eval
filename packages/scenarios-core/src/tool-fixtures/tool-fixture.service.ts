import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ToolFixture, ToolFixtureDocument } from './schemas/tool-fixture.schema';
import { CreateToolFixtureDto } from './dto/create-tool-fixture.dto';
import { UpdateToolFixtureDto } from './dto/update-tool-fixture.dto';

@Injectable()
export class ToolFixtureService {
  private readonly logger = new Logger(ToolFixtureService.name);

  constructor(
    @InjectModel(ToolFixture.name)
    private toolFixtureModel: Model<ToolFixtureDocument>,
  ) {}

  /**
   * Create a new tool fixture.
   */
  async create(
    createDto: CreateToolFixtureDto,
    createdBy?: string,
  ): Promise<ToolFixture> {
    try {
      const data: any = {
        ...createDto,
        createdBy: createdBy || 'local',
      };

      const toolFixture = new this.toolFixtureModel(data);
      return await toolFixture.save();
    } catch (error: any) {
      this.logger.error(
        `Failed to create tool fixture: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Find all tool fixtures with optional filters and pagination.
   */
  async findAll(
    filters?: {
      isActive?: boolean;
      tags?: string[];
      search?: string;
    },
    pagination?: {
      limit?: number;
      offset?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ): Promise<{ toolFixtures: ToolFixture[]; total: number }> {
    try {
      const query: any = {};

      // Apply filters
      if (filters) {
        if (filters.isActive !== undefined) query.isActive = filters.isActive;
        if (filters.tags && filters.tags.length > 0)
          query.tags = { $in: filters.tags };
        if (filters.search) {
          query.$or = [
            { name: { $regex: filters.search, $options: 'i' } },
            { description: { $regex: filters.search, $options: 'i' } },
          ];
        }
      }

      // Build the query
      let queryBuilder = this.toolFixtureModel.find(query);

      // Apply sorting
      const sortBy = pagination?.sortBy || 'updatedAt';
      const sortOrder = pagination?.sortOrder === 'asc' ? 1 : -1;
      queryBuilder = queryBuilder.sort({ [sortBy]: sortOrder });

      // Apply pagination
      if (pagination?.offset)
        queryBuilder = queryBuilder.skip(pagination.offset);
      if (pagination?.limit)
        queryBuilder = queryBuilder.limit(pagination.limit);

      const toolFixtures = await queryBuilder.exec();
      const total = await this.toolFixtureModel.countDocuments(query);

      return { toolFixtures, total };
    } catch (error: any) {
      this.logger.error(
        `Failed to find tool fixtures: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Find tool fixture by ID.
   */
  async findOne(id: string): Promise<ToolFixture> {
    try {
      const toolFixture = await this.toolFixtureModel.findById(id);

      if (!toolFixture) {
        throw new NotFoundException(`ToolFixture with ID ${id} not found`);
      }

      return toolFixture;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to find tool fixture: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Bulk load tool fixtures by IDs.
   * Returns found fixtures (silently skips missing IDs).
   */
  async findByIds(ids: string[]): Promise<ToolFixture[]> {
    try {
      const toolFixtures = await this.toolFixtureModel
        .find({ _id: { $in: ids } })
        .exec();
      return toolFixtures;
    } catch (error: any) {
      this.logger.error(
        `Failed to find tool fixtures by IDs: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update a tool fixture using findByIdAndUpdate.
   */
  async update(
    id: string,
    updateDto: UpdateToolFixtureDto,
  ): Promise<ToolFixture> {
    try {
      const updateQuery: any = {
        ...updateDto,
        updatedAt: new Date(),
      };

      const toolFixture = await this.toolFixtureModel.findByIdAndUpdate(
        id,
        updateQuery,
        { new: true },
      );

      if (!toolFixture) {
        throw new NotFoundException(`ToolFixture with ID ${id} not found`);
      }

      return toolFixture;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update tool fixture: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete a tool fixture (hard delete, matching persona pattern).
   */
  async remove(id: string): Promise<void> {
    try {
      const result = await this.toolFixtureModel.findByIdAndDelete(id);
      if (!result) {
        throw new NotFoundException(`ToolFixture with ID ${id} not found`);
      }
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete tool fixture: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get tool fixture statistics.
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    byTag: Array<{ tag: string; count: number }>;
  }> {
    try {
      const [countStats] = await this.toolFixtureModel.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: ['$isActive', 1, 0] } },
            inactive: { $sum: { $cond: ['$isActive', 0, 1] } },
          },
        },
      ]);

      const tagStats = await this.toolFixtureModel.aggregate([
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $project: { _id: 0, tag: '$_id', count: 1 } },
        { $sort: { count: -1 } },
      ]);

      return {
        total: countStats?.total || 0,
        active: countStats?.active || 0,
        inactive: countStats?.inactive || 0,
        byTag: tagStats,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to get tool fixture stats: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
