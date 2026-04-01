import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ToolFixture, ToolFixtureSchema } from './schemas/tool-fixture.schema';
import { ToolFixtureService } from './tool-fixture.service';
import { ToolFixtureController } from './tool-fixture.controller';
import { MockResolver } from './mock-resolver.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ToolFixture.name, schema: ToolFixtureSchema },
    ]),
  ],
  controllers: [ToolFixtureController],
  providers: [ToolFixtureService, MockResolver],
  exports: [ToolFixtureService, MockResolver],
})
export class ToolFixtureModule {}
