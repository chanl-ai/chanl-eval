import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from './api-key.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check for @Public() decorator
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { method, url } = request;

    // Skip auth for health endpoint
    if (url === '/health' && method === 'GET') {
      return true;
    }

    if (process.env.CHANL_EVAL_REQUIRE_API_KEY !== 'true') {
      return true;
    }

    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      this.logger.warn(`Missing X-API-Key header for ${method} ${url}`);
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    const isValid = await this.apiKeyService.validateKey(apiKey);
    if (!isValid) {
      this.logger.warn(`Invalid API key for ${method} ${url}`);
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
