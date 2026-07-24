import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'settings' })
export class Settings {
  @Prop({ type: Object, default: {} })
  providerKeys!: {
    openai?: string;
    anthropic?: string;
    http?: string;
  };

  /**
   * OpenAI-/Anthropic-compatible host for the SIMULATION half (persona dialogue + LLM judge).
   * Lets the expensive-but-frequent simulation calls run against a local or cheaper model while the
   * agent under test stays on whatever it ships with. Env `CHANL_SIMULATION_BASE_URL` overrides.
   */
  @Prop({ type: String })
  simulationBaseUrl?: string;
}

export type SettingsDocument = Settings & Document;
export const SettingsSchema = SchemaFactory.createForClass(Settings);

SettingsSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
