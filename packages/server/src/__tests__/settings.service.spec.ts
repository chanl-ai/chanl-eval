import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Model } from 'mongoose';
import { SettingsService, MASK_PREFIX } from '../settings/settings.service';
import {
  Settings,
  SettingsSchema,
  SettingsDocument,
  SETTINGS_SINGLETON_KEY,
} from '../settings/settings.schema';

/**
 * Exercised against a real database. Every property here concerns how Mongo behaves under
 * concurrency or on pre-existing data, which a mocked model cannot demonstrate.
 */
describe('SettingsService', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let service: SettingsService;
  let model: Model<SettingsDocument>;
  let connection: Connection;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: Settings.name, schema: SettingsSchema }]),
      ],
      providers: [SettingsService],
    }).compile();
    await module.init();

    service = module.get(SettingsService);
    model = module.get(getModelToken(Settings.name));
    connection = module.get<Connection>(getConnectionToken());
    await model.init();
  }, 120_000);

  afterAll(async () => {
    await module?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
    delete process.env.CHANL_OPENAI_API_KEY;
    delete process.env.CHANL_ANTHROPIC_API_KEY;
  });

  describe('singleton guarantee', () => {
    it('creates exactly one document on first access', async () => {
      await service.get();
      expect(await model.countDocuments({})).toBe(1);
    });

    it('converges on one document when several callers race', async () => {
      // The defect this replaced: findOne() then create() is a check-then-act that concurrent
      // boots both pass, producing two settings documents and making getApiKey non-deterministic.
      await Promise.all(Array.from({ length: 8 }, () => service.get()));
      expect(await model.countDocuments({})).toBe(1);
    });

    it('is enforced by the database, not only by application logic', async () => {
      await service.get();
      await expect(
        model.collection.insertOne({ key: SETTINGS_SINGLETON_KEY }),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it('adopts a document written before the singleton key existed', async () => {
      // Upgrade path: a pre-existing document holds the user's saved keys. Creating a fresh one
      // beside it would silently abandon them.
      await model.collection.insertOne({
        providerKeys: { openai: 'sk-legacy-value' },
      });

      const settings = await service.get();

      expect(await model.countDocuments({})).toBe(1);
      expect(settings.key).toBe(SETTINGS_SINGLETON_KEY);
      expect(await service.getApiKey('openai')).toBe('sk-legacy-value');
    });
  });

  describe('provider keys', () => {
    it('merges per provider rather than replacing the map', async () => {
      // Saving one provider used to delete the other.
      await service.update({ providerKeys: { openai: 'sk-openai' } });
      await service.update({ providerKeys: { anthropic: 'sk-anthropic' } });

      expect(await service.getApiKey('openai')).toBe('sk-openai');
      expect(await service.getApiKey('anthropic')).toBe('sk-anthropic');
    });

    it('rejects a masked value so an echoed form field cannot overwrite a real key', async () => {
      await service.update({ providerKeys: { openai: 'sk-real-key-value' } });

      await service.update({
        providerKeys: { openai: `${MASK_PREFIX}alue` },
      });

      expect(await service.getApiKey('openai')).toBe('sk-real-key-value');
    });

    it('clears a key when given an empty string', async () => {
      await service.update({ providerKeys: { openai: 'sk-real' } });
      await service.update({ providerKeys: { openai: '' } });
      expect(await service.getApiKey('openai')).toBeUndefined();
    });

    it('falls back to the environment when nothing is stored', async () => {
      process.env.CHANL_OPENAI_API_KEY = 'sk-from-env';
      expect(await service.getApiKey('openai')).toBe('sk-from-env');
    });

    it('prefers a stored key over the environment', async () => {
      process.env.CHANL_OPENAI_API_KEY = 'sk-from-env';
      await service.update({ providerKeys: { openai: 'sk-stored' } });
      expect(await service.getApiKey('openai')).toBe('sk-stored');
    });
  });

  describe('key sources', () => {
    it('reports where each provider key resolves from', async () => {
      await service.update({ providerKeys: { openai: 'sk-stored' } });
      process.env.CHANL_ANTHROPIC_API_KEY = 'sk-env';

      const sources = await service.getKeySources();

      expect(sources).toMatchObject({ openai: 'settings', anthropic: 'env' });
    });

    it('reports null when a provider has no key anywhere', async () => {
      const sources = await service.getKeySources();
      expect(sources).toMatchObject({ openai: null, anthropic: null });
    });
  });

  describe('simulation base url', () => {
    it('returns the stored value', async () => {
      await service.update({ simulationBaseUrl: 'http://localhost:11434/v1' });
      expect(await service.getSimulationBaseUrl()).toBe('http://localhost:11434/v1');
    });

    it('lets the environment override the stored value', async () => {
      // An operator pinning a host for a deployment should win over whatever is in the database.
      await service.update({ simulationBaseUrl: 'http://stored' });
      process.env.CHANL_SIMULATION_BASE_URL = 'http://from-env';

      expect(await service.getSimulationBaseUrl()).toBe('http://from-env');

      delete process.env.CHANL_SIMULATION_BASE_URL;
    });
  });

  it('keeps the unique index that backs the singleton', async () => {
    const indexes = await connection.collection('settings').indexes();
    expect(indexes.some((i) => i.unique === true && i.key && 'key' in i.key)).toBe(true);
  });
});
