import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { PersonaService, Persona } from '@chanl/scenarios-core';
import { ScenarioService } from '@chanl/scenarios-core';
import { ScorecardsService } from '@chanl/scorecards-core';
import { ApiKeyService } from '../auth/api-key.service';

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);
  private seeded = false;

  constructor(
    private readonly personaService: PersonaService,
    private readonly scenarioService: ScenarioService,
    private readonly scorecardsService: ScorecardsService,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  get isSeeded(): boolean {
    return this.seeded;
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (error: any) {
      this.logger.error(
        `Bootstrap seeding failed: ${error.message}`,
        error.stack,
      );
      // Never crash the server — just log and continue
    }
  }

  private async seed(): Promise<void> {
    const summary: string[] = [];

    // 1. Bootstrap API key if none exist
    const hasKeys = await this.apiKeyService.hasAnyKeys();
    if (!hasKeys) {
      const apiKey = await this.apiKeyService.createApiKey('bootstrap');
      this.logger.log('');
      this.logger.log('='.repeat(60));
      this.logger.log('  Bootstrap API Key (save this, shown only once):');
      this.logger.log(`  ${apiKey.key}`);
      this.logger.log('='.repeat(60));
      this.logger.log('');
      summary.push('1 API key');
    }

    // 2. Seed default personas
    const personas = await this.personaService.createDefaultPersonas(
      'system',
    );
    summary.push(`${personas.length} personas`);

    // 3. Seed default scorecard
    const scorecardId =
      await this.scorecardsService.createDefaultScorecardIfNeeded();
    if (scorecardId) {
      summary.push('1 scorecard');
    }

    // 4. Seed default scenarios referencing personas + scorecard
    const personaMap: Record<string, string> = {};
    for (const p of personas) {
      // Mongoose documents have .id (virtual) and ._id — Persona type omits them
      const doc = p as Persona & { id?: string; _id?: { toString(): string } };
      const pid = doc.id || doc._id?.toString();
      if (pid) {
        personaMap[p.name] = pid.toString();
      }
    }

    const scenarios = await this.scenarioService.createDefaultScenarios(
      personaMap,
      scorecardId?.toString(),
    );
    summary.push(`${scenarios.length} scenarios`);

    this.seeded = true;

    if (summary.length > 0) {
      this.logger.log(`Seeded: ${summary.join(', ')}`);
    }
  }
}
