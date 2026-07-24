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
ScorecardSchema.index({ status: 1 });

// Seeding upserts the default scorecard by name. Two replicas booting together would each pass the
// upsert's read phase and insert a duplicate — this index is what makes seeding idempotent under
// concurrency, and it is also what keeps a second scorecard from being built with its own
// duplicate category and criteria tree.
//
// Scoped to the seeded row: `createdBy` is only ever 'system' for that one (CreateScorecardDto has
// no such field, so a caller cannot set it), and user scorecards legitimately share names.
ScorecardSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { createdBy: 'system' } },
);
ScorecardSchema.plugin(virtualIdPlugin);
