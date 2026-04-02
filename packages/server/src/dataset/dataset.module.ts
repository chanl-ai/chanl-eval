import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ScenarioExecution,
  ScenarioExecutionSchema,
  Scenario,
  ScenarioSchema,
  Persona,
  PersonaSchema,
  ExecutionModule,
} from '@chanl/scenarios-core';
import { DatasetController } from './dataset.controller';
import { DatasetService } from './dataset.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScenarioExecution.name, schema: ScenarioExecutionSchema },
      { name: Scenario.name, schema: ScenarioSchema },
      { name: Persona.name, schema: PersonaSchema },
    ]),
    ExecutionModule,
  ],
  controllers: [DatasetController],
  providers: [DatasetService],
  exports: [DatasetService],
})
export class DatasetModule {}
