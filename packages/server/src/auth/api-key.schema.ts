import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ApiKeyDocument = HydratedDocument<ApiKey>;

@Schema({ collection: 'api_keys', timestamps: true })
export class ApiKey {
  @Prop({ required: true, unique: true })
  key!: string;

  @Prop()
  name?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);
