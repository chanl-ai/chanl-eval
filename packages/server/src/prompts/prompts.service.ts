import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery, Types } from 'mongoose';
import { Prompt, PromptDocument } from './prompt.schema';

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
  }): Promise<Prompt> {
    const prompt = await this.promptModel.create(dto);
    this.logger.log(`Created prompt ${prompt._id}`);
    return prompt;
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
