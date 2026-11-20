import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type HumanLabelDocument = HumanLabel & Document;

/**
 * A human verdict on one criterion of one scored run. Ground truth for measuring the LLM judge.
 *
 * Kept in its own collection rather than embedded in the scorecard result: the result is an
 * immutable record of the judge's output, multiple reviewers may label the same criterion, and
 * agreement is computed across many runs.
 *
 * The judge verdict is snapshotted at write time. Re-evaluating a run replaces its criteria
 * results, so an unsnapshotted label would re-pair against a newer verdict and rewrite history.
 */
@Schema({ collection: 'human_labels', timestamps: true })
export class HumanLabel {
  _id?: Types.ObjectId;

  @Prop({ required: true, index: true })
  scorecardResultId!: string;

  @Prop({ index: true })
  scenarioExecutionId?: string;

  @Prop({ required: true, index: true })
  scorecardId!: string;

  @Prop({ required: true })
  criteriaId!: string;

  /** Stable across scorecard versions, so agreement can be grouped by criterion over time. */
  @Prop({ required: true, index: true })
  criteriaKey!: string;

  @Prop()
  criteriaName?: string;

  /** 'boolean' | 'score' — determines which agreement statistic applies. */
  @Prop({ required: true })
  evaluationType!: string;

  /** The human's verdict: boolean for pass/fail criteria, 0-10 for score criteria. */
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  humanResult!: boolean | number;

  @Prop({ required: true })
  humanPassed!: boolean;

  /** Why the human disagreed. The most valuable field in the collection for improving a rubric. */
  @Prop()
  note?: string;

  /** Free-text reviewer identity. One label per reviewer per criterion per result. */
  @Prop({ required: true, default: 'anonymous', index: true })
  labeledBy!: string;

  // ---- Snapshot of what the judge said at labelling time ----

  @Prop({ type: MongooseSchema.Types.Mixed })
  judgeResult?: boolean | number;

  @Prop()
  judgePassed?: boolean;

  @Prop()
  judgeConfidence?: number;

  @Prop()
  judgeReasoning?: string;

  /** Derived at write time so the disagreement queue is a plain indexed query. */
  @Prop({ required: true, default: false, index: true })
  agreed!: boolean;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const HumanLabelSchema = SchemaFactory.createForClass(HumanLabel);

// One label per reviewer per criterion per result — labelling again is a correction, not a second
// opinion. A second reviewer supplies a different labeledBy and gets their own row.
HumanLabelSchema.index(
  { scorecardResultId: 1, criteriaId: 1, labeledBy: 1 },
  { unique: true },
);
HumanLabelSchema.index({ criteriaKey: 1, createdAt: -1 });

HumanLabelSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});
