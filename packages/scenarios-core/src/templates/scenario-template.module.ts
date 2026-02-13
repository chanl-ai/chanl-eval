import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScenarioTemplateController } from './scenario-template.controller';
import { ScenarioTemplateService } from './scenario-template.service';
import {
  ScenarioTemplate,
  ScenarioTemplateSchema,
} from './schemas/scenario-template.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScenarioTemplate.name, schema: ScenarioTemplateSchema },
    ]),
  ],
  controllers: [ScenarioTemplateController],
  providers: [ScenarioTemplateService],
  exports: [ScenarioTemplateService],
})
export class ScenarioTemplateModule {}
