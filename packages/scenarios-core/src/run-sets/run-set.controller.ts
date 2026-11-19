import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RunSetService } from './run-set.service';
import { CreateRunSetDto, ListRunSetsQuery } from './dto/create-run-set.dto';

@Controller('run-sets')
export class RunSetController {
  constructor(private readonly runSets: RunSetService) {}

  @Post()
  create(@Body() dto: CreateRunSetDto) {
    return this.runSets.create(dto);
  }

  @Get()
  async list(@Query() query: ListRunSetsQuery) {
    const runSets = await this.runSets.list(query);
    return { runSets, total: runSets.length };
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.runSets.get(id);
  }

  @Post(':id/baseline')
  markBaseline(@Param('id') id: string) {
    return this.runSets.markBaseline(id);
  }

  @Get(':id/compare/:baselineId')
  compare(@Param('id') id: string, @Param('baselineId') baselineId: string) {
    return this.runSets.compare(id, baselineId);
  }
}

/** Aggregates one server's run sets for the room wall, which reads every seat. */
@Controller('stats')
export class RoomStatsController {
  constructor(private readonly runSets: RunSetService) {}

  @Get('room')
  room() {
    return this.runSets.roomStats();
  }
}
