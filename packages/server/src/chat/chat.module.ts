import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ScenarioExecution,
  ScenarioExecutionSchema,
  ToolFixtureModule,
  AgentConfigResolver,
} from '@chanl/scenarios-core';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { PromptsModule } from '../prompts/prompts.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScenarioExecution.name, schema: ScenarioExecutionSchema },
    ]),
    PromptsModule,
    SettingsModule,
    ToolFixtureModule,
  ],
  controllers: [ChatController],
  providers: [AgentConfigResolver, ChatService],
  exports: [ChatService],
})
export class ChatModule {}
