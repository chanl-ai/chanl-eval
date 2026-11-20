import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScorecardsModule } from '@chanl/scorecards-core';
import { RunSet, RunSetSchema } from './schemas/run-set.schema';
import {
  ScenarioExecution,
  ScenarioExecutionSchema,
} from '../scenarios/schemas/scenario-execution.schema';
import { Persona, PersonaSchema } from '../personas/schemas/persona.schema';
import { Scenario, ScenarioSchema } from '../scenarios/schemas/scenario.schema';
import { ToolFixtureModule } from '../tool-fixtures/tool-fixture.module';
import { ScenarioModule } from '../scenarios/scenario.module';
import { RunSetService } from './run-set.service';
import { RoomStatsController, RunSetController } from './run-set.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RunSet.name, schema: RunSetSchema },
      { name: ScenarioExecution.name, schema: ScenarioExecutionSchema },
      { name: Persona.name, schema: PersonaSchema },
      { name: Scenario.name, schema: ScenarioSchema },
    ]),
    ScenarioModule,
    ScorecardsModule,
    ToolFixtureModule,
  ],
  controllers: [RunSetController, RoomStatsController],
  providers: [RunSetService],
  exports: [RunSetService],
})
export class RunSetModule {}
