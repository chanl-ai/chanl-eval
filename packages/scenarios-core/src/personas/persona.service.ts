import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Persona, PersonaDocument } from './schemas/persona.schema';
import { CreatePersonaDto } from './dto/create-persona.dto';
import { UpdatePersonaDto } from './dto/update-persona.dto';

@Injectable()
export class PersonaService {
  private readonly logger = new Logger(PersonaService.name);

  constructor(
    @InjectModel(Persona.name) private personaModel: Model<PersonaDocument>,
  ) {}

  /**
   * Create a new persona.
   * workspaceId is optional for OSS mode (no workspaces).
   */
  async create(
    createPersonaDto: CreatePersonaDto,
    createdBy?: string,
  ): Promise<Persona> {
    try {
      const data: any = {
        ...createPersonaDto,
        createdBy: createdBy || 'local',
      };

      const persona = new this.personaModel(data);
      return await persona.save();
    } catch (error: any) {
      this.logger.error(
        `Failed to create persona: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Find all personas, optionally filtered by workspace.
   * When workspaceId is not provided, returns all personas (OSS mode).
   */
  async findAll(
    filters?: {
      emotion?: string;
      language?: string;
      gender?: string;
      accent?: string;
      isActive?: boolean;
      isDefault?: boolean;
      tags?: string[];
      createdBy?: string;
    },
    pagination?: {
      limit?: number;
      offset?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ): Promise<{ personas: Persona[]; total: number }> {
    try {
      const query: any = {};

      // Apply filters
      if (filters) {
        if (filters.emotion) query.emotion = filters.emotion;
        if (filters.language) query.language = filters.language;
        if (filters.gender) query.gender = filters.gender;
        if (filters.accent) query.accent = filters.accent;
        if (filters.isActive !== undefined) query.isActive = filters.isActive;
        if (filters.isDefault !== undefined) query.isDefault = filters.isDefault;
        if (filters.tags && filters.tags.length > 0)
          query.tags = { $in: filters.tags };
        if (filters.createdBy) query.createdBy = filters.createdBy;
      }

      // Build the query
      let queryBuilder = this.personaModel.find(query);

      // Apply sorting
      const sortBy = pagination?.sortBy || 'updatedAt';
      const sortOrder = pagination?.sortOrder === 'asc' ? 1 : -1;
      queryBuilder = queryBuilder.sort({ [sortBy]: sortOrder });

      // Apply pagination
      if (pagination?.offset)
        queryBuilder = queryBuilder.skip(pagination.offset);
      if (pagination?.limit)
        queryBuilder = queryBuilder.limit(pagination.limit);

      const personas = await queryBuilder.exec();
      const total = await this.personaModel.countDocuments(query);

      return { personas, total };
    } catch (error: any) {
      this.logger.error(
        `Failed to find personas: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Find persona by ID
   */
  async findOne(id: string): Promise<Persona> {
    try {
      const persona = await this.personaModel.findById(id);

      if (!persona) {
        throw new NotFoundException(`Persona with ID ${id} not found`);
      }

      return persona;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to find persona: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update a persona using findByIdAndUpdate
   */
  async update(
    id: string,
    updatePersonaDto: UpdatePersonaDto,
  ): Promise<Persona> {
    try {
      const updateQuery: any = {
        ...updatePersonaDto,
        updatedAt: new Date(),
      };

      const persona = await this.personaModel.findByIdAndUpdate(
        id,
        updateQuery,
        { new: true },
      );

      if (!persona) {
        throw new NotFoundException(`Persona with ID ${id} not found`);
      }

      return persona;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update persona: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete a persona
   */
  async remove(id: string): Promise<void> {
    try {
      const result = await this.personaModel.findByIdAndDelete(id);
      if (!result) {
        throw new NotFoundException(`Persona with ID ${id} not found`);
      }
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete persona: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get default personas, optionally filtered by workspace.
   */
  async getDefaultPersonas(): Promise<Persona[]> {
    try {
      const query: any = {
        isDefault: true,
        isActive: true,
      };

      return await this.personaModel.find(query).exec();
    } catch (error: any) {
      this.logger.error(
        `Failed to get default personas: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Create default personas. workspaceId is optional for OSS mode.
   */
  async createDefaultPersonas(
    createdBy?: string,
  ): Promise<Persona[]> {
    try {
      const existingDefaults = await this.getDefaultPersonas();
      if (existingDefaults.length > 0) {
        return existingDefaults;
      }

      const defaultPersonas = [
        {
          name: 'Angry - Karen',
          description: 'Frustrated customer with demanding tone',
          gender: 'female',
          emotion: 'irritated',
          language: 'english',
          accent: 'british',
          intentClarity: 'slightly unclear',
          speechStyle: 'normal',
          backgroundNoise: false,
          allowInterruptions: false,
          tags: ['customer-service', 'complaint', 'urgent'],
          isDefault: true,
          isActive: true,
          createdBy,
        },
        {
          name: 'Friendly - Sophia',
          description: 'Warm and welcoming customer service representative',
          gender: 'female',
          emotion: 'friendly',
          language: 'english',
          accent: 'american',
          intentClarity: 'very clear',
          speechStyle: 'slow',
          backgroundNoise: false,
          allowInterruptions: true,
          tags: ['customer-service', 'helpful', 'patient'],
          isDefault: true,
          isActive: true,
          createdBy,
        },
        {
          name: 'Polite - Carlos',
          description: 'Professional and courteous customer',
          gender: 'male',
          emotion: 'polite',
          language: 'spanish',
          accent: 'mexican',
          intentClarity: 'very clear',
          speechStyle: 'normal',
          backgroundNoise: false,
          allowInterruptions: false,
          tags: ['professional', 'courteous', 'spanish'],
          isDefault: true,
          isActive: true,
          createdBy,
        },
        {
          name: 'Stressed - Mei',
          description: 'Overwhelmed customer with urgent needs',
          gender: 'female',
          emotion: 'stressed',
          language: 'english',
          accent: 'american',
          intentClarity: 'slightly unclear',
          speechStyle: 'fast',
          backgroundNoise: true,
          allowInterruptions: true,
          tags: ['urgent', 'overwhelmed', 'time-sensitive'],
          isDefault: true,
          isActive: true,
          createdBy,
        },
        {
          name: 'Distracted - Alex',
          description: 'Customer who seems preoccupied and unfocused',
          gender: 'male',
          emotion: 'distracted',
          language: 'english',
          accent: 'canadian',
          intentClarity: 'mumbled',
          speechStyle: 'moderate',
          backgroundNoise: true,
          allowInterruptions: true,
          tags: ['distracted', 'unfocused', 'multitasking'],
          isDefault: true,
          isActive: true,
          createdBy,
        },
        {
          name: 'Calm - James',
          description: 'Relaxed and composed customer',
          gender: 'male',
          emotion: 'calm',
          language: 'english',
          accent: 'american',
          intentClarity: 'very clear',
          speechStyle: 'slow',
          backgroundNoise: false,
          allowInterruptions: false,
          tags: ['calm', 'patient', 'composed'],
          isDefault: true,
          isActive: true,
          createdBy,
        },
        {
          name: 'Curious - Maria',
          description: 'Inquisitive customer asking many questions',
          gender: 'female',
          emotion: 'curious',
          language: 'portuguese',
          accent: 'brazilian',
          intentClarity: 'very clear',
          speechStyle: 'normal',
          backgroundNoise: false,
          allowInterruptions: true,
          tags: ['inquisitive', 'questions', 'portuguese'],
          isDefault: true,
          isActive: true,
          createdBy,
        },
      ];

      const insertData = defaultPersonas.map((persona) => ({
        ...persona,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const personas = (await this.personaModel.insertMany(
        insertData,
      )) as Persona[];

      this.logger.log(
        `Created ${personas.length} default personas`,
      );
      return personas;
    } catch (error: any) {
      this.logger.error(
        `Failed to create default personas: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get persona statistics, optionally filtered by workspace.
   */
  async getPersonaStats(): Promise<{
    totalPersonas: number;
    activePersonas: number;
    languages: number;
    defaultPersonas: number;
    total: number;
    byEmotion: Array<{ emotion: string; count: number }>;
    byLanguage: Array<{ language: string; count: number }>;
    byGender: Array<{ gender: string; count: number }>;
    byAccent: Array<{ accent: string; count: number }>;
    active: number;
    defaults: number;
    withBackgroundNoise: number;
    withInterruptions: number;
  }> {
    try {
      const stats = await this.personaModel.aggregate([
        { $match: {} },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            byEmotion: {
              $push: {
                emotion: '$emotion',
                count: 1,
              },
            },
            byLanguage: {
              $push: {
                language: '$language',
                count: 1,
              },
            },
            byGender: {
              $push: {
                gender: '$gender',
                count: 1,
              },
            },
            byAccent: {
              $push: {
                accent: '$accent',
                count: 1,
              },
            },
            active: { $sum: { $cond: ['$isActive', 1, 0] } },
            defaults: { $sum: { $cond: ['$isDefault', 1, 0] } },
            withBackgroundNoise: {
              $sum: { $cond: ['$backgroundNoise', 1, 0] },
            },
            withInterruptions: {
              $sum: { $cond: ['$allowInterruptions', 1, 0] },
            },
          },
        },
      ]);

      const baseStats = stats[0] || {
        total: 0,
        byEmotion: [],
        byLanguage: [],
        byGender: [],
        byAccent: [],
        active: 0,
        defaults: 0,
        withBackgroundNoise: 0,
        withInterruptions: 0,
      };

      // Count distinct languages from byLanguage array
      const distinctLanguages = new Set(
        baseStats.byLanguage.map((item: { language: string }) => item.language),
      ).size;

      return {
        // New standardized field names per API spec
        totalPersonas: baseStats.total,
        activePersonas: baseStats.active,
        languages: distinctLanguages,
        defaultPersonas: baseStats.defaults,
        // Legacy fields for backward compatibility
        ...baseStats,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to get persona stats: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
