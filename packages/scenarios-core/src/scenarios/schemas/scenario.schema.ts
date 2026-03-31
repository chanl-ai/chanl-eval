import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ScenarioDocument = Scenario & Document;

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

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

@Schema({
  collection: 'scenarios',
  timestamps: true,
})
export class Scenario {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: false })
  workspaceId?: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({
    type: {
      situation: String,
      objective: String,
      background: String,
      constraints: [String],
    },
    required: false,
  })
  context?: {
    situation?: string;
    objective?: string;
    background?: string;
    constraints?: string[];
  };

  @Prop({ required: true })
  prompt!: string;

  /**
   * Optional Liquid template for the persona system prompt.
   * When set, this template is rendered with persona + scenario variables
   * and replaces the code-generated persona prompt.
   *
   * Available variables: {{ persona.name }}, {{ persona.emotion }},
   * {{ scenario.prompt }}, {{ scenario.category }}, and any promptVariables.
   *
   * chanl cloud extends this with: emotional arcs, reactive behaviors,
   * and advanced variable diagnostics.
   */
  @Prop({ type: String, required: false })
  promptTemplate?: string;

  @Prop({
    type: [
      {
        name: { type: String, required: true },
        type: {
          type: String,
          enum: ['string', 'number', 'boolean', 'date'],
          required: true,
        },
        defaultValue: { type: String, required: true },
        description: { type: String, required: false },
      },
    ],
    default: [],
  })
  promptVariables!: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date';
    defaultValue: string;
    description: string;
  }>;

  @Prop({
    required: true,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium',
  })
  difficulty!: DifficultyLevel;

  /**
   * Scenario lifecycle status.
   *
   * @value 'draft' - Being configured, allows placeholder IDs for personas/agents
   * @value 'active' - Published and executable (set via /publish endpoint)
   * @value 'paused' - Unpublished, not executable (set via /unpublish endpoint)
   * @value 'completed' - Reserved for future use
   * @value 'archived' - Soft deleted
   */
  @Prop({
    required: true,
    enum: ['draft', 'active', 'paused', 'completed', 'archived'],
    default: 'active',
  })
  status!: string;

  @Prop({
    required: true,
    enum: [
      'support',
      'sales',
      'booking',
      'technical',
      'onboarding',
      'feedback',
    ],
    default: 'support',
  })
  category!: string;

  // Configuration for different scenario types
  @Prop({
    type: Object,
    default: {},
  })
  configuration!: {
    // A/B test configuration
    variants?: {
      name: string;
      weight: number;
      changes: Record<string, any>;
    }[];

    // Stress test configuration
    concurrentCalls?: number;
    duration?: number;
    rampUpTime?: number;

    // Integration test configuration
    endpoints?: string[];
    dependencies?: string[];

    // General configuration
    maxExecutionTime?: number;
    retryPolicy?: {
      maxRetries: number;
      retryDelay: number;
    };
    notifications?: {
      email?: string[];
      webhook?: string;
    };

    [key: string]: any;
  };

  // Execution history and metrics
  @Prop({
    type: Object,
    default: {
      totalExecutions: 0,
      successfulExecutions: 0,
      averageScore: 0,
      lastExecuted: null,
    },
  })
  metrics!: {
    totalExecutions: number;
    successfulExecutions: number;
    averageScore: number;
    averageDuration?: number;
    lastExecuted?: Date;
    trends?: {
      date: Date;
      score: number;
      duration: number;
    }[];
  };

  // Template approach: arrays of personas and agents (cross-product generated at execution)
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Persona' }], required: true })
  personaIds!: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Agent' }], required: true })
  agentIds!: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Scorecard', required: false })
  scorecardId?: Types.ObjectId;

  /**
   * Agent configuration overrides for testing scenarios.
   * Keyed by agentId, allows per-agent customization without modifying the base agent.
   */
  @Prop({
    type: Map,
    of: {
      type: Object,
      properties: {
        promptOverride: { type: String },
        promptVariables: { type: Object },
        temperature: { type: Number },
        maxTokens: { type: Number },
        tools: { type: [String] },
        voice: {
          type: Object,
          properties: {
            voiceId: { type: String },
            speed: { type: Number },
            stability: { type: Number },
          },
        },
      },
    },
  })
  agentOverrides?: Map<
    string,
    {
      promptOverride?: string;
      promptVariables?: Record<string, string>;
      temperature?: number;
      maxTokens?: number;
      tools?: string[];
      voice?: {
        voiceId?: string;
        speed?: number;
        stability?: number;
      };
    }
  >;

  // Optional: Phone number for phone simulation mode
  @Prop({ type: String })
  phoneNumber?: string;

  // Simulation mode for testing
  @Prop({
    type: String,
    enum: ['text', 'websocket', 'phone'],
  })
  simulationMode?: 'text' | 'websocket' | 'phone';

  // Tags for organization and filtering
  @Prop({ type: [String], default: [] })
  tags!: string[];

  // Parallel execution limit
  @Prop({ type: Number })
  maxParallelExecutions?: number;

  // Version control
  @Prop({ default: 1 })
  version!: number;

  @Prop({ type: Types.ObjectId, ref: 'Scenario' })
  parentScenarioId?: Types.ObjectId;

  // Permissions and ownership
  @Prop({ required: true })
  createdBy!: string;

  @Prop()
  lastModifiedBy?: string;

  @Prop({ type: Date })
  createdAt!: Date;

  @Prop({ type: Date })
  updatedAt!: Date;
}

export const ScenarioSchema = SchemaFactory.createForClass(Scenario);

// Apply virtual ID plugin for consistent _id -> id mapping
ScenarioSchema.plugin(virtualIdPlugin);

// Add indexes for better query performance
ScenarioSchema.index({ workspaceId: 1, status: 1 });
ScenarioSchema.index({ workspaceId: 1, category: 1 });
ScenarioSchema.index({ createdBy: 1 });
ScenarioSchema.index({ tags: 1 });
ScenarioSchema.index({ 'metrics.lastExecuted': 1 });
ScenarioSchema.index({ personaIds: 1 });
ScenarioSchema.index({ agentIds: 1 });
