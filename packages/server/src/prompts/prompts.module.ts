import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Prompt, PromptSchema } from './prompt.schema';
import { PromptsService } from './prompts.service';
import { PromptsController } from './prompts.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Prompt.name, schema: PromptSchema }]),
  ],
  controllers: [PromptsController],
  providers: [PromptsService],
  exports: [PromptsService],
})
export class PromptsModule {}
