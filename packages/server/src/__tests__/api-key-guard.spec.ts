import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ApiKeyService } from '../auth/api-key.service';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let apiKeyService: ApiKeyService;
  let reflector: Reflector;

  const prevRequire = process.env.CHANL_EVAL_REQUIRE_API_KEY;

  function createMockContext(
    url: string,
    method: string,
    headers: Record<string, string> = {},
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          url,
          method,
          headers,
        }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  }

  beforeEach(async () => {
    process.env.CHANL_EVAL_REQUIRE_API_KEY = 'true';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
        Reflector,
        {
          provide: ApiKeyService,
          useValue: {
            validateKey: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<ApiKeyGuard>(ApiKeyGuard);
    apiKeyService = module.get<ApiKeyService>(ApiKeyService);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    if (prevRequire === undefined) {
      delete process.env.CHANL_EVAL_REQUIRE_API_KEY;
    } else {
      process.env.CHANL_EVAL_REQUIRE_API_KEY = prevRequire;
    }
  });

  it('should allow health endpoint without auth', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const context = createMockContext('/health', 'GET');
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should reject requests without X-API-Key header', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const context = createMockContext('/api-keys', 'GET');
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should reject requests with invalid API key', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jest.spyOn(apiKeyService, 'validateKey').mockResolvedValue(false);
    const context = createMockContext('/api-keys', 'GET', {
      'x-api-key': 'bad-key',
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should allow requests with valid API key', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jest.spyOn(apiKeyService, 'validateKey').mockResolvedValue(true);
    const context = createMockContext('/api-keys', 'GET', {
      'x-api-key': 'eval_valid123',
    });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow public routes without auth', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const context = createMockContext('/api-keys', 'POST');
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow non-health routes when CHANL_EVAL_REQUIRE_API_KEY is not set', async () => {
    delete process.env.CHANL_EVAL_REQUIRE_API_KEY;
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const context = createMockContext('/personas', 'GET');
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });
});
