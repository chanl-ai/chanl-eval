import { Controller, Get, Put, Param, Body, NotFoundException } from '@nestjs/common';
import { SettingsService, MASK_PREFIX } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async get() {
    const settings = await this.settingsService.get();
    // Mask API keys in response (show last 4 chars only)
    const masked = { ...settings.toJSON() };
    if (masked.providerKeys) {
      const keys: Record<string, string> = {};
      for (const [provider, key] of Object.entries(masked.providerKeys)) {
        if (key && typeof key === 'string' && key.length > 4) {
          keys[provider] = MASK_PREFIX + key.slice(-4);
        } else if (key) {
          keys[provider] = MASK_PREFIX;
        }
      }
      masked.providerKeys = keys;
    }

    // Tells the UI whether a run can actually reach an LLM, and from where. Without this the
    // dashboard cannot distinguish "no key anywhere" from "operator set CHANL_OPENAI_API_KEY".
    const keySources = await this.settingsService.getKeySources();

    return {
      settings: masked,
      keySources,
      hasAnyKey: Object.values(keySources).some((s) => s !== null),
    };
  }

  @Get('keys/:provider')
  async getApiKey(@Param('provider') provider: string) {
    const key = await this.settingsService.getApiKey(provider);
    if (!key) {
      throw new NotFoundException(`No API key configured for provider "${provider}"`);
    }
    return { provider, apiKey: key };
  }

  @Put()
  async update(
    @Body() dto: { providerKeys?: Record<string, string>; simulationBaseUrl?: string },
  ) {
    await this.settingsService.update(dto);
    return this.get();
  }
}
