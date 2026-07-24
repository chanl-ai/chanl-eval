import { Module } from '@nestjs/common';
import { PersonaModule, ScenarioModule } from '@chanl/scenarios-core';
import { ScorecardsModule } from '@chanl/scorecards-core';
import { ApiKeyModule } from '../auth/api-key.module';
import { PromptsModule } from '../prompts/prompts.module';
import { BootstrapService } from './bootstrap.service';

@Module({
  imports: [
    PersonaModule,
    ScenarioModule,
    ScorecardsModule,
    ApiKeyModule,
    PromptsModule,
  ],
  providers: [BootstrapService],
  exports: [BootstrapService],
})
export class BootstrapModule {}
