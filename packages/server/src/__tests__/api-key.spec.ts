import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApiKeyService } from '../auth/api-key.service';
import { ApiKeyController } from '../auth/api-key.controller';
import { ApiKey } from '../auth/api-key.schema';

// Mock Mongoose model
function createMockModel() {
  const mockDoc = {
    id: 'test-id-123',
    key: 'eval_abc123def456',
    name: 'Test Key',
    isActive: true,
    save: jest.fn().mockReturnThis(),
  };

  const Model: any = jest.fn().mockImplementation(() => mockDoc);
  Model.findOne = jest.fn().mockReturnValue({
    lean: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    }),
  });
  Model.find = jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
    }),
  });
  Model.findByIdAndUpdate = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue(null),
  });
  Model.countDocuments = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue(0),
  });

  return { Model, mockDoc };
}

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let mockModel: ReturnType<typeof createMockModel>;

  beforeEach(async () => {
    mockModel = createMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        {
          provide: getModelToken(ApiKey.name),
          useValue: mockModel.Model,
        },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
  });

  describe('createApiKey', () => {
    it('should create a key with eval_ prefix', async () => {
      const result = await service.createApiKey('Test');
      expect(result.key).toMatch(/^eval_/);
      expect(result.save).toHaveBeenCalled();
    });
  });

  describe('validateKey', () => {
    it('should return false for unknown key', async () => {
      const result = await service.validateKey('invalid-key');
      expect(result).toBe(false);
    });

    it('should return true for valid key', async () => {
      mockModel.Model.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ key: 'eval_valid', isActive: true }),
        }),
      });
      const result = await service.validateKey('eval_valid');
      expect(result).toBe(true);
    });
  });

  describe('hasAnyKeys', () => {
    it('should return false when no keys exist', async () => {
      const result = await service.hasAnyKeys();
      expect(result).toBe(false);
    });

    it('should return true when keys exist', async () => {
      mockModel.Model.countDocuments = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(2),
      });
      const result = await service.hasAnyKeys();
      expect(result).toBe(true);
    });
  });

  describe('deactivateApiKey', () => {
    it('should call findByIdAndUpdate with isActive false', async () => {
      mockModel.Model.findByIdAndUpdate = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          id: 'test-id',
          isActive: false,
        }),
      });
      const result = await service.deactivateApiKey('test-id');
      expect(result).toBeTruthy();
      expect(result!.isActive).toBe(false);
      expect(mockModel.Model.findByIdAndUpdate).toHaveBeenCalledWith(
        'test-id',
        { isActive: false },
        { new: true },
      );
    });
  });
});

describe('ApiKeyController', () => {
  let controller: ApiKeyController;
  let service: ApiKeyService;

  beforeEach(async () => {
    const { Model } = createMockModel();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeyController],
      providers: [
        ApiKeyService,
        {
          provide: getModelToken(ApiKey.name),
          useValue: Model,
        },
      ],
    }).compile();

    controller = module.get<ApiKeyController>(ApiKeyController);
    service = module.get<ApiKeyService>(ApiKeyService);
  });

  describe('create (bootstrap)', () => {
    it('should create key when no keys exist', async () => {
      jest.spyOn(service, 'hasAnyKeys').mockResolvedValue(false);

      const result = await controller.create({ name: 'First Key' });
      expect(result.key).toMatch(/^eval_/);
      expect(result.message).toContain('Store this key');
    });

    it('should throw ForbiddenException when keys already exist', async () => {
      jest.spyOn(service, 'hasAnyKeys').mockResolvedValue(true);

      await expect(controller.create({ name: 'Second Key' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('deactivate', () => {
    it('should throw NotFoundException for unknown id', async () => {
      jest.spyOn(service, 'deactivateApiKey').mockResolvedValue(null);

      await expect(controller.deactivate('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
