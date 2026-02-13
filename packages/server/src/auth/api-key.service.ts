import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { ApiKey, ApiKeyDocument } from './api-key.schema';

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectModel(ApiKey.name)
    private readonly apiKeyModel: Model<ApiKeyDocument>,
  ) {}

  /**
   * Generate a new API key with a cryptographically random value.
   */
  async createApiKey(name?: string): Promise<ApiKeyDocument> {
    const key = `eval_${randomBytes(24).toString('hex')}`;
    const created = new this.apiKeyModel({ key, name, isActive: true });
    return created.save();
  }

  /**
   * Validate an API key string against stored keys.
   */
  async validateKey(key: string): Promise<boolean> {
    const apiKey = await this.apiKeyModel
      .findOne({ key, isActive: true })
      .lean()
      .exec();
    return !!apiKey;
  }

  /**
   * List all API keys (redacts the full key for security).
   */
  async listApiKeys(): Promise<ApiKeyDocument[]> {
    return this.apiKeyModel.find().sort({ createdAt: -1 }).exec();
  }

  /**
   * Deactivate an API key by ID.
   */
  async deactivateApiKey(id: string): Promise<ApiKeyDocument | null> {
    return this.apiKeyModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();
  }

  /**
   * Check if any API keys exist at all (used for bootstrap).
   */
  async hasAnyKeys(): Promise<boolean> {
    const count = await this.apiKeyModel.countDocuments().exec();
    return count > 0;
  }
}
