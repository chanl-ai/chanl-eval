import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ScorecardDocument = Scorecard & Document;

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

@Schema({ collection: 'scorecards', timestamps: true })
export class Scorecard {
  _id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Workspace' })
  workspaceId?: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({ enum: ['active', 'inactive', 'draft'], default: 'draft' })
  status!: string;

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'ScorecardCategory' }],
    default: [],
  })
  categoryIds!: Types.ObjectId[];

  @Prop({ default: 70, min: 0, max: 100 })
  passingThreshold!: number;

  @Prop({
    enum: ['weighted_average', 'simple_average', 'minimum_all', 'pass_fail'],
    default: 'weighted_average',
  })
  scoringAlgorithm!: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop()
  createdBy?: string;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const ScorecardSchema = SchemaFactory.createForClass(Scorecard);
ScorecardSchema.index({ workspaceId: 1, status: 1 });
ScorecardSchema.plugin(virtualIdPlugin);
