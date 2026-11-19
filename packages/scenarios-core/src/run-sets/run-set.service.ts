import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ScorecardsService } from '@chanl/scorecards-core';
import { RunSet, RunSetDocument } from './schemas/run-set.schema';
import { CreateRunSetDto, ListRunSetsQuery } from './dto/create-run-set.dto';
import {
  ScenarioExecution,
  ScenarioExecutionDocument,
} from '../scenarios/schemas/scenario-execution.schema';
import { Persona, PersonaDocument } from '../personas/schemas/persona.schema';
import { ScenarioExecutionService } from '../scenarios/services/scenario-execution.service';
import {
  RunInput,
  RunSetComparison,
  RunSetSummary,
  compareRunSets,
  summarizeRunSet,
} from './run-set-summary';

export type RunSetView = {
  id: string;
  kind: string;
  scenarioId: string;
  promptId: string;
  personaIds: string[];
  k: number;
  isBaseline: boolean;
  baselineRunSetId?: string;
  createdAt?: Date;
} & RunSetSummary;

export interface RoomStats {
  runsLast10Min: number;
  topFailingChecks: Array<{ name: string; failed: number; total: number }>;
  redteamBroken: Array<{ personaName: string; count: number }>;
}

const DEFAULT_K = 5;

@Injectable()
export class RunSetService {
  constructor(
    @InjectModel(RunSet.name) private readonly runSetModel: Model<RunSetDocument>,
    @InjectModel(ScenarioExecution.name)
    private readonly executionModel: Model<ScenarioExecutionDocument>,
    @InjectModel(Persona.name) private readonly personaModel: Model<PersonaDocument>,
    private readonly executionService: ScenarioExecutionService,
    private readonly scorecardsService: ScorecardsService,
  ) {}

  /** Queues k executions per persona through the same path as POST /scenarios/:id/execute. */
  async create(dto: CreateRunSetDto): Promise<{ id: string; executionIds: string[] }> {
    const k = dto.k ?? DEFAULT_K;
    for (const id of [dto.scenarioId, dto.promptId, ...dto.personaIds]) {
      if (!Types.ObjectId.isValid(id)) throw new BadRequestException(`Invalid id: ${id}`);
    }
    const runSet = await this.runSetModel.create({
      kind: dto.kind,
      scenarioId: dto.scenarioId,
      promptId: dto.promptId,
      personaIds: dto.personaIds,
      scorecardId: dto.scorecardId,
      toolFixtureIds: dto.toolFixtureIds || [],
      k,
      baselineRunSetId: dto.baselineRunSetId,
      isBaseline: false,
      executionIds: [],
    });
    const runSetId = runSet._id!.toString();

    const executionIds: string[] = [];
    for (const personaId of dto.personaIds) {
      for (let i = 0; i < k; i++) {
        const execution = await this.executionService.execute(
          dto.scenarioId,
          {
            promptId: dto.promptId,
            personaId,
            scorecardId: dto.scorecardId,
            toolFixtureIds: dto.toolFixtureIds,
          },
          { runSetId },
        );
        executionIds.push(execution.executionId);
      }
    }
    await this.runSetModel.findByIdAndUpdate(runSetId, { $set: { executionIds } });
    return { id: runSetId, executionIds };
  }

  async list(query: ListRunSetsQuery): Promise<RunSetView[]> {
    const filter: Record<string, unknown> = {};
    if (query.scenarioId) filter.scenarioId = query.scenarioId;
    if (query.promptId) filter.promptId = query.promptId;
    if (query.kind) filter.kind = query.kind;
    const sets = await this.runSetModel.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    return Promise.all(sets.map((s) => this.view(s as RunSet)));
  }

  async get(id: string): Promise<RunSetView> {
    return this.view(await this.load(id));
  }

  /** Marks this set the baseline for its scenario and persona set, unmarking the previous one. */
  async markBaseline(id: string): Promise<RunSetView> {
    const runSet = await this.load(id);
    const key = personaKey(runSet.personaIds);
    const siblings = await this.runSetModel
      .find({ scenarioId: runSet.scenarioId, isBaseline: true })
      .lean();
    const toUnmark = siblings
      .filter((s) => personaKey(s.personaIds) === key)
      .map((s) => s._id);
    if (toUnmark.length) {
      await this.runSetModel.updateMany({ _id: { $in: toUnmark } }, { $set: { isBaseline: false } });
    }
    await this.runSetModel.findByIdAndUpdate(id, { $set: { isBaseline: true } });
    return this.get(id);
  }

  async compare(id: string, baselineId: string): Promise<RunSetComparison> {
    const [after, before] = await Promise.all([this.load(id), this.load(baselineId)]);
    const [afterRuns, beforeRuns] = await Promise.all([
      this.loadRuns(after.executionIds),
      this.loadRuns(before.executionIds),
    ]);
    return compareRunSets({ k: before.k, runs: beforeRuns }, { k: after.k, runs: afterRuns });
  }

