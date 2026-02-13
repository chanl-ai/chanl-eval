import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

// Read version from package.json at startup
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../package.json');

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health check' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: pkg.version || '0.1.0',
    };
  }
}
