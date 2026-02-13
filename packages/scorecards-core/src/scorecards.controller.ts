import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ScorecardsService } from './scorecards.service';
import { CreateScorecardDto } from './dto/create-scorecard.dto';
import { UpdateScorecardDto } from './dto/update-scorecard.dto';
import { CreateScorecardCategoryDto } from './dto/create-scorecard-category.dto';
import { UpdateScorecardCategoryDto } from './dto/update-scorecard-category.dto';
import { CreateScorecardCriteriaDto } from './dto/create-scorecard-criteria.dto';
import { UpdateScorecardCriteriaDto } from './dto/update-scorecard-criteria.dto';
import { CreateScorecardResultDto } from './dto/create-scorecard-result.dto';

@Controller('scorecards')
export class ScorecardsController {
  constructor(private readonly scorecardsService: ScorecardsService) {}

  // ============================================================================
  // SCORECARD ROUTES
  // ============================================================================

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createScorecard(@Body() dto: CreateScorecardDto) {
    const scorecard = await this.scorecardsService.createScorecard(dto);
    return { scorecard };
  }

  @Get()
  async findAllScorecards(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const result = await this.scorecardsService.findAllScorecards({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
    });
    return {
      scorecards: result.data,
      total: result.pagination.total,
      pagination: result.pagination,
    };
  }

  @Get('default')
  async getDefault() {
    const result = await this.scorecardsService.getDefault();
    if (!result) {
      throw new NotFoundException('No active scorecards found');
    }
    return {
      data: {
        scorecard: result.scorecard,
        source: result.source,
      },
    };
  }

  @Get(':id')
  async findScorecardById(@Param('id') id: string) {
    const scorecard = await this.scorecardsService.findScorecardById(id);
    if (!scorecard) {
      throw new NotFoundException(`Scorecard ${id} not found`);
    }
    return { scorecard };
  }

  @Put(':id')
  async updateScorecard(
    @Param('id') id: string,
    @Body() dto: UpdateScorecardDto,
  ) {
    const scorecard = await this.scorecardsService.updateScorecard(id, dto);
    if (!scorecard) {
      throw new NotFoundException(`Scorecard ${id} not found`);
    }
    return { scorecard };
  }

  @Delete(':id')
  async deleteScorecard(@Param('id') id: string) {
    const deleted = await this.scorecardsService.deleteScorecard(id);
    if (!deleted) {
      throw new NotFoundException(`Scorecard ${id} not found`);
    }
    return { deleted: true };
  }

  // ============================================================================
  // CATEGORY ROUTES
  // ============================================================================

  @Post(':scorecardId/categories')
  @HttpCode(HttpStatus.CREATED)
  async createCategory(
    @Param('scorecardId') scorecardId: string,
    @Body() dto: CreateScorecardCategoryDto,
  ) {
    const category = await this.scorecardsService.createCategory(
      scorecardId,
      dto,
    );
    return { category };
  }

  @Get(':scorecardId/categories')
  async findCategoriesByScorecard(
    @Param('scorecardId') scorecardId: string,
  ) {
    const categories =
      await this.scorecardsService.findCategoriesByScorecard(scorecardId);
    return { categories, total: categories.length };
  }

  @Get(':scorecardId/categories/:categoryId')
  async findCategoryById(
    @Param('scorecardId') scorecardId: string,
    @Param('categoryId') categoryId: string,
  ) {
    const category =
      await this.scorecardsService.findCategoryById(categoryId);
    if (!category) {
      throw new NotFoundException(`Category ${categoryId} not found`);
    }
    return { category };
  }

  @Put(':scorecardId/categories/:categoryId')
  async updateCategory(
    @Param('scorecardId') scorecardId: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateScorecardCategoryDto,
  ) {
    const category = await this.scorecardsService.updateCategory(
      categoryId,
      dto,
    );
    if (!category) {
      throw new NotFoundException(`Category ${categoryId} not found`);
    }
    return { category };
  }

