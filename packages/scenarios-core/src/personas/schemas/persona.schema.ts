import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PersonaDocument = Persona & Document;

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
  collection: 'personas',
  timestamps: true,
})
export class Persona {
  @Prop({ required: true })
  name!: string;

  @Prop({
    required: true,
    enum: ['male', 'female'],
  })
  gender!: string;

  @Prop({
    required: true,
    enum: [
      'friendly',
      'distracted',
      'polite',
      'concerned',
      'stressed',
      'annoyed',
      'neutral',
      'calm',
      'frustrated',
      'curious',
      'irritated',
    ],
  })
  emotion!: string;

  @Prop({
    required: true,
    enum: ['english', 'spanish', 'portuguese'],
  })
  language!: string;

  @Prop({
    required: true,
    enum: [
      'american',
      'british',
      'australian',
      'canadian',
      'irish',
      'scottish',
      'mexican',
      'argentinian',
      'colombian',
      'brazilian',
      'portuguese',
      'other',
    ],
  })
  accent!: string;

  @Prop({
    required: true,
    enum: [
      'very clear',
      'slightly unclear',
      'slurred',
      'slightly slurred',
      'mumbled',
      'unclear',
    ],
  })
  intentClarity!: string;

  @Prop({
    required: true,
    enum: ['slow', 'fast', 'normal', 'moderate'],
  })
  speechStyle!: string;

  @Prop({ required: true, default: false })
  backgroundNoise!: boolean;

  @Prop({ required: true, default: false })
  allowInterruptions!: boolean;

  @Prop()
  description?: string;

  @Prop()
  backstory?: string;

  // Voice Characteristics (enhanced)
  @Prop({
    type: {
      gender: { type: String, enum: ['male', 'female', 'non-binary'] },
      age: { type: String, enum: ['young', 'middle-aged', 'elderly'] },
      accent: { type: String },
      clarity: {
        type: String,
        enum: ['very clear', 'slightly unclear', 'slurred', 'mumbled'],
      },
      pace: {
        type: String,
        enum: ['very slow', 'slow', 'normal', 'fast', 'very fast'],
      },
      volume: { type: String, enum: ['quiet', 'normal', 'loud'] },
      tone: { type: String, enum: ['monotone', 'expressive', 'animated'] },
      voiceId: { type: String },
      provider: { type: String, enum: ['elevenlabs', 'azure', 'google'] },
    },
    required: false,
  })
  voice?: {
    gender?: string;
    age?: string;
    accent?: string;
    clarity?: string;
    pace?: string;
    volume?: string;
    tone?: string;
    voiceId?: string;
    provider?: string;
  };

  // Behavioral Traits
  @Prop({
    type: {
      personality: {
        type: String,
        enum: ['friendly', 'professional', 'assertive', 'passive', 'demanding'],
      },
      emotionalState: {
        type: String,
        enum: [
          'calm',
          'neutral',
          'concerned',
          'frustrated',
          'angry',
          'distressed',
        ],
      },
      cooperationLevel: {
        type: String,
        enum: [
          'very cooperative',
          'cooperative',
          'neutral',
          'difficult',
          'hostile',
        ],
      },
      patience: {
        type: String,
        enum: [
          'very patient',
          'patient',
          'neutral',
          'impatient',
          'very impatient',
        ],
      },
      communicationStyle: {
        type: String,
        enum: ['direct', 'indirect', 'verbose', 'concise', 'rambling'],
      },
    },
    required: false,
  })
  behavior?: {
    personality?: string;
    emotionalState?: string;
    cooperationLevel?: string;
    patience?: string;
    communicationStyle?: string;
  };

  // Conversation Patterns
  @Prop({
    type: {
      allowInterruptions: { type: Boolean },
      interruptionFrequency: {
        type: String,
        enum: ['rarely', 'sometimes', 'often'],
      },
      asksClarifyingQuestions: { type: Boolean },
      repeatsInformation: { type: Boolean },
      goesOffTopic: { type: Boolean },
    },
    required: false,
  })
  conversationTraits?: {
    allowInterruptions?: boolean;
    interruptionFrequency?: string;
    asksClarifyingQuestions?: boolean;
    repeatsInformation?: boolean;
    goesOffTopic?: boolean;
  };

  // Environmental Factors
  @Prop({
    type: {
      backgroundNoise: { type: Boolean },
      noiseType: {
        type: String,
        enum: ['traffic', 'office', 'cafe', 'home', 'outdoor'],
      },
      connectionQuality: {
        type: String,
        enum: ['excellent', 'good', 'poor', 'very poor'],
      },
    },
    required: false,
  })
  environment?: {
    backgroundNoise?: boolean;
    noiseType?: string;
    connectionQuality?: string;
  };

  // Variables: Support both old (Record<string, string>) and new (structured array) formats
  @Prop({ type: Object, default: {} })
  variables!:
    | Record<string, string>
    | Array<{
        key: string;
        label: string;
        type: 'text' | 'number' | 'date' | 'boolean' | 'select';
        defaultValue?: any;
        required: boolean;
        options?: string[];
        description?: string;
      }>;

  @Prop()
  voiceId?: string;

  @Prop({ enum: ['elevenlabs', 'azure', 'google', 'chanl'] })
  voiceProvider?: string;

  /**
   * Optional agent reference for persona-as-agent pattern.
   * When set, this persona can act as an agent in text/voice conversations.
   */
  @Prop({ type: Types.ObjectId, ref: 'Agent' })
  agentId?: Types.ObjectId;

  /**
   * Persona-specific agent configuration for testing scenarios.
   * Used when persona acts as an agent in conversations.
   */
  @Prop({
    type: {
      promptTemplate: { type: String },
      voice: {
        type: Object,
        properties: {
          voiceId: { type: String },
          provider: {
            type: String,
            enum: ['elevenlabs', 'azure', 'google', 'cartesia'],
          },
        },
      },
      behavior: {
        type: Object,
        properties: {
          interruptionFrequency: {
            type: String,
            enum: ['never', 'rare', 'frequent'],
          },
          responseSpeed: { type: String, enum: ['slow', 'normal', 'fast'] },
          verbosity: { type: String, enum: ['terse', 'normal', 'verbose'] },
        },
      },
    },
  })
  agentConfig?: {
    promptTemplate?: string;
    voice?: {
      voiceId?: string;
      provider?: 'elevenlabs' | 'azure' | 'google' | 'cartesia';
    };
    behavior?: {
      interruptionFrequency?: 'never' | 'rare' | 'frequent';
      responseSpeed?: 'slow' | 'normal' | 'fast';
      verbosity?: 'terse' | 'normal' | 'verbose';
    };
  };

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: false })
  isDefault!: boolean;

  @Prop({ default: 'local' })
  createdBy!: string;

  @Prop()
  lastModifiedBy?: string;

  @Prop({ type: Date })
  createdAt!: Date;

  @Prop({ type: Date })
  updatedAt!: Date;
}

export const PersonaSchema = SchemaFactory.createForClass(Persona);

// Add indexes for better query performance
PersonaSchema.index({ isActive: 1 });
PersonaSchema.index({ emotion: 1 });
PersonaSchema.index({ language: 1 });
PersonaSchema.index({ gender: 1 });
PersonaSchema.index({ accent: 1 });
PersonaSchema.index({ createdBy: 1 });
PersonaSchema.index({ tags: 1 });

// Apply virtual ID plugin to transform _id to id in responses
PersonaSchema.plugin(virtualIdPlugin);
