/**
 * Generation Module
 *
 * SDK module for auto-generating test suites from agent system prompts.
 */

import type { AxiosInstance } from 'axios';
import { unwrapResponse } from '../client';

export interface GenerateOptions {
  systemPrompt: string;
  count?: number;
  difficulties?: ('easy' | 'medium' | 'hard')[];
  includeAdversarial?: boolean;
  domain?: string;
}

export interface GeneratedScenario {
  name: string;
  description: string;
  prompt: string;
  category: string;
  difficulty: string;
  tags: string[];
  context?: {
    situation?: string;
    objective?: string;
    background?: string;
    constraints?: string[];
  };
  groundTruth?: string;
}

export interface GeneratedPersona {
  name: string;
  gender: string;
  emotion: string;
  description: string;
  backstory: string;
  behavior: {
    personality: string;
    cooperationLevel: string;
    patience: string;
    communicationStyle: string;
  };
  tags: string[];
}

export interface GeneratedCriterion {
  key: string;
  name: string;
  description: string;
  type: string;
  settings: Record<string, any>;
  threshold?: Record<string, any>;
}

export interface GeneratedScorecard {
  name: string;
  description: string;
  criteria: GeneratedCriterion[];
}

export interface GeneratedSuite {
  scenarios: GeneratedScenario[];
  personas: GeneratedPersona[];
  scorecard: GeneratedScorecard;
  summary: string;
  domain: string;
}

export interface PersistResult {
  scenarioIds: string[];
  personaIds: string[];
  scorecardId: string | null;
  summary: string;
  domain: string;
}

export class GenerationModule {
  constructor(private readonly http: AxiosInstance) {}

  /**
   * Generate a test suite preview without saving to the database.
   */
  async preview(options: GenerateOptions): Promise<GeneratedSuite> {
    const response = await this.http.post('/generation/preview', options);
    const data = unwrapResponse<any>(response);
    return data.suite;
  }

  /**
   * Generate and persist a full test suite (scenarios + personas + scorecard).
   */
  async fromPrompt(options: GenerateOptions): Promise<PersistResult> {
    const response = await this.http.post('/generation/from-prompt', options);
    const data = unwrapResponse<any>(response);
    return data.result;
  }
}
