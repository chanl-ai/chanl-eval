import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'prompts' })
export class Prompt {
  @Prop({ required: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ type: String, enum: ['active', 'draft', 'archived'], default: 'active' })
  status!: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];
}

export type PromptDocument = Prompt & Document;
export const PromptSchema = SchemaFactory.createForClass(Prompt);

// Add virtual id
PromptSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
