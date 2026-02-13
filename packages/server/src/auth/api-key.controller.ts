import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { Public } from './public.decorator';

@ApiTags('API Keys')
@Controller('api-keys')
export class ApiKeyController {
  private readonly logger = new Logger(ApiKeyController.name);

  constructor(private readonly apiKeyService: ApiKeyService) {}

  /**
   * Create a new API key.
   * Public only if no keys exist yet (bootstrap flow).
   * Once keys exist, the global guard requires authentication.
   */
  @Post()
  @Public()
  @ApiOperation({ summary: 'Generate a new API key' })
  async create(@Body() dto: CreateApiKeyDto) {
    // If keys already exist, this endpoint is "public" via decorator but
    // we still want to protect it. We check if keys exist and if so,
    // we re-apply the guard logic manually.
    // However, for initial bootstrap (no keys at all), it must be open.
    const hasKeys = await this.apiKeyService.hasAnyKeys();
    if (hasKeys) {
      // This is handled by the guard for non-@Public routes.
      // Since we marked this @Public for bootstrap, we need a secondary check.
      // The guard runs but sees @Public and skips. So we must verify inline.
      // We'll throw Forbidden to signal the caller to use auth.
      throw new ForbiddenException(
        'API keys already exist. Use X-API-Key header to authenticate.',
      );
    }

    this.logger.log('Creating initial API key (bootstrap)');
    const apiKey = await this.apiKeyService.createApiKey(dto.name);
    return {
      id: apiKey.id,
      key: apiKey.key,
      name: apiKey.name,
      isActive: apiKey.isActive,
      message: 'Store this key securely. It will not be shown again in full.',
    };
  }

  /**
   * Create an API key (authenticated route).
   * This is the normal path once the system is bootstrapped.
   */
  @Post('generate')
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'Generate a new API key (authenticated)' })
  async generate(@Body() dto: CreateApiKeyDto) {
    const apiKey = await this.apiKeyService.createApiKey(dto.name);
    return {
      id: apiKey.id,
      key: apiKey.key,
      name: apiKey.name,
      isActive: apiKey.isActive,
      message: 'Store this key securely. It will not be shown again in full.',
    };
  }

  @Get()
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'List all API keys' })
  async list() {
    const keys = await this.apiKeyService.listApiKeys();
    return keys.map((k) => ({
      id: k.id,
      // Redact key: show prefix + last 8 chars
      key: `${k.key.slice(0, 5)}...${k.key.slice(-8)}`,
      name: k.name,
      isActive: k.isActive,
    }));
  }

  @Delete(':id')
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'Deactivate an API key' })
  async deactivate(@Param('id') id: string) {
    const apiKey = await this.apiKeyService.deactivateApiKey(id);
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }
    return {
      id: apiKey.id,
      isActive: apiKey.isActive,
      message: 'API key deactivated',
    };
  }
}
