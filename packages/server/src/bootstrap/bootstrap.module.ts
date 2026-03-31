import { Module } from '@nestjs/common';
import { PersonaModule, ScenarioModule } from '@chanl/scenarios-core';
import { ScorecardsModule } from '@chanl/scorecards-core';
import { ApiKeyModule } from '../auth/api-key.module';
import { BootstrapService } from './bootstrap.service';

@Module({
  imports: [PersonaModule, ScenarioModule, ScorecardsModule, ApiKeyModule],
  providers: [BootstrapService],
  exports: [BootstrapService],
})
export class BootstrapModule {}
