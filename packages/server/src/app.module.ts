import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { APP_GUARD } from '@nestjs/core';

// Core packages
import {
  PersonaModule,
  ScenarioModule,
  ToolFixtureModule,
  SIMULATION_CONFIG_PROVIDER,
} from '@chanl/scenarios-core';
import { SettingsModule } from './settings/settings.module';
import { SettingsService } from './settings/settings.service';
import { createSimulationConfigProvider } from './settings/simulation-config.factory';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScorecardsModule } from '@chanl/scorecards-core';

// Local modules
import { HealthModule } from './health/health.module';
import { ApiKeyModule } from './auth/api-key.module';
import { ApiKeyGuard } from './auth/api-key.guard';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { PromptsModule } from './prompts/prompts.module';
import { ChatModule } from './chat/chat.module';
import { DatasetModule } from './dataset/dataset.module';
import { GenerationModule } from './generation/generation.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
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
    ToolFixtureModule,
    ScorecardsModule,

    // Server modules
    HealthModule,
    ApiKeyModule,
    BootstrapModule,
    PromptsModule,
    SettingsModule,
    ChatModule,
    DatasetModule,
    GenerationModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    {
      // scenarios-core reads operator-configured credentials through this seam rather than
      // querying the settings collection itself, keeping the dependency direction one-way.
      provide: SIMULATION_CONFIG_PROVIDER,
      inject: [SettingsService, ConfigService],
      useFactory: createSimulationConfigProvider,
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
