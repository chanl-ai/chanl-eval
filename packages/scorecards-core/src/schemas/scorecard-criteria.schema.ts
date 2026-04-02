import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type ScorecardCriteriaDocument = ScorecardCriteria & Document;

// Criteria type enum
export enum CriteriaType {
  PROMPT = 'prompt',
  KEYWORD = 'keyword',
  RESPONSE_TIME = 'response_time',
  TOOL_CALL = 'tool_call',
  HALLUCINATION = 'hallucination',
  KNOWLEDGE_RETENTION = 'knowledge_retention',
  CONVERSATION_COMPLETENESS = 'conversation_completeness',
  ROLE_ADHERENCE = 'role_adherence',
  RAG_FAITHFULNESS = 'rag_faithfulness',
}

// ========== SETTINGS INTERFACES ==========

export interface PromptCriteriaSettings {
  description: string;
  evaluationType: 'boolean' | 'score';
}

export interface KeywordCriteriaSettings {
  matchType: 'must_contain' | 'must_not_contain' | 'any' | 'none';
  keyword: string | string[];
  /** Plural alias — some DB documents store `keywords` instead of `keyword` */
  keywords?: string | string[];
  caseSensitive?: boolean;
}

export interface ResponseTimeCriteriaSettings {
  participant: 'agent' | 'customer' | 'both';
}

export interface ToolCallCriteriaSettings {
  expectedTool: string | string[];
  executionCondition?: string;
}

export interface HallucinationCriteriaSettings {
  description?: string;
  evaluationType?: 'boolean' | 'score';
}

export interface KnowledgeRetentionCriteriaSettings {
  description?: string;
  evaluationType?: 'boolean' | 'score';
}

export interface ConversationCompletenessCriteriaSettings {
  description?: string;
  evaluationType?: 'boolean' | 'score';
}

export interface RoleAdherenceCriteriaSettings {
  description?: string;
  evaluationType?: 'boolean' | 'score';
}

export interface RagFaithfulnessCriteriaSettings {
  description?: string;
  evaluationType?: 'boolean' | 'score';
  retrievalToolNames?: string[];
}

export type CriteriaSettings =
  | PromptCriteriaSettings
  | KeywordCriteriaSettings
  | ResponseTimeCriteriaSettings
  | ToolCallCriteriaSettings
  | HallucinationCriteriaSettings
  | KnowledgeRetentionCriteriaSettings
  | ConversationCompletenessCriteriaSettings
  | RoleAdherenceCriteriaSettings
  | RagFaithfulnessCriteriaSettings;

// ========== THRESHOLD INTERFACES ==========

export interface BooleanThreshold {
  expectedValue: boolean;
}

export interface NumericalThreshold {
  min?: number;
  max?: number;
}

export interface PercentageThreshold {
  minPercentage?: number;
  maxPercentage?: number;
}

export type Threshold =
  | BooleanThreshold
  | NumericalThreshold
  | PercentageThreshold;

// ========== TYPE GUARDS ==========

export function isPromptSettings(s: any): s is PromptCriteriaSettings {
  return s?.description !== undefined && s?.evaluationType !== undefined;
}

export function isKeywordSettings(s: any): s is KeywordCriteriaSettings {
  return s?.matchType !== undefined && s?.keyword !== undefined;
}

export function isBooleanThreshold(t: any): t is BooleanThreshold {
  return t?.expectedValue !== undefined;
}

export function isNumericalThreshold(t: any): t is NumericalThreshold {
  return (
    (t?.min !== undefined || t?.max !== undefined) &&
    t?.minPercentage === undefined
  );
}

export function isPercentageThreshold(t: any): t is PercentageThreshold {
  return t?.minPercentage !== undefined || t?.maxPercentage !== undefined;
}

// ========== HELPER ==========

export function getEvaluationType(
  criteria: ScorecardCriteria,
): 'boolean' | 'score' | 'number' | 'percentage' {
  const llmJudgeTypes = [
    CriteriaType.PROMPT,
    CriteriaType.HALLUCINATION,
    CriteriaType.KNOWLEDGE_RETENTION,
    CriteriaType.CONVERSATION_COMPLETENESS,
    CriteriaType.ROLE_ADHERENCE,
    CriteriaType.RAG_FAITHFULNESS,
  ];
  if (llmJudgeTypes.includes(criteria.type as CriteriaType)) {
    const settings = criteria.settings as PromptCriteriaSettings;
    return settings?.evaluationType || 'boolean';
  }
  if (
    criteria.type === CriteriaType.KEYWORD ||
    criteria.type === CriteriaType.TOOL_CALL
  ) {
    return 'boolean';
  }
  if (isPercentageThreshold(criteria.threshold)) {
    return 'percentage';
  }
  return 'number';
}

// ========== SCHEMA DEFINITION ==========

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

@Schema({ collection: 'scorecard_criteria', timestamps: true })
export class ScorecardCriteria {
  _id?: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Scorecard' })
  scorecardId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'ScorecardCategory' })
  categoryId!: Types.ObjectId;

  @Prop({ required: true })
  key!: string;

  @Prop({ required: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({ required: true, enum: Object.values(CriteriaType) })
  type!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  settings!: CriteriaSettings;

  @Prop({ type: MongooseSchema.Types.Mixed })
  threshold?: Threshold;

  @Prop({ default: 1 })
  version!: number;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const ScorecardCriteriaSchema =
  SchemaFactory.createForClass(ScorecardCriteria);
ScorecardCriteriaSchema.index({ scorecardId: 1, key: 1 }, { unique: true });
ScorecardCriteriaSchema.index({ categoryId: 1 });
ScorecardCriteriaSchema.plugin(virtualIdPlugin);
