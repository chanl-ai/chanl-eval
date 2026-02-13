import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Scorecard,
  ScorecardDocument,
  ScorecardCategory,
  ScorecardCategoryDocument,
  ScorecardCriteria,
  ScorecardCriteriaDocument,
  ScorecardResult,
  ScorecardResultDocument,
  CriteriaResult,
  getEvaluationType,
} from '../schemas';
import {
  CriteriaHandlerRegistry,
  EvaluationContext,
  normalizeScore,
} from '../handlers';

export interface EvaluateOptions {
  workspaceId?: string;
  callId?: string;
  agentId?: string;
  userId?: string;
  scenarioExecutionId?: string;
}

export interface EvaluationResult {
  resultId: string;
  scorecardId: string;
  overallScore: number;
  categoryScores: Record<string, number>;
  criteriaResults: CriteriaResult[];
  status: string;
  passed: boolean;
}

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    @InjectModel(Scorecard.name)
    private readonly scorecardModel: Model<ScorecardDocument>,
    @InjectModel(ScorecardCategory.name)
    private readonly categoryModel: Model<ScorecardCategoryDocument>,
    @InjectModel(ScorecardCriteria.name)
    private readonly criteriaModel: Model<ScorecardCriteriaDocument>,
    @InjectModel(ScorecardResult.name)
    private readonly resultModel: Model<ScorecardResultDocument>,
    private readonly handlerRegistry: CriteriaHandlerRegistry,
  ) {}

  /**
   * Evaluate a transcript against a scorecard.
   */
  async evaluate(
    scorecardId: string,
    context: EvaluationContext,
    options: EvaluateOptions = {},
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    // 1. Load scorecard
    const scorecard = await this.scorecardModel.findById(scorecardId);
    if (!scorecard) {
      throw new Error(`Scorecard ${scorecardId} not found`);
    }

    // 2. Load categories and active criteria
    const objectId = new Types.ObjectId(scorecardId);
    const categories = await this.categoryModel
      .find({ scorecardId: objectId })
      .sort({ order: 1 });

    const allCriteria = await this.criteriaModel
      .find({ scorecardId: objectId, isActive: true });

    if (allCriteria.length === 0) {
      throw new Error(`Scorecard ${scorecardId} has no active criteria`);
    }

    // 3. Create result record with status='processing'
    const result = await this.resultModel.create({
      workspaceId: options.workspaceId,
      scorecardId,
      callId: options.callId,
      agentId: options.agentId,
      userId: options.userId,
      scenarioExecutionId: options.scenarioExecutionId,
      status: 'processing',
      criteriaResults: [],
      categoryScores: {},
    });

    try {
      // 4. Evaluate each criterion
      const criteriaResults: CriteriaResult[] = [];

      for (const criterion of allCriteria) {
        const handler = this.handlerRegistry.get(criterion.type);
        if (!handler) {
          this.logger.warn(
            `No handler for criteria type: ${criterion.type}, skipping ${criterion.key}`,
          );
          continue;
        }

        const category = categories.find(
          (c) => c._id?.toString() === criterion.categoryId?.toString(),
        );

        try {
          const handlerResult = await handler.evaluate(criterion, context);

          criteriaResults.push({
            criteriaId: criterion._id?.toString() || '',
            criteriaKey: criterion.key,
            criteriaVersion: criterion.version,
            categoryId: criterion.categoryId?.toString() || '',
            categoryVersion: category?.version || 1,
            categoryName: category?.name,
            criteriaName: criterion.name,
            result: handlerResult.result,
            passed: handlerResult.passed,
            reasoning: handlerResult.reasoning,
            evidence: handlerResult.evidence,
          });
        } catch (error: any) {
          this.logger.error(
            `Error evaluating ${criterion.key}: ${error.message}`,
          );
          criteriaResults.push({
            criteriaId: criterion._id?.toString() || '',
            criteriaKey: criterion.key,
            criteriaVersion: criterion.version,
            categoryId: criterion.categoryId?.toString() || '',
            categoryVersion: category?.version || 1,
            categoryName: category?.name,
            criteriaName: criterion.name,
            result: null,
            passed: false,
            reasoning: `Evaluation error: ${error.message}`,
            evidence: [],
          });
        }
      }

      // 5. Calculate category scores (average of normalized criteria scores in each category)
      const categoryScores: Record<string, number> = {};
      for (const category of categories) {
        const categoryId = category._id?.toString() || '';
        const categoryCriteria = criteriaResults.filter(
          (cr) => cr.categoryId === categoryId,
        );

        if (categoryCriteria.length === 0) continue;

        const normalizedScores = categoryCriteria.map((cr) => {
          const criterion = allCriteria.find(
            (c) => c._id?.toString() === cr.criteriaId,
          );
          if (!criterion) return 0;
          return normalizeScore(cr.result, criterion, cr.passed);
        });

        const avgScore =
          normalizedScores.reduce((sum, s) => sum + s, 0) /
          normalizedScores.length;

        categoryScores[category.name] = Math.round(avgScore * 100) / 100;
      }

      // 6. Calculate overall score based on scoring algorithm
      const overallScore = this.calculateOverallScore(
        scorecard.scoringAlgorithm,
        categoryScores,
        categories,
        criteriaResults,
      );

      // 7. Determine pass/fail
      const passed =
        overallScore >= (scorecard.passingThreshold / 100) * 10;

      // 8. Update result
      const processingTime = Date.now() - startTime;

      await this.resultModel.findByIdAndUpdate(result._id, {
        status: 'completed',
        overallScore,
        categoryScores,
        criteriaResults,
        analysisMetadata: {
          analysisType: 'automatic',
          triggeredBy: options.scenarioExecutionId ? 'scenario' : 'endpoint',
          processingTime,
          transcriptLength: context.transcriptText.length,
          criteriaCount: allCriteria.length,
          autoScored: true,
          scorecardVersion: String(scorecard.__v || 1),
          analysisTimestamp: new Date(),
        },
      });

      return {
        resultId: result._id?.toString() || '',
        scorecardId,
        overallScore,
        categoryScores,
        criteriaResults,
        status: 'completed',
        passed,
      };
    } catch (error: any) {
      this.logger.error(`Evaluation failed: ${error.message}`, error.stack);
      await this.resultModel.findByIdAndUpdate(result._id, {
        status: 'failed',
        errorMessage: error.message,
      });

      return {
        resultId: result._id?.toString() || '',
        scorecardId,
        overallScore: 0,
        categoryScores: {},
        criteriaResults: [],
        status: 'failed',
        passed: false,
      };
    }
  }

  /**
   * Calculate overall score based on the scorecard's scoring algorithm.
   */
  private calculateOverallScore(
    algorithm: string,
    categoryScores: Record<string, number>,
    categories: ScorecardCategoryDocument[],
    criteriaResults: CriteriaResult[],
  ): number {
    const categoryNames = Object.keys(categoryScores);
    if (categoryNames.length === 0) return 0;

    switch (algorithm) {
      case 'weighted_average': {
        let totalWeight = 0;
        let weightedSum = 0;

        for (const category of categories) {
          const score = categoryScores[category.name];
          if (score !== undefined) {
            weightedSum += score * category.weight;
            totalWeight += category.weight;
          }
        }

        return totalWeight > 0
          ? Math.round((weightedSum / totalWeight) * 100) / 100
          : 0;
      }

      case 'simple_average': {
        const scores = Object.values(categoryScores);
        const sum = scores.reduce((a, b) => a + b, 0);
        return Math.round((sum / scores.length) * 100) / 100;
      }

      case 'minimum_all': {
        const allPassed = criteriaResults.every((cr) => cr.passed);
        return allPassed ? 10 : 0;
      }

      case 'pass_fail': {
        const scores = Object.values(categoryScores);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return Math.round(avg * 100) / 100;
      }

      default:
        return 0;
    }
  }
}
