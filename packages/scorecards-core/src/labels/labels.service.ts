import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HumanLabel, HumanLabelDocument } from '../schemas/human-label.schema';
import {
  ScorecardResult,
  ScorecardResultDocument,
  CriteriaResult,
} from '../schemas/scorecard-result.schema';
import { normalizeVerdict } from '../verdict';
import {
  AgreementStats,
  OverallAgreement,
  Pair,
  agreementFor,
  confidenceCalibration,
  overallAgreement,
} from './agreement';

export interface CreateLabelInput {
  scorecardResultId: string;
  criteriaId: string;
  humanResult: boolean | number;
  labeledBy?: string;
  note?: string;
}

export interface CriterionAgreement extends AgreementStats {
  criteriaKey: string;
  criteriaName?: string;
  evaluationType: string;
}

export interface AgreementReport {
  overall: OverallAgreement;
  byCriterion: CriterionAgreement[];
  calibration: ReturnType<typeof confidenceCalibration>;
  /** Labels where the human and the judge disagreed, newest first. The work queue. */
  disagreements: Array<{
    id: string;
    criteriaKey: string;
    criteriaName?: string;
    scorecardResultId: string;
    scenarioExecutionId?: string;
    humanResult: boolean | number;
    judgeResult?: boolean | number;
    judgeConfidence?: number;
    judgeReasoning?: string;
    note?: string;
    labeledBy: string;
    createdAt?: Date;
  }>;
}

@Injectable()
export class LabelsService {
  private readonly logger = new Logger(LabelsService.name);

  constructor(
    @InjectModel(HumanLabel.name)
    private readonly labelModel: Model<HumanLabelDocument>,
    @InjectModel(ScorecardResult.name)
    private readonly resultModel: Model<ScorecardResultDocument>,
  ) {}

  /**
   * Record (or correct) a human verdict. Snapshots the judge's verdict from the result document so
   * the pair stays intact even if the run is re-evaluated later.
   */
  async upsert(input: CreateLabelInput): Promise<HumanLabelDocument> {
    const result = await this.resultModel.findById(input.scorecardResultId);
    if (!result) {
      throw new NotFoundException(
        `Scorecard result ${input.scorecardResultId} not found`,
      );
    }

    const criterion = (result.criteriaResults || []).find(
      (c: CriteriaResult) => c.criteriaId === input.criteriaId,
    );
    if (!criterion) {
      throw new NotFoundException(
        `Criterion ${input.criteriaId} is not part of result ${input.scorecardResultId}`,
      );
    }

    const normalizedJudge = normalizeVerdict(criterion.result);
    const evaluationType = typeof normalizedJudge === 'number' ? 'score' : 'boolean';
    const humanResult = normalizeHumanResult(input.humanResult, evaluationType);
    const humanPassed =
      evaluationType === 'score'
        ? Number(humanResult) >= 7
        : Boolean(humanResult);

    const labeledBy = (input.labeledBy || 'anonymous').trim() || 'anonymous';
    const agreed = verdictsAgree(humanResult, criterion.result, evaluationType);

    const doc = await this.labelModel.findOneAndUpdate(
      {
        scorecardResultId: input.scorecardResultId,
        criteriaId: input.criteriaId,
        labeledBy,
      },
      {
        $set: {
          scorecardResultId: input.scorecardResultId,
          scenarioExecutionId: result.scenarioExecutionId,
          scorecardId: result.scorecardId?.toString(),
          criteriaId: input.criteriaId,
          criteriaKey: criterion.criteriaKey,
          criteriaName: criterion.criteriaName,
          evaluationType,
          humanResult,
          humanPassed,
          note: input.note,
          labeledBy,
          judgeResult: criterion.result,
          judgePassed: criterion.passed,
          judgeConfidence: criterion.confidence,
          judgeReasoning: criterion.reasoning,
          agreed,
        },
      },
      { new: true, upsert: true, runValidators: true },
    );

    this.logger.log(
      `Label ${agreed ? 'agrees with' : 'DISAGREES with'} judge on ${criterion.criteriaKey} (result ${input.scorecardResultId})`,
    );
    return doc!;
  }

