import { PartialType } from '@nestjs/mapped-types';
import { CreateToolFixtureDto } from './create-tool-fixture.dto';

export class UpdateToolFixtureDto extends PartialType(CreateToolFixtureDto) {}
