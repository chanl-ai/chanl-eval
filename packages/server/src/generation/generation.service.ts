import { Injectable, Logger } from '@nestjs/common';
import {
  generateTestSuite,
  GenerateRequest,
  GeneratedSuite,
  ScenarioService,
  PersonaService,
} from '@chanl/scenarios-core';
import { ScorecardsService } from '@chanl/scorecards-core';
import { SettingsService } from '../settings/settings.service';
import type { SettingsDocument } from '../settings/settings.schema';

export interface PersistSuiteResult {
  scenarioIds: string[];
  personaIds: string[];
  scorecardId: string | null;
  summary: string;
  domain: string;
}

/** Extract the string ID from a Mongoose document regardless of shape. */
function docId(doc: unknown): string | null {
  if (!doc || typeof doc !== 'object') return null;
  const d = doc as Record<string, unknown>;
  if (typeof d.id === 'string') return d.id;
  if (d._id && typeof (d._id as Record<string, unknown>).toString === 'function') {
    return (d._id as Record<string, unknown>).toString() as string;
  }
  return null;
}

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly scenarioService: ScenarioService,
    private readonly personaService: PersonaService,
    private readonly scorecardsService: ScorecardsService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Generate a test suite from an agent's system prompt (preview only, no persistence).
   */
  async generatePreview(request: GenerateRequest): Promise<GeneratedSuite> {
    const enriched = await this.enrichWithSettings(request);
    return generateTestSuite(enriched);
  }

  /**
   * Generate and persist a full test suite (scenarios + personas + scorecard).
   */
  async generateAndPersist(request: GenerateRequest): Promise<PersistSuiteResult> {
    const enriched = await this.enrichWithSettings(request);
    const suite = await generateTestSuite(enriched);

    // 1. Create personas first (scenarios reference them)
    const personaIds: string[] = [];
    for (const p of suite.personas) {
      try {
        const created = await this.personaService.create(p, 'auto-generate');
        const id = docId(created);
        if (id) personaIds.push(id);
      } catch (err) {
        this.logger.warn(`Failed to create persona "${p.name}": ${err}`);
      }
    }

    // 2. Create scorecard with categories and criteria
    let scorecardId: string | null = null;
    try {
      const scorecard = await this.scorecardsService.createScorecard({
        name: suite.scorecard.name,
        description: suite.scorecard.description,
        status: 'active',
        passingThreshold: 70,
        scoringAlgorithm: 'weighted_average',
        tags: ['auto-generated'],
      });

      scorecardId = docId(scorecard);

      if (scorecardId && suite.scorecard.criteria.length > 0) {
        const category = await this.scorecardsService.createCategory(scorecardId, {
          name: 'Auto-Generated Criteria',
          description: `Evaluation criteria for ${suite.domain}`,
        });
        const categoryId = docId(category);

        if (categoryId) {
          for (const c of suite.scorecard.criteria) {
            try {
              await this.scorecardsService.createCriteria(scorecardId, categoryId, {
                categoryId,
                key: c.key,
                name: c.name,
                description: c.description,
                type: c.type,
                settings: c.settings,
                threshold: c.threshold,
              });
            } catch (err) {
              this.logger.warn(`Failed to create criterion "${c.key}": ${err}`);
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to create scorecard: ${err}`);
    }

    // 3. Create scenarios, linking personas and scorecard
    const scenarioIds: string[] = [];
    for (let i = 0; i < suite.scenarios.length; i++) {
      const s = suite.scenarios[i];
      const scenarioPersonaIds = personaIds[i] ? [personaIds[i]] : personaIds.slice(0, 1);

      try {
        const created = await this.scenarioService.create(
          {
            name: s.name,
            description: s.description,
            prompt: s.prompt,
            category: s.category,
            difficulty: s.difficulty as 'easy' | 'medium' | 'hard',
            tags: [...(s.tags || []), 'auto-generated'],
            context: s.context,
            groundTruth: s.groundTruth,
            personaIds: scenarioPersonaIds,
            scorecardId: scorecardId || undefined,
            status: 'active',
          },
          'auto-generate',
        );
        const id = docId(created);
        if (id) scenarioIds.push(id);
      } catch (err) {
        this.logger.warn(`Failed to create scenario "${s.name}": ${err}`);
      }
    }

    return {
      scenarioIds,
      personaIds,
      scorecardId,
      summary: suite.summary,
      domain: suite.domain,
    };
  }

  /**
   * Enrich request with LLM settings from DB if not provided in request.
   */
  private async enrichWithSettings(request: GenerateRequest): Promise<GenerateRequest> {
    if (request.adapterConfig?.apiKey) return request;

    try {
      const settings: SettingsDocument = await this.settingsService.get();
      if (!settings) return request;

      const keys = settings.providerKeys || {};
      const apiKey = keys.openai || keys.anthropic || keys.http;
      const provider = keys.anthropic && !keys.openai ? 'anthropic' : 'openai';

      if (apiKey) {
        return {
          ...request,
          adapterType: request.adapterType || provider,
          adapterConfig: {
            ...request.adapterConfig,
            apiKey,
          },
        };
      }
    } catch {
      // Settings not available — fall through to env vars
    }
    return request;
  }
}
