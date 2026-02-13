import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  IsObject,
} from 'class-validator';

export class CreatePersonaDto {
  @IsString()
  name!: string;

  @IsEnum(['male', 'female'])
  gender!: string;

  @IsEnum([
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
  ])
  emotion!: string;

  @IsEnum(['english', 'spanish', 'portuguese'])
  language!: string;

  @IsEnum([
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
  ])
  accent!: string;

  @IsEnum([
    'very clear',
    'slightly unclear',
    'slurred',
    'slightly slurred',
    'mumbled',
    'unclear',
  ])
  intentClarity!: string;

  @IsEnum(['slow', 'fast', 'normal', 'moderate'])
  speechStyle!: string;

  @IsBoolean()
  backgroundNoise!: boolean;

  @IsBoolean()
  allowInterruptions!: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  backstory?: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @IsOptional()
  @IsString()
  voiceId?: string;

  @IsOptional()
  @IsEnum(['elevenlabs', 'azure', 'google', 'chanl'])
  voiceProvider?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsObject()
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

  @IsOptional()
  @IsObject()
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

  @IsOptional()
  @IsObject()
  behavior?: {
    personality?: string;
    emotionalState?: string;
    cooperationLevel?: string;
    patience?: string;
    communicationStyle?: string;
  };

  @IsOptional()
  @IsObject()
  conversationTraits?: {
    allowInterruptions?: boolean;
    interruptionFrequency?: string;
    asksClarifyingQuestions?: boolean;
    repeatsInformation?: boolean;
    goesOffTopic?: boolean;
  };

  @IsOptional()
  @IsObject()
  environment?: {
    backgroundNoise?: boolean;
    noiseType?: string;
    connectionQuality?: string;
  };
}
