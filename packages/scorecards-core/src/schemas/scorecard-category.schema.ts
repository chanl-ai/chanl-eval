import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ScorecardCategoryDocument = ScorecardCategory & Document;

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

@Schema({ collection: 'scorecard_categories', timestamps: true })
export class ScorecardCategory {
  _id?: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Scorecard' })
  scorecardId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({ default: 100, min: 0, max: 100 })
  weight!: number;

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'ScorecardCriteria' }],
    default: [],
  })
  criteriaIds!: Types.ObjectId[];

  @Prop({ default: 0 })
  order!: number;

  @Prop({ default: 1 })
  version!: number;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const ScorecardCategorySchema =
  SchemaFactory.createForClass(ScorecardCategory);
ScorecardCategorySchema.index({ scorecardId: 1 });
ScorecardCategorySchema.plugin(virtualIdPlugin);
