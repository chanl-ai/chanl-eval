import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ScenarioExecutionDocument = ScenarioExecution & Document;

// Step execution result interface
export interface StepResult {
  stepId: string;
  status:
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'skipped'
    | 'timeout';
  actualResponse?: string;
  expectedResponse?: string;
  score?: number;
  duration?: number;
  startTime?: Date;
  endTime?: Date;
  errorMessages?: string[];
  metadata?: Record<string, any>;
}

// Call details interface
export interface CallDetails {
  callId?: string;
  phoneNumber?: string;
  recordingUrl?: string;
  transcription?: string;
  providerCallId?: string;
  origin?: 'simulation' | 'real';
  duration?: number;
  cost?: number;
  startTime?: Date;
  endTime?: Date;
}

// Execution metrics interface
export interface ExecutionMetrics {
  responseTime: number;
  accuracy: number;
  completion: number;
  satisfaction?: number;
  customMetrics?: Record<string, number>;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
}

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
  collection: 'scenarioExecutions',
  timestamps: true,
})
export class ScenarioExecution {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Scenario' })
  scenarioId!: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId, ref: 'Agent' })
  agentId?: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId, ref: 'Persona' })
  personaId?: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId, ref: 'Scorecard' })
  scorecardId?: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId, ref: 'Workspace' })
  workspaceId?: Types.ObjectId;

  @Prop({ required: true, unique: true })
  executionId!: string;

  @Prop({
    required: true,
    enum: ['queued', 'running', 'completed', 'failed', 'timeout', 'cancelled'],
    default: 'queued',
  })
  status!: string;

  @Prop({ required: true })
  startTime!: Date;

  @Prop()
  endTime?: Date;

  @Prop()
  duration?: number;

  @Prop({ min: 0, max: 100 })
  overallScore?: number;

  @Prop({
    type: [
      {
        stepId: String,
        status: {
          type: String,
          enum: [
            'pending',
            'running',
            'completed',
            'failed',
            'skipped',
            'timeout',
          ],
        },
        actualResponse: String,
        expectedResponse: String,
        score: Number,
        duration: Number,
        startTime: Date,
        endTime: Date,
        errorMessages: [String],
        metadata: Object,
      },
    ],
    default: [],
  })
  stepResults!: StepResult[];

  @Prop({
    type: {
      callId: String,
      phoneNumber: String,
      recordingUrl: String,
      transcription: String,
      providerCallId: String,
      origin: { type: String, enum: ['simulation', 'real'] },
      duration: Number,
      cost: Number,
      startTime: Date,
      endTime: Date,
    },
  })
  callDetails?: CallDetails;

  @Prop({
    type: {
      responseTime: Number,
      accuracy: Number,
      completion: Number,
      satisfaction: Number,
      customMetrics: Object,
      totalSteps: Number,
      completedSteps: Number,
      failedSteps: Number,
      skippedSteps: Number,
    },
  })
  metrics?: ExecutionMetrics;

  @Prop({ type: [String], default: [] })
  errorMessages!: string[];

  @Prop({ type: Object, required: false })
  errorMetadata?: {
    errorCode?: string;
    platform?: string;
    recoverySteps?: string[];
    helpUrl?: string;
    timestamp?: Date;
  };

  @Prop({ type: [String], default: [] })
  logs!: string[];

  @Prop({ type: Object, default: {} })
  parameters!: Record<string, any>;

  @Prop({ required: true })
  triggeredBy!: string;

  @Prop({ required: false, type: Types.ObjectId, ref: 'Trigger' })
  triggerId?: Types.ObjectId;

  @Prop({ default: 0 })
  retryAttempt?: number;

  @Prop({ required: false, type: Types.ObjectId, ref: 'ScenarioExecution' })
  parentExecutionId?: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId, ref: 'ScenarioExecution' })
  dependsOnExecutionId?: Types.ObjectId;

  @Prop()
  queuedBy?: string;

  @Prop({ type: Object })
  metadata?: {
    llmCalls?: Array<{
      timestamp: Date;
      model: string;
      tokens: number;
    }>;
    [key: string]: any;
  };

  @Prop({ type: Number, default: 0 })
  creditsConsumed?: number;

  @Prop({ type: Boolean, default: false })
  creditReported?: boolean;

  @Prop({ type: Date })
  creditReportedAt?: Date;

  @Prop({
    type: {
      version: String,
      environment: String,
      userAgent: String,
      ip: String,
    },
  })
  environment?: {
    version: string;
    environment: string;
    userAgent?: string;
    ip?: string;
  };

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Improvement' }] })
  improvementIds?: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'ScheduledExecution' })
  scheduledExecutionId?: Types.ObjectId;

  @Prop({
    type: {
      isRetry: Boolean,
      retryCount: Number,
      originalExecutionId: String,
      retryReason: String,
    },
  })
  retryInfo?: {
    isRetry: boolean;
    retryCount: number;
    originalExecutionId: string;
    retryReason: string;
  };

  @Prop({ type: Date })
  createdAt!: Date;

  @Prop({ type: Date })
  updatedAt!: Date;
}

export const ScenarioExecutionSchema =
  SchemaFactory.createForClass(ScenarioExecution);

// Add indexes for better query performance
ScenarioExecutionSchema.index({ scenarioId: 1, status: 1 });
ScenarioExecutionSchema.index({ workspaceId: 1, startTime: -1 });
ScenarioExecutionSchema.index({ executionId: 1 }, { unique: true });
ScenarioExecutionSchema.index({ agentId: 1, status: 1 });
ScenarioExecutionSchema.index({ personaId: 1, status: 1 });
ScenarioExecutionSchema.index({ scorecardId: 1, status: 1 });
ScenarioExecutionSchema.index({ scenarioId: 1, personaId: 1, agentId: 1 });
ScenarioExecutionSchema.index({ parentExecutionId: 1 });
ScenarioExecutionSchema.index({ dependsOnExecutionId: 1, status: 1 });
ScenarioExecutionSchema.index({ creditReported: 1, creditReportedAt: 1 });
ScenarioExecutionSchema.index({ triggeredBy: 1 });
ScenarioExecutionSchema.index({ 'callDetails.providerCallId': 1 });
ScenarioExecutionSchema.index({ status: 1, startTime: 1 });
ScenarioExecutionSchema.index({ scheduledExecutionId: 1 });

// Apply virtual ID plugin to transform _id -> id in responses
ScenarioExecutionSchema.plugin(virtualIdPlugin);
