import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScorecardsModule } from '@chanl/scorecards-core';
import { Scenario, ScenarioSchema } from './schemas/scenario.schema';
import {
  ScenarioExecution,
  ScenarioExecutionSchema,
} from './schemas/scenario-execution.schema';
import { ScenarioService } from './services/scenario.service';
import { ScenarioExecutionService } from './services/scenario-execution.service';
import { ScenarioController } from './controllers/scenario.controller';
import { ScenarioExecutionController } from './controllers/scenario-execution.controller';
import { PersonaModule } from '../personas/persona.module';
import { ExecutionModule } from '../execution/execution.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Scenario.name, schema: ScenarioSchema },
      { name: ScenarioExecution.name, schema: ScenarioExecutionSchema },
    ]),
    forwardRef(() => PersonaModule),
    ExecutionModule,
    ScorecardsModule,
  ],
  // IMPORTANT: ExecutionController MUST come first for route ordering
  // /scenarios/executions must be matched before /scenarios/:id
  controllers: [ScenarioExecutionController, ScenarioController],
  providers: [ScenarioService, ScenarioExecutionService],
  exports: [ScenarioService, ScenarioExecutionService],
})
export class ScenarioModule {}
