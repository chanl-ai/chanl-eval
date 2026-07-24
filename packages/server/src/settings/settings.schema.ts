import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Discriminator for the settings singleton.
 *
 * The collection is meant to hold exactly one document, but "exactly one" was previously enforced
 * only by `findOne()` returning nothing — which is a check, not a constraint. A constant key plus a
 * unique index makes the database enforce it, so two nodes racing on first boot converge on one
 * document instead of creating two and then answering from whichever `findOne` happened to hit.
 */
export const SETTINGS_SINGLETON_KEY = 'default';

@Schema({ timestamps: true, collection: 'settings' })
export class Settings {
  @Prop({ type: String, default: SETTINGS_SINGLETON_KEY })
  key!: string;

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

// This index is the actual singleton guarantee. Without it the upsert in SettingsService.get()
// still has a read-then-write window that two nodes can both pass.
SettingsSchema.index({ key: 1 }, { unique: true });

SettingsSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
