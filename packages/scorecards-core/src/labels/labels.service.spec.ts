import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { LabelsService } from './labels.service';
import { HumanLabel, HumanLabelSchema, HumanLabelDocument } from '../schemas/human-label.schema';
import {
  ScorecardResult,
  ScorecardResultSchema,
  ScorecardResultDocument,
} from '../schemas/scorecard-result.schema';

/**
 * Write semantics for human labels, against a real database.
 *
 * The agreement maths is covered separately and needs no I/O. What needs a database is everything
 * that makes the stored history trustworthy: one label per reviewer, the judge verdict snapshotted
 * so re-evaluation cannot rewrite history, and grouping that does not merge unrelated scorecards.
 */
describe('LabelsService', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let service: LabelsService;
  let labelModel: Model<HumanLabelDocument>;
  let resultModel: Model<ScorecardResultDocument>;

  const SCORECARD_A = new Types.ObjectId();
  const SCORECARD_B = new Types.ObjectId();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: HumanLabel.name, schema: HumanLabelSchema },
          { name: ScorecardResult.name, schema: ScorecardResultSchema },
        ]),
      ],
      providers: [LabelsService],
    }).compile();
    await module.init();

    service = module.get(LabelsService);
    labelModel = module.get(getModelToken(HumanLabel.name));
    resultModel = module.get(getModelToken(ScorecardResult.name));
    await labelModel.init();
  }, 120_000);

  afterAll(async () => {
    await module?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await labelModel.deleteMany({});
    await resultModel.deleteMany({});
  });

  async function seedResult(
    scorecardId: Types.ObjectId,
    criteria: Array<{ id: string; key: string; result: unknown; passed: boolean }>,
  ) {
    return resultModel.create({
      scorecardId,
      scenarioExecutionId: 'exec-1',
      status: 'completed',
      criteriaResults: criteria.map((c) => ({
        criteriaId: c.id,
        criteriaKey: c.key,
        criteriaName: c.key,
        criteriaVersion: 1,
        categoryId: 'cat-1',
        categoryVersion: 1,
        result: c.result,
        passed: c.passed,
        reasoning: 'judge reasoning',
        evidence: [],
      })),
    });
  }

  describe('one label per reviewer per criterion', () => {
    it('updates rather than duplicating when the same reviewer labels twice', async () => {
      const r = await seedResult(SCORECARD_A, [
        { id: 'c1', key: 'clarity', result: 4, passed: false },
      ]);

      await service.upsert({
        scorecardResultId: r.id,
        criteriaId: 'c1',
        humanResult: 6,
        labeledBy: 'dean',
      });
      await service.upsert({
        scorecardResultId: r.id,
        criteriaId: 'c1',
        humanResult: 2,
        labeledBy: 'dean',
      });

      const labels = await labelModel.find({});
      expect(labels).toHaveLength(1);
      expect(labels[0].humanResult).toBe(2);
    });

    it('keeps a separate label per reviewer, which is what allows a human-vs-human ceiling', async () => {
      const r = await seedResult(SCORECARD_A, [
        { id: 'c1', key: 'clarity', result: 4, passed: false },
      ]);

      await service.upsert({ scorecardResultId: r.id, criteriaId: 'c1', humanResult: 6, labeledBy: 'dean' });
      await service.upsert({ scorecardResultId: r.id, criteriaId: 'c1', humanResult: 3, labeledBy: 'sam' });

      expect(await labelModel.countDocuments({})).toBe(2);
    });

    it('is enforced by the database', async () => {
      const r = await seedResult(SCORECARD_A, [
        { id: 'c1', key: 'clarity', result: 4, passed: false },
      ]);
      await service.upsert({ scorecardResultId: r.id, criteriaId: 'c1', humanResult: 6, labeledBy: 'dean' });

      await expect(
        labelModel.collection.insertOne({
          scorecardResultId: r.id,
          criteriaId: 'c1',
          labeledBy: 'dean',
        }),
      ).rejects.toMatchObject({ code: 11000 });
    });
  });

  describe('judge snapshot', () => {
    it('captures the judge verdict at labelling time', async () => {
      const r = await seedResult(SCORECARD_A, [
        { id: 'c1', key: 'clarity', result: 4, passed: false },
      ]);

      await service.upsert({ scorecardResultId: r.id, criteriaId: 'c1', humanResult: 8 });

      const label = await labelModel.findOne({});
      expect(label!.judgeResult).toBe(4);
      expect(label!.judgeReasoning).toBe('judge reasoning');
    });

    it('does not follow the result when the run is re-evaluated', async () => {
      // Without the snapshot, re-evaluating would re-pair every historical label against the new
      // verdict and the agreement history would silently rewrite itself.
      const r = await seedResult(SCORECARD_A, [
        { id: 'c1', key: 'clarity', result: 4, passed: false },
      ]);
      await service.upsert({ scorecardResultId: r.id, criteriaId: 'c1', humanResult: 8 });

      await resultModel.findByIdAndUpdate(r.id, {
        $set: { 'criteriaResults.0.result': 9, 'criteriaResults.0.passed': true },
      });

      const label = await labelModel.findOne({});
      expect(label!.judgeResult).toBe(4);
    });
  });

  describe('agreement grouping', () => {
    it('does not pool criteria that share a key across different scorecards', async () => {
      // criteriaKey is not unique across scorecards, so grouping on it alone merged unrelated
      // rubrics into a single kappa.
      const a = await seedResult(SCORECARD_A, [
        { id: 'a1', key: 'clarity', result: true, passed: true },
      ]);
      const b = await seedResult(SCORECARD_B, [
        { id: 'b1', key: 'clarity', result: true, passed: true },
      ]);

      await service.upsert({ scorecardResultId: a.id, criteriaId: 'a1', humanResult: true });
      await service.upsert({ scorecardResultId: b.id, criteriaId: 'b1', humanResult: false });

      const report = await service.agreement();
      const clarityRows = report.byCriterion.filter((c) => c.criteriaKey === 'clarity');

      expect(clarityRows).toHaveLength(2);
      expect(clarityRows.every((r) => r.n === 1)).toBe(true);
    });

    it('scopes to a single scorecard when asked', async () => {
      const a = await seedResult(SCORECARD_A, [
        { id: 'a1', key: 'clarity', result: true, passed: true },
      ]);
      const b = await seedResult(SCORECARD_B, [
        { id: 'b1', key: 'clarity', result: true, passed: true },
      ]);
      await service.upsert({ scorecardResultId: a.id, criteriaId: 'a1', humanResult: true });
      await service.upsert({ scorecardResultId: b.id, criteriaId: 'b1', humanResult: false });

      const report = await service.agreement({ scorecardId: SCORECARD_A.toString() });

      expect(report.overall.n).toBe(1);
      expect(report.byCriterion).toHaveLength(1);
    });
  });

  describe('disagreement queue', () => {
    it('lists only labels where the human overruled the judge', async () => {
      const r = await seedResult(SCORECARD_A, [
        { id: 'c1', key: 'agreed_one', result: true, passed: true },
        { id: 'c2', key: 'disagreed_one', result: true, passed: true },
      ]);

      await service.upsert({ scorecardResultId: r.id, criteriaId: 'c1', humanResult: true });
      await service.upsert({
        scorecardResultId: r.id,
        criteriaId: 'c2',
        humanResult: false,
        note: 'judge missed the fabrication',
      });

      const report = await service.agreement();

      expect(report.disagreements).toHaveLength(1);
      expect(report.disagreements[0].criteriaKey).toBe('disagreed_one');
      expect(report.disagreements[0].note).toBe('judge missed the fabrication');
    });

    it('treats a score within one point as agreement', async () => {
      const r = await seedResult(SCORECARD_A, [
        { id: 'c1', key: 'clarity', result: 8, passed: true },
      ]);
      await service.upsert({ scorecardResultId: r.id, criteriaId: 'c1', humanResult: 7 });

      const report = await service.agreement();
      expect(report.disagreements).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('rejects a label for a criterion that is not on the result', async () => {
      const r = await seedResult(SCORECARD_A, [
        { id: 'c1', key: 'clarity', result: true, passed: true },
      ]);
      await expect(
        service.upsert({ scorecardResultId: r.id, criteriaId: 'nope', humanResult: true }),
      ).rejects.toThrow(/not part of/);
    });

    it('clamps a score outside the rubric range', async () => {
      const r = await seedResult(SCORECARD_A, [
        { id: 'c1', key: 'clarity', result: 5, passed: false },
      ]);
      await service.upsert({ scorecardResultId: r.id, criteriaId: 'c1', humanResult: 42 });

      const label = await labelModel.findOne({});
      expect(label!.humanResult).toBe(10);
    });
  });
});
