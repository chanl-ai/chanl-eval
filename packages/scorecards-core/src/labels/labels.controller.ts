import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsOptional,
  IsString,
  MaxLength,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { LabelsService } from './labels.service';

/**
 * A human verdict is a boolean (pass/fail criteria) or a 0-10 number (score criteria).
 * class-validator has no union primitive, and leaving the field undecorated is not an option: the
 * global ValidationPipe runs with forbidNonWhitelisted, so an undecorated property is rejected
 * outright rather than passed through.
 */
function IsHumanVerdict(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isHumanVerdict',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value === 'boolean') return true;
          return typeof value === 'number' && Number.isFinite(value);
        },
        defaultMessage() {
          return 'humanResult must be a boolean (pass/fail criteria) or a number 0-10 (score criteria)';
        },
      },
    });
  };
}

export class CreateLabelDto {
  @IsString()
  scorecardResultId!: string;

  @IsString()
  criteriaId!: string;

  /**
   * The human verdict. Boolean criteria take true/false; score criteria take 0-10.
   * The service normalizes and clamps it against the criterion's actual evaluation type.
   */
  @IsHumanVerdict()
  humanResult!: boolean | number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  labeledBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class AgreementQueryDto {
  @IsOptional()
  @IsString()
  scorecardId?: string;

  @IsOptional()
  @IsString()
  criteriaKey?: string;

  @IsOptional()
  @IsString()
  labeledBy?: string;
}

/**
 * Human-in-the-loop benchmarking: record what a person thinks of each criterion verdict, and report
 * how well the LLM judge matches them.
 */
@Controller('labels')
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Post()
  async create(@Body() dto: CreateLabelDto) {
    const label = await this.labelsService.upsert(dto);
    return { label: label.toJSON() };
  }

  /** Agreement report. Declared before :resultId so "agreement" is not read as a result id. */
  @Get('agreement')
  async agreement(@Query() query: AgreementQueryDto) {
    return this.labelsService.agreement(query);
  }

  @Get('result/:resultId')
  async listForResult(@Param('resultId') resultId: string) {
    const labels = await this.labelsService.listForResult(resultId);
    return { labels: labels.map((l) => l.toJSON()), total: labels.length };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.labelsService.delete(id);
    return { deleted: true };
  }
}
