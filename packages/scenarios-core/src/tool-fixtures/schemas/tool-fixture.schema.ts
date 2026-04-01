import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ToolFixtureDocument = ToolFixture & Document;

/**
 * Local virtual ID plugin - transforms _id to id in JSON responses.
 * Replaces the @chanl-ai/nestjs-common virtualIdPlugin for OSS usage.
 */
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

/**
 * A single mock response rule.
 * When a tool call matches `when` conditions (or `isDefault` is true),
 * the `return` value is used as the tool result.
 */
export interface MockResponseRule {
  when?: Record<string, any>;
  isDefault?: boolean;
  return: any;
  description?: string;
}

@Schema({
  collection: 'tool_fixtures',
  timestamps: true,
})
export class ToolFixture {
  @Prop({ required: true, index: true })
  name!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ type: Object, default: { type: 'object', properties: {} } })
  parameters!: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };

  @Prop({ type: [Object], default: [] })
  mockResponses!: MockResponseRule[];

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop({ default: 'local' })
  createdBy!: string;

  @Prop()
  lastModifiedBy?: string;

  @Prop({ type: Date })
  createdAt!: Date;

  @Prop({ type: Date })
  updatedAt!: Date;
}

export const ToolFixtureSchema = SchemaFactory.createForClass(ToolFixture);

// Add indexes for better query performance
ToolFixtureSchema.index({ name: 1 });
ToolFixtureSchema.index({ tags: 1 });
ToolFixtureSchema.index({ isActive: 1 });
ToolFixtureSchema.index({ createdBy: 1 });

// Apply virtual ID plugin to transform _id to id in responses
ToolFixtureSchema.plugin(virtualIdPlugin);
