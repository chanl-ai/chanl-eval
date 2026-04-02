import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MongooseModule } from '@nestjs/mongoose';
import { ScorecardsModule } from '@chanl/scorecards-core';
import {
  Scenario,
  ScenarioSchema,
} from '../scenarios/schemas/scenario.schema';
import {
  ScenarioExecution,
  ScenarioExecutionSchema,
} from '../scenarios/schemas/scenario-execution.schema';
import {
  Persona,
  PersonaSchema,
} from '../personas/schemas/persona.schema';
import { ToolFixtureModule } from '../tool-fixtures/tool-fixture.module';
import { AdapterRegistry } from '../adapters/adapter-registry';
import { PersonaSimulatorService } from '../simulator/persona-simulator.service';
import { PersonaStrategyRegistry } from './persona-strategy-registry';
import { QueueProducerService } from './queue-producer.service';
import { ExecutionProcessor } from './execution-processor';
import { ExecutionService } from './execution.service';
import { AgentConfigResolver } from './agent-config-resolver';
import { QUEUE_NAMES, defaultJobOptions } from './queues.config';

@Module({
  imports: [
    ScorecardsModule,
    ToolFixtureModule,
    MongooseModule.forFeature([
      { name: Scenario.name, schema: ScenarioSchema },
      { name: ScenarioExecution.name, schema: ScenarioExecutionSchema },
      { name: Persona.name, schema: PersonaSchema },
    ]),
    BullModule.registerQueue({
      name: QUEUE_NAMES.SCENARIO_EXECUTION,
      defaultJobOptions,
    }),
  ],
  providers: [
    AdapterRegistry,
    AgentConfigResolver,
    PersonaSimulatorService,
    PersonaStrategyRegistry,
    QueueProducerService,
    ExecutionProcessor,
    ExecutionService,
  ],
  exports: [ExecutionService, QueueProducerService, AdapterRegistry, AgentConfigResolver, PersonaStrategyRegistry],
})
export class ExecutionModule {}
