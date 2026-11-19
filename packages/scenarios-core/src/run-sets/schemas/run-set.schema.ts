import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RunSetDocument = RunSet & Document;

export const RUN_SET_KINDS = ['reliability', 'redteam', 'compare'] as const;
export type RunSetKind = (typeof RUN_SET_KINDS)[number];

/**
 * k repeated executions of one scenario per persona, scored together so a result reads as
 * "passed 3 of 5" instead of one lucky or unlucky run.
 */
@Schema({ collection: 'run_sets', timestamps: true })
export class RunSet {
  _id?: Types.ObjectId;

  @Prop({ required: true, enum: RUN_SET_KINDS })
  kind!: RunSetKind;

  @Prop({ required: true, type: String, index: true })
  scenarioId!: string;

  @Prop({ required: true, type: String, index: true })
  promptId!: string;

  @Prop({ type: [String], default: [] })
  personaIds!: string[];

  @Prop({ type: String })
  scorecardId?: string;

  @Prop({ type: [String], default: [] })
  toolFixtureIds!: string[];

  @Prop({ required: true, min: 1, max: 10 })
  k!: number;

  @Prop({ type: String })
  baselineRunSetId?: string;

  @Prop({ default: false })
  isBaseline!: boolean;

  /** executionId (exec_<uuid>) of every queued run. */
  @Prop({ type: [String], default: [] })
  executionIds!: string[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const RunSetSchema = SchemaFactory.createForClass(RunSet);
RunSetSchema.index({ scenarioId: 1, createdAt: -1 });
