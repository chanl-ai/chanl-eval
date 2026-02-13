import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../health/health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return status ok', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeDefined();
    expect(result.version).toBeDefined();
  });

  it('should return a valid ISO timestamp', () => {
    const result = controller.check();
    const date = new Date(result.timestamp);
    expect(date.toISOString()).toBe(result.timestamp);
  });
});
