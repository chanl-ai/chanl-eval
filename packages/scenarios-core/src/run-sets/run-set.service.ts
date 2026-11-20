import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ScorecardResult, ScorecardsService } from '@chanl/scorecards-core';
import { RunSet, RunSetDocument } from './schemas/run-set.schema';
import { CreateRunSetDto, ListRunSetsQuery } from './dto/create-run-set.dto';
import {
  ScenarioExecution,
  ScenarioExecutionDocument,
} from '../scenarios/schemas/scenario-execution.schema';
import { Persona, PersonaDocument } from '../personas/schemas/persona.schema';
import { Scenario, ScenarioDocument } from '../scenarios/schemas/scenario.schema';
import { ToolFixtureService } from '../tool-fixtures/tool-fixture.service';
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
  scorecardId: string | null;
  toolFixtureIds: string[];
  k: number;
  isBaseline: boolean;
  baselineRunSetId?: string;
  createdAt?: Date;
} & RunSetSummary;

export interface RoomStats {
  runsLast10Min: number;
  /** Start of the window the failing checks and red-team breaks cover. */
  since: string;
  topFailingChecks: Array<{ name: string; failed: number; total: number }>;
  redteamBroken: Array<{ personaName: string; count: number }>;
}

const DEFAULT_K = 5;
const ROOM_STATS_WINDOW_MS = 3 * 60 * 60 * 1000;

@Injectable()
export class RunSetService {
  constructor(
    @InjectModel(RunSet.name) private readonly runSetModel: Model<RunSetDocument>,
    @InjectModel(ScenarioExecution.name)
    private readonly executionModel: Model<ScenarioExecutionDocument>,
    @InjectModel(Persona.name) private readonly personaModel: Model<PersonaDocument>,
    @InjectModel(Scenario.name) private readonly scenarioModel: Model<ScenarioDocument>,
    private readonly executionService: ScenarioExecutionService,
    private readonly scorecardsService: ScorecardsService,
    private readonly toolFixtureService: ToolFixtureService,
  ) {}

  /** Queues k executions per persona through the same path as POST /scenarios/:id/execute. */
  async create(dto: CreateRunSetDto): Promise<{ id: string; executionIds: string[] }> {
    const k = dto.k ?? DEFAULT_K;
    for (const id of [dto.scenarioId, dto.promptId, ...dto.personaIds]) {
      if (!Types.ObjectId.isValid(id)) throw new BadRequestException(`Invalid id: ${id}`);
    }
    const { toolFixtureIds, scorecardId } = await this.resolveRunInputs(dto);
    const runSet = await this.runSetModel.create({
      kind: dto.kind,
      scenarioId: dto.scenarioId,
      promptId: dto.promptId,
      personaIds: dto.personaIds,
      scorecardId,
      toolFixtureIds,
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
            scorecardId,
            toolFixtureIds,
          },
          { runSetId },
        );
        executionIds.push(execution.executionId);
      }
    }
    await this.runSetModel.findByIdAndUpdate(runSetId, { $set: { executionIds } });
    return { id: runSetId, executionIds };
  }

  /**
   * Tools and scorecard the runs use. A set compared against a baseline reuses the baseline's, so
   * the before and after differ only in the agent. Otherwise an empty tool list means every active
   * tool on this server: a run set with no tools cannot exercise an agent whose policy is enforced
   * through tool calls, and the dashboard's run buttons send none. The scorecard falls back to the
   * scenario's, and is stored so GET can say which one scored the runs.
   */
  private async resolveRunInputs(
    dto: CreateRunSetDto,
  ): Promise<{ toolFixtureIds: string[]; scorecardId: string | undefined }> {
    let toolFixtureIds = dto.toolFixtureIds?.length ? dto.toolFixtureIds : undefined;
    let scorecardId = dto.scorecardId || undefined;
    if (dto.baselineRunSetId) {
      const baseline = await this.load(dto.baselineRunSetId);
      toolFixtureIds ??= baseline.toolFixtureIds?.length ? baseline.toolFixtureIds : undefined;
      scorecardId ??= baseline.scorecardId || undefined;
    }
    toolFixtureIds ??= await this.toolFixtureService.activeIdsForRun();
    if (!scorecardId) {
      const scenario = await this.scenarioModel.findById(dto.scenarioId).select('scorecardId').lean();
      if (!scenario) throw new NotFoundException(`Scenario ${dto.scenarioId} not found`);
      scorecardId = scenario.scorecardId?.toString() || undefined;
    }
    return { toolFixtureIds, scorecardId };
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

  /**
   * The wall's numbers for this server. Runs in the last 10 minutes count every execution (single
   * runs, run sets and playground chats), since that is the room's activity. Failing checks and
   * red-team breaks cover a window (default the last 3 hours) so rehearsal runs from earlier in the
   * day do not top the wall.
   */
  async roomStats(now = new Date(), since?: Date): Promise<RoomStats> {
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const windowStart = since ?? new Date(now.getTime() - ROOM_STATS_WINDOW_MS);
    const runsLast10Min = await this.executionModel.countDocuments({
      createdAt: { $gte: tenMinAgo },
    });

    const recent = await this.executionModel
      .find({ createdAt: { $gte: windowStart }, scenarioId: { $exists: true } })
      .select('executionId')
      .lean();
    const allRuns = await this.loadRuns(recent.map((e: any) => e.executionId));
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

    const sets = await this.runSetModel
      .find({ kind: 'redteam', createdAt: { $gte: windowStart } })
      .lean();
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

    return { runsLast10Min, since: windowStart.toISOString(), topFailingChecks, redteamBroken };
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
      scorecardId: runSet.scorecardId || null,
      toolFixtureIds: runSet.toolFixtureIds || [],
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
    const latest = new Map<string, ScorecardResult>();
    for (const r of results) {
      if (r.status === 'completed' && r.scenarioExecutionId && !latest.has(r.scenarioExecutionId)) {
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
