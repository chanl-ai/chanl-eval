import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type ScorecardResultDocument = ScorecardResult & Document;

export interface CriteriaResult {
  criteriaId: string;
  criteriaKey: string;
  criteriaVersion: number;
  categoryId: string;
  categoryVersion: number;
  categoryName?: string;
  criteriaName?: string;
  result: any;
  passed: boolean;
  reasoning: string;
  evidence: string[];
  notApplicable?: boolean;
}

export interface AnalysisMetadata {
  analysisType: 'automatic' | 'manual' | 'scenario';
  triggeredBy: 'endpoint' | 'scenario' | 'manual';
  processingTime: number;
  transcriptLength: number;
  criteriaCount: number;
  autoScored: boolean;
  scorecardVersion: string;
  analysisTimestamp: Date;
}

function virtualIdPlugin(schema: any) {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_doc: any, ret: any) => {
      ret.id = ret._id?.toString();
      delete ret._id;
      return ret;
    },
  });
  schema.set('toObject', {
    virtuals: true,
    versionKey: false,
    transform: (_doc: any, ret: any) => {
      ret.id = ret._id?.toString();
      delete ret._id;
      return ret;
    },
  });
}

@Schema({ collection: 'scorecard_results', timestamps: true })
export class ScorecardResult {
  _id?: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Scorecard' })
  scorecardId!: Types.ObjectId;

  @Prop()
  callId?: string;

  @Prop()
  audioId?: string;

  @Prop()
  agentId?: string;

  @Prop()
  scenarioExecutionId?: string;

  @Prop({
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  })
  status!: string;

  @Prop({ type: Number, min: 0, max: 10 })
  overallScore?: number;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  categoryScores!: Record<string, number>;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  criteriaResults!: CriteriaResult[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  analysisMetadata?: AnalysisMetadata;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const ScorecardResultSchema =
  SchemaFactory.createForClass(ScorecardResult);
ScorecardResultSchema.index({ scorecardId: 1 });
ScorecardResultSchema.index({ callId: 1 });
ScorecardResultSchema.plugin(virtualIdPlugin);
