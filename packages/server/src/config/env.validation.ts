import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsNumberString,
  IsOptional,
  IsString,
  IsUrl,
  validateSync,
} from 'class-validator';

/**
 * Runtime configuration, validated once at boot.
 *
 * Reading `process.env` at each use site means nothing states what the application needs, nothing
 * checks it, and a malformed value surfaces later as a confusing runtime error far from its cause.
 * Declaring it here gives one place to look and fails the process immediately when something is
 * missing or wrong.
 */
export class EnvironmentVariables {
  @IsOptional()
  @IsNumberString({}, { message: 'PORT must be a number' })
  PORT?: string;

  @IsOptional()
  @IsString()
  MONGODB_URI?: string;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsOptional()
  @IsBooleanString({
    message: 'CHANL_EVAL_REQUIRE_API_KEY must be "true" or "false"',
  })
  CHANL_EVAL_REQUIRE_API_KEY?: string;

  @IsOptional()
  @IsString()
  CHANL_OPENAI_API_KEY?: string;

  @IsOptional()
  @IsString()
  CHANL_ANTHROPIC_API_KEY?: string;

  /** Conversations one server runs at the same time (default 5). */
  @IsOptional()
  @IsNumberString({}, { message: 'CHANL_EXECUTION_CONCURRENCY must be a number' })
  CHANL_EXECUTION_CONCURRENCY?: string;

  /** Conversations one server starts per minute (default 60). */
  @IsOptional()
  @IsNumberString({}, { message: 'CHANL_EXECUTION_MAX_PER_MINUTE must be a number' })
  CHANL_EXECUTION_MAX_PER_MINUTE?: string;

  @IsOptional()
  @IsUrl(
    { require_tld: false, require_protocol: true },
    {
      message:
        'CHANL_SIMULATION_BASE_URL must be a URL including protocol, e.g. http://localhost:11434/v1',
    },
  )
  CHANL_SIMULATION_BASE_URL?: string;
}

/**
 * Fails the process on malformed configuration rather than letting it start and misbehave.
 *
 * A mistyped simulation host is the motivating case: without this the server boots, every run
 * silently falls back to the provider's public endpoint, and the operator sees a bill instead of an
 * error.
 */
export function validateEnvironment(config: Record<string, unknown>) {
  const parsed = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
    excludeExtraneousValues: false,
  });

  const errors = validateSync(parsed, { skipMissingProperties: true });

  if (errors.length > 0) {
    const problems = errors
      .flatMap((e) => Object.values(e.constraints ?? {}))
      .map((m) => `  - ${m}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}\n`);
  }

  return parsed;
}

/** Defaults live with the declaration rather than scattered across `||` fallbacks at each read. */
export const CONFIG_DEFAULTS = {
  PORT: 18005,
  MONGODB_URI: 'mongodb://localhost:27217/chanl-eval',
  REDIS_URL: 'redis://localhost:6479',
} as const;
