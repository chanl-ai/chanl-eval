import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { GenerationService } from './generation.service';

@Controller('generation')
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  /**
   * Generate a test suite preview (no persistence).
   * Returns the generated scenarios, personas, and scorecard for review.
   */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async preview(
    @Body()
    dto: {
      systemPrompt: string;
      count?: number;
      difficulties?: ('easy' | 'medium' | 'hard')[];
      includeAdversarial?: boolean;
      domain?: string;
    },
  ) {
    if (!dto.systemPrompt?.trim()) {
      throw new BadRequestException('systemPrompt is required');
    }
    const suite = await this.generationService.generatePreview({
      systemPrompt: dto.systemPrompt,
      count: dto.count,
      difficulties: dto.difficulties,
      includeAdversarial: dto.includeAdversarial,
      domain: dto.domain,
    });
    return { suite };
  }

  /**
   * Generate and persist a full test suite.
   * Creates scenarios, personas, and scorecard in the database.
   */
  @Post('from-prompt')
  @HttpCode(HttpStatus.CREATED)
  async fromPrompt(
    @Body()
    dto: {
      systemPrompt: string;
      count?: number;
      difficulties?: ('easy' | 'medium' | 'hard')[];
      includeAdversarial?: boolean;
      domain?: string;
    },
  ) {
    if (!dto.systemPrompt?.trim()) {
      throw new BadRequestException('systemPrompt is required');
    }
    const result = await this.generationService.generateAndPersist({
      systemPrompt: dto.systemPrompt,
      count: dto.count,
      difficulties: dto.difficulties,
      includeAdversarial: dto.includeAdversarial,
      domain: dto.domain,
    });
    return { result };
  }
}
