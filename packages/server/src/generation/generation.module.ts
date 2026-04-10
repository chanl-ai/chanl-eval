import { Module } from '@nestjs/common';
import { PersonaModule, ScenarioModule } from '@chanl/scenarios-core';
import { ScorecardsModule } from '@chanl/scorecards-core';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [ScenarioModule, PersonaModule, ScorecardsModule, SettingsModule],
  controllers: [GenerationController],
  providers: [GenerationService],
  exports: [GenerationService],
})
export class GenerationModule {}
