import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Settings, SettingsDocument } from './settings.schema';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectModel(Settings.name)
    private readonly model: Model<SettingsDocument>,
  ) {}

  async get(): Promise<SettingsDocument> {
    let settings = await this.model.findOne();
    if (!settings) {
      settings = await this.model.create({});
      this.logger.log('Created default settings document');
    }
    return settings;
  }

  async getApiKey(provider: string): Promise<string | undefined> {
    const settings = await this.get();
    const keys: Record<string, string | undefined> = settings.providerKeys || {};
    return keys[provider] || undefined;
  }

  async update(dto: {
    providerKeys?: Record<string, string>;
  }): Promise<SettingsDocument> {
    const settings = await this.get();
    const updated = await this.model.findByIdAndUpdate(
      settings._id,
      { $set: dto },
      { new: true },
    );
    this.logger.log('Updated settings');
    return updated!;
  }
}
