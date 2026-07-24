import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type HumanLabelDocument = HumanLabel & Document;

/**
 * A human's verdict on one criterion of one scored run — the ground truth the LLM judge is measured
 * against.
 *
 * Stored in its own collection rather than embedded in the scorecard result, for three reasons:
 * the result document is an immutable record of what the judge said and should not be rewritten when
 * a person disagrees with it; several reviewers may label the same criterion (which is what lets us
 * report human-vs-human agreement as a ceiling); and agreement is computed by scanning labels across
 * many runs, which is a query against labels, not against results.
 *
 * The judge's verdict is snapshotted onto the label at write time. Re-running an evaluation replaces
 * the criteria results, so without a snapshot every historical label would silently re-pair itself
 * against a newer verdict and the agreement history would rewrite itself.
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
