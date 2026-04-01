import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { APP_GUARD } from '@nestjs/core';

// Core packages
import { PersonaModule, ScenarioModule } from '@chanl/scenarios-core';
import { ScorecardsModule } from '@chanl/scorecards-core';

// Local modules
import { HealthModule } from './health/health.module';
import { ApiKeyModule } from './auth/api-key.module';
import { ApiKeyGuard } from './auth/api-key.guard';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { PromptsModule } from './prompts/prompts.module';

@Module({
  imports: [
    // Infrastructure
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27217/chanl-eval',
    ),
    BullModule.forRoot({
      redis: parseRedisUrl(
        process.env.REDIS_URL || 'redis://localhost:6479',
      ),
    }),

    // Core packages
    PersonaModule,
    ScenarioModule,
    ScorecardsModule,

    // Server modules
    HealthModule,
    ApiKeyModule,
    BootstrapModule,
    PromptsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}

/**
 * Parse a Redis URL into host/port/password config for BullModule.
 */
function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port, 10) || 6379,
      ...(parsed.password ? { password: parsed.password } : {}),
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}
