import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type ScenarioTemplateDocument = ScenarioTemplate & Document;

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  defaultValue?: any;
  description?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}

export interface TemplateStep {
  order: number;
  type: 'greeting' | 'question' | 'assertion' | 'action' | 'custom';
  content: string;
  expectedResponse?: string;
  variables?: string[];
  scoringCriteria?: {
    weight: number;
    rubric?: string;
  };
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
  schema.set('toObject', { virtuals: true });
}

@Schema({ collection: 'scenario_templates', timestamps: true })
export class ScenarioTemplate {
  _id?: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({
    required: true,
    enum: ['support', 'sales', 'onboarding', 'survey', 'healthcare', 'technical', 'custom'],
    default: 'custom',
  })
  category!: string;

  @Prop({
    enum: ['public', 'workspace', 'private'],
    default: 'public',
  })
  visibility!: string;

  @Prop({
    enum: ['draft', 'published', 'deprecated'],
    default: 'published',
  })
  status!: string;

  @Prop({ required: true })
  prompt!: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({
    enum: ['easy', 'medium', 'hard'],
    default: 'medium',
  })
  difficulty!: string;

  @Prop({ default: 1 })
  version!: number;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  variables!: TemplateVariable[];

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  steps!: TemplateStep[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  defaultPersonaConfig?: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  defaultScoringConfig?: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: { timesUsed: 0 } })
  usageStats!: {
    timesUsed: number;
    avgScore?: number;
    lastUsed?: Date;
  };

  @Prop({ default: false })
  isFeatured!: boolean;

  @Prop({ default: 0 })
  featuredOrder!: number;

  @Prop()
  createdBy?: string;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;

  @Prop({ type: Date })
  publishedAt?: Date;
}

export const ScenarioTemplateSchema =
  SchemaFactory.createForClass(ScenarioTemplate);
ScenarioTemplateSchema.index({ category: 1 });
ScenarioTemplateSchema.index({ visibility: 1, status: 1 });
ScenarioTemplateSchema.index({ tags: 1 });
ScenarioTemplateSchema.index({ isFeatured: 1, featuredOrder: 1 });
ScenarioTemplateSchema.plugin(virtualIdPlugin);