  async listForResult(scorecardResultId: string): Promise<HumanLabelDocument[]> {
    return this.labelModel.find({ scorecardResultId }).sort({ createdAt: -1 });
  }

  async delete(id: string): Promise<void> {
    const res = await this.labelModel.findByIdAndDelete(id);
    if (!res) throw new NotFoundException(`Label ${id} not found`);
  }

  /**
   * Judge-vs-human agreement across every label, optionally scoped.
   *
   * This is the number that says whether the LLM judge can be trusted. Without it, a scorecard is a
   * confident-looking number nobody has checked.
   */
  async agreement(filters?: {
    scorecardId?: string;
    criteriaKey?: string;
    labeledBy?: string;
    limitDisagreements?: number;
  }): Promise<AgreementReport> {
    const query: Record<string, any> = {};
    if (filters?.scorecardId) query.scorecardId = filters.scorecardId;
    if (filters?.criteriaKey) query.criteriaKey = filters.criteriaKey;
    if (filters?.labeledBy) query.labeledBy = filters.labeledBy;

    const labels = await this.labelModel.find(query).sort({ createdAt: -1 });

    const usable = labels.filter(
      (l) => l.judgeResult !== undefined && l.judgeResult !== null,
    );

    const toPair = (l: HumanLabelDocument): Pair => ({
      human: l.humanResult,
      judge: l.judgeResult as boolean | number,
      judgeConfidence: l.judgeConfidence,
    });

    // Group by criterion — an aggregate kappa across criteria of different types would be
    // meaningless, and per-criterion is the actionable view anyway: it names which rubric line the
    // judge cannot read.
    const groups = new Map<string, HumanLabelDocument[]>();
    for (const l of usable) {
      const list = groups.get(l.criteriaKey) || [];
      list.push(l);
      groups.set(l.criteriaKey, list);
    }

    const byCriterion: CriterionAgreement[] = [...groups.entries()]
      .map(([criteriaKey, group]) => ({
        criteriaKey,
        criteriaName: group[0].criteriaName,
        evaluationType: group[0].evaluationType,
        ...agreementFor(group.map(toPair)),
      }))
      .sort((a, b) => {
        // Worst agreement first — the point of the page is to find the untrustworthy criteria.
        const ak = a.kappa ?? Number.POSITIVE_INFINITY;
        const bk = b.kappa ?? Number.POSITIVE_INFINITY;
        return ak - bk;
      });

    const allPairs = usable.map(toPair);
    const limit = filters?.limitDisagreements ?? 50;

    return {
      overall: overallAgreement(allPairs),
      byCriterion,
      calibration: confidenceCalibration(allPairs),
      disagreements: usable
        .filter((l) => !l.agreed)
        .slice(0, limit)
        .map((l) => ({
          id: l._id!.toString(),
          criteriaKey: l.criteriaKey,
          criteriaName: l.criteriaName,
          scorecardResultId: l.scorecardResultId,
          scenarioExecutionId: l.scenarioExecutionId,
          humanResult: l.humanResult,
          judgeResult: l.judgeResult,
          judgeConfidence: l.judgeConfidence,
          judgeReasoning: l.judgeReasoning,
          note: l.note,
          labeledBy: l.labeledBy,
          createdAt: l.createdAt,
        })),
    };
  }
}

function normalizeHumanResult(
  value: boolean | number,
  evaluationType: string,
): boolean | number {
  if (evaluationType === 'score') {
    const n = Number(value);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(10, n));
  }
  return Boolean(value);
}

/**
 * For scores, "agreed" means within 1 point. An 8-vs-9 split is not a judge failure worth putting in
 * a review queue; treating it as one would bury the 2-vs-9 cases that actually matter.
 */
function verdictsAgree(
  human: boolean | number,
  judge: any,
  evaluationType: string,
): boolean {
  const normalized = normalizeVerdict(judge);
  if (normalized === null) return false;
  if (evaluationType === 'score') {
    return Math.abs(Number(human) - Number(normalized)) <= 1;
  }
  return Boolean(human) === normalized;
}
