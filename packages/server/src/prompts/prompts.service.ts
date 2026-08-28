import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery, Types } from 'mongoose';
import { Prompt, PromptDocument } from './prompt.schema';
import { DEFAULT_PROMPTS } from './default-prompts';

@Injectable()
export class PromptsService {
  private readonly logger = new Logger(PromptsService.name);

  constructor(
    @InjectModel(Prompt.name)
    private readonly promptModel: Model<PromptDocument>,
  ) {}

  async create(dto: {
    name: string;
    description?: string;
    content: string;
    status?: string;
    tags?: string[];
    adapterConfig?: Record<string, any>;
  }): Promise<Prompt> {
    const prompt = await this.promptModel.create(dto);
    this.logger.log(`Created prompt ${prompt._id}`);
    return prompt;
  }

  /**
   * Seed the default agents-under-test. Called on first boot.
   *
   * A scenario cannot execute without a `promptId`, so an install with zero prompts cannot complete
   * a single run — which is exactly what the Docker quickstart used to produce.
   *
   * Idempotent by upsert on `name` rather than a count-then-insert check, so concurrent replica
   * boots converge instead of racing (the unique index on `name` is what actually enforces it).
   */
  async createDefaultPromptsIfNeeded(): Promise<Prompt[]> {
    const results: Prompt[] = [];

    for (const definition of DEFAULT_PROMPTS) {
      const prompt = await this.promptModel.findOneAndUpdate(
        { name: definition.name },
        // $setOnInsert only: re-seeding must never clobber a prompt the user has since edited.
        { $setOnInsert: { ...definition, tags: [...(definition.tags ?? []), '_default'] } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      if (prompt) results.push(prompt);
    }

    this.logger.log(`Default prompts ensured: ${results.length}`);
    return results;
  }

  async findAll(
    params: {
      status?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ prompts: Prompt[]; total: number }> {
    const filter: FilterQuery<PromptDocument> = {};

    if (params.status) {
      filter.status = params.status;
    }

    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const [prompts, total] = await Promise.all([
      this.promptModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.promptModel.countDocuments(filter),
    ]);

    return { prompts, total };
  }

  async findById(id: string): Promise<Prompt> {
    const prompt = await this.promptModel.findById(id);
    if (!prompt) {
      throw new NotFoundException(`Prompt ${id} not found`);
    }
    return prompt;
  }

  async update(
    id: string,
    dto: {
      name?: string;
      description?: string;
      content?: string;
      status?: string;
      tags?: string[];
    },
  ): Promise<Prompt> {
    const prompt = await this.promptModel.findByIdAndUpdate(
      id,
      { $set: dto },
      { new: true },
    );
    if (!prompt) {
      throw new NotFoundException(`Prompt ${id} not found`);
    }
    this.logger.log(`Updated prompt ${id}`);
    return prompt;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.promptModel.deleteOne({
      _id: new Types.ObjectId(id),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Prompt ${id} not found`);
    }
    this.logger.log(`Deleted prompt ${id}`);
    return true;
  }
}