  @Delete(':scorecardId/categories/:categoryId')
  async deleteCategory(
    @Param('scorecardId') scorecardId: string,
    @Param('categoryId') categoryId: string,
  ) {
    const deleted =
      await this.scorecardsService.deleteCategory(categoryId);
    if (!deleted) {
      throw new NotFoundException(`Category ${categoryId} not found`);
    }
    return { deleted: true };
  }

  // ============================================================================
  // CRITERIA ROUTES
  // ============================================================================

  @Post(':scorecardId/criteria')
  @HttpCode(HttpStatus.CREATED)
  async createCriteria(
    @Param('scorecardId') scorecardId: string,
    @Body() dto: CreateScorecardCriteriaDto,
  ) {
    const criterion = await this.scorecardsService.createCriteria(
      scorecardId,
      dto.categoryId,
      dto,
    );
    return { criterion };
  }

  @Get(':scorecardId/criteria')
  async findCriteriaByScorecard(
    @Param('scorecardId') scorecardId: string,
  ) {
    const criteria =
      await this.scorecardsService.findCriteriaByScorecard(scorecardId);
    return { criteria, total: criteria.length };
  }

  @Get(':scorecardId/criteria/:criteriaId')
  async findCriteriaById(
    @Param('scorecardId') scorecardId: string,
    @Param('criteriaId') criteriaId: string,
  ) {
    const criterion =
      await this.scorecardsService.findCriteriaById(criteriaId);
    if (!criterion) {
      throw new NotFoundException(`Criterion ${criteriaId} not found`);
    }
    return { criterion };
  }

  @Put(':scorecardId/criteria/:criteriaId')
  async updateCriteria(
    @Param('scorecardId') scorecardId: string,
    @Param('criteriaId') criteriaId: string,
    @Body() dto: UpdateScorecardCriteriaDto,
  ) {
    const criterion = await this.scorecardsService.updateCriteria(
      criteriaId,
      dto,
    );
    if (!criterion) {
      throw new NotFoundException(`Criterion ${criteriaId} not found`);
    }
    return { criterion };
  }

  @Delete(':scorecardId/criteria/:criteriaId')
  async deleteCriteria(
    @Param('scorecardId') scorecardId: string,
    @Param('criteriaId') criteriaId: string,
  ) {
    const deleted =
      await this.scorecardsService.deleteCriteria(criteriaId);
    if (!deleted) {
      throw new NotFoundException(`Criterion ${criteriaId} not found`);
    }
    return { deleted: true };
  }

  // ============================================================================
  // RESULT ROUTES
  // ============================================================================

  @Post('results')
  @HttpCode(HttpStatus.CREATED)
  async createResult(@Body() dto: CreateScorecardResultDto) {
    const result = await this.scorecardsService.createResult(dto);
    return { result };
  }

  @Get('results/list')
  async findAllResults(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('scorecardId') scorecardId?: string,
    @Query('status') status?: string,
  ) {
    const result = await this.scorecardsService.findAllResults({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      scorecardId,
      status,
    });
    return {
      results: result.data,
      total: result.pagination.total,
      pagination: result.pagination,
    };
  }

  @Get('results/by-call/:callId')
  async findResultsByCall(@Param('callId') callId: string) {
    const results =
      await this.scorecardsService.findResultsByCall(callId);
    return { results, total: results.length };
  }

  @Get('results/:resultId')
  async findResultById(@Param('resultId') resultId: string) {
    const result =
      await this.scorecardsService.findResultById(resultId);
    if (!result) {
      throw new NotFoundException(`Result ${resultId} not found`);
    }
    return { result };
  }

  @Delete('results/:resultId')
  async deleteResult(@Param('resultId') resultId: string) {
    const deleted =
      await this.scorecardsService.deleteResult(resultId);
    if (!deleted) {
      throw new NotFoundException(`Result ${resultId} not found`);
    }
    return { deleted: true };
  }
}