  async roomStats(now = new Date()): Promise<RoomStats> {
    const since = new Date(now.getTime() - 10 * 60 * 1000);
    const runsLast10Min = await this.executionModel.countDocuments({
      runSetId: { $exists: true },
      createdAt: { $gte: since },
    });

    const sets = await this.runSetModel.find({}).lean();
    const allRuns = await this.loadRuns(sets.flatMap((s) => s.executionIds));
    const byExecution = new Map(allRuns.map((r) => [r.executionId, r]));

    const checkCounts = new Map<string, { name: string; failed: number; total: number }>();
    for (const run of allRuns) {
      for (const c of run.result?.criteriaResults || []) {
        if (c.notApplicable) continue;
        const entry = checkCounts.get(c.criteriaKey) || {
          name: c.criteriaName || c.criteriaKey,
          failed: 0,
          total: 0,
        };
        entry.total++;
        if (!c.passed) entry.failed++;
        checkCounts.set(c.criteriaKey, entry);
      }
    }
    const topFailingChecks = [...checkCounts.values()]
      .filter((c) => c.failed > 0)
      .sort((a, b) => b.failed - a.failed)
      .slice(0, 5);

    const redteamSets = sets.filter((s) => s.kind === 'redteam');
    const names = await this.personaNames(redteamSets.flatMap((s) => s.personaIds));
    const broken = new Map<string, number>();
    for (const set of redteamSets) {
      const summary = summarizeRunSet(
        set.personaIds,
        set.executionIds.map((e) => byExecution.get(e)).filter((r): r is RunInput => !!r),
        names,
      );
      for (const run of summary.runs) {
        if (run.passed === false && run.failedChecks.some((c) => !c.needsReview)) {
          const name = names[run.personaId] || run.personaId;
          broken.set(name, (broken.get(name) || 0) + 1);
        }
      }
    }
    const redteamBroken = [...broken.entries()]
      .map(([personaName, count]) => ({ personaName, count }))
      .sort((a, b) => b.count - a.count);

    return { runsLast10Min, topFailingChecks, redteamBroken };
  }

  private async load(id: string): Promise<RunSet> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException(`Run set ${id} not found`);
    const runSet = await this.runSetModel.findById(id).lean();
    if (!runSet) throw new NotFoundException(`Run set ${id} not found`);
    return runSet as RunSet;
  }

  private async view(runSet: RunSet): Promise<RunSetView> {
    const [runs, names] = await Promise.all([
      this.loadRuns(runSet.executionIds),
      this.personaNames(runSet.personaIds),
    ]);
    return {
      id: runSet._id!.toString(),
      kind: runSet.kind,
      scenarioId: runSet.scenarioId,
      promptId: runSet.promptId,
      personaIds: runSet.personaIds,
      k: runSet.k,
      isBaseline: !!runSet.isBaseline,
      ...(runSet.baselineRunSetId ? { baselineRunSetId: runSet.baselineRunSetId } : {}),
      createdAt: runSet.createdAt,
      ...summarizeRunSet(runSet.personaIds, runs, names),
    };
  }

  /** Executions joined to their newest scorecard result, in the run set's queue order. */
  private async loadRuns(executionIds: string[]): Promise<RunInput[]> {
    if (executionIds.length === 0) return [];
    const [executions, results] = await Promise.all([
      this.executionModel
        .find({ executionId: { $in: executionIds } })
        .select('executionId personaId status errorMessages')
        .lean(),
      this.scorecardsService.findResultsByExecutions(executionIds),
    ]);
    const latest = new Map<string, any>();
    for (const r of results as any[]) {
      if (r.status === 'completed' && !latest.has(r.scenarioExecutionId)) {
        latest.set(r.scenarioExecutionId, r);
      }
    }
    const byId = new Map(executions.map((e: any) => [e.executionId, e]));
    return executionIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((e: any) => ({
        executionId: e.executionId,
        personaId: e.personaId?.toString() || '',
        status: e.status,
        errorMessage: Array.isArray(e.errorMessages) ? e.errorMessages[0] : undefined,
        result: latest.get(e.executionId) || null,
      }));
  }

  private async personaNames(ids: string[]): Promise<Record<string, string>> {
    const valid = [...new Set(ids)].filter((id) => Types.ObjectId.isValid(id));
    if (valid.length === 0) return {};
    const personas = await this.personaModel
      .find({ _id: { $in: valid } })
      .select('name')
      .lean();
    return Object.fromEntries(personas.map((p: any) => [p._id.toString(), p.name]));
  }
}

function personaKey(ids: string[]): string {
  return [...ids].sort().join(',');
}
