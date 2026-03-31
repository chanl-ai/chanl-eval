import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import {
  ScenarioTemplateService,
  getBuiltInTemplates,
} from '../scenario-template.service';
import {
  ScenarioTemplate,
  ScenarioTemplateSchema,
  ScenarioTemplateDocument,
} from '../schemas/scenario-template.schema';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
});

afterAll(async () => {
  await mongod.stop();
});

describe('ScenarioTemplateService', () => {
  let service: ScenarioTemplateService;
  let module: TestingModule;
  let templateModel: Model<any>;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri(), {
          dbName: `template_test_${Date.now()}`,
        }),
        MongooseModule.forFeature([
          { name: ScenarioTemplate.name, schema: ScenarioTemplateSchema },
        ]),
      ],
      providers: [ScenarioTemplateService],
    }).compile();

    service = module.get<ScenarioTemplateService>(ScenarioTemplateService);
    templateModel = module.get<Model<any>>(
      getModelToken(ScenarioTemplate.name),
    );
  });

  afterEach(async () => {
    await module?.close();
  });

  describe('create()', () => {
    it('should create a template', async () => {
      const tmpl = await service.create({
        name: 'Test Template',
        category: 'support',
        prompt: 'Hello {{name}}, how can I help?',
        variables: [
          {
            name: 'name',
            type: 'string',
            required: true,
            defaultValue: 'Customer',
          },
        ],
      });

      expect(tmpl.name).toBe('Test Template');
      expect(tmpl.category).toBe('support');
      expect(tmpl.status).toBe('published');
      expect(tmpl.variables).toHaveLength(1);
    });

    it('should create with createdBy', async () => {
      const tmpl = await service.create(
        { name: 'WS Template', category: 'sales', prompt: 'Test' },
        'system',
      );
      expect(tmpl.name).toBe('WS Template');
    });

    it('should create without createdBy (OSS mode)', async () => {
      const tmpl = await service.create({
        name: 'OSS Template',
        category: 'custom',
        prompt: 'Test',
      });
      expect(tmpl.name).toBe('OSS Template');
    });
  });

  describe('findAll()', () => {
    it('should return paginated templates', async () => {
      await service.create({
        name: 'T1',
        category: 'support',
        prompt: 'P1',
      });
      await service.create({
        name: 'T2',
        category: 'sales',
        prompt: 'P2',
      });

      const result = await service.findAll();
      expect(result.templates).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by category', async () => {
      await service.create({
        name: 'Support',
        category: 'support',
        prompt: 'P1',
      });
      await service.create({
        name: 'Sales',
        category: 'sales',
        prompt: 'P2',
      });

      const result = await service.findAll({ category: 'support' });
      expect(result.templates).toHaveLength(1);
      expect(result.templates[0].name).toBe('Support');
    });

    it('should search by name', async () => {
      await service.create({
        name: 'Refund Request',
        category: 'support',
        prompt: 'P1',
      });
      await service.create({
        name: 'Sales Inquiry',
        category: 'sales',
        prompt: 'P2',
      });

      const result = await service.findAll({ search: 'refund' });
      expect(result.templates).toHaveLength(1);
      expect(result.templates[0].name).toBe('Refund Request');
    });

    it('should paginate', async () => {
      for (let i = 0; i < 5; i++) {
        await service.create({
          name: `T${i}`,
          category: 'support',
          prompt: `P${i}`,
        });
      }

      const result = await service.findAll({}, { page: 1, limit: 2 });
      expect(result.templates).toHaveLength(2);
      expect(result.total).toBe(5);
    });
  });

  describe('findOne()', () => {
    it('should find a template by ID', async () => {
      const created = await service.create({
        name: 'Find Me',
        category: 'support',
        prompt: 'Test',
      });

      const found = await service.findOne(created._id!.toString());
      expect(found.name).toBe('Find Me');
    });

    it('should throw NotFoundException for non-existent ID', async () => {
      const fakeId = new Types.ObjectId().toString();
      await expect(service.findOne(fakeId)).rejects.toThrow(/not found/);
    });
  });

  describe('update()', () => {
    it('should update template fields', async () => {
      const created = await service.create({
        name: 'Original',
        category: 'support',
        prompt: 'Test',
      });

      const updated = await service.update(created._id!.toString(), {
        name: 'Updated',
        tags: ['new-tag'],
      });

      expect(updated.name).toBe('Updated');
      expect(updated.tags).toContain('new-tag');
    });

    it('should throw NotFoundException for non-existent ID', async () => {
      const fakeId = new Types.ObjectId().toString();
      await expect(
        service.update(fakeId, { name: 'X' }),
      ).rejects.toThrow(/not found/);
    });
  });

  describe('remove()', () => {
    it('should soft-delete by setting status to deprecated', async () => {
      const created = await service.create({
        name: 'Delete Me',
        category: 'support',
        prompt: 'Test',
      });

      await service.remove(created._id!.toString());

      const doc = await templateModel.findById(created._id);
      expect(doc!.status).toBe('deprecated');
    });

    it('should throw NotFoundException for non-existent ID', async () => {
      const fakeId = new Types.ObjectId().toString();
      await expect(service.remove(fakeId)).rejects.toThrow(/not found/);
    });
  });

  describe('instantiate()', () => {
    it('should substitute variables in prompt', async () => {
      const tmpl = await service.create({
        name: 'Greeting Template',
        category: 'support',
        prompt: 'Hello {{name}}, your order {{order_id}} is ready.',
        variables: [
          { name: 'name', type: 'string', required: true },
          { name: 'order_id', type: 'string', required: true },
        ],
      });

      const result = await service.instantiate(tmpl._id!.toString(), {
        variableValues: { name: 'Alice', order_id: 'ORD-123' },
        personaIds: ['p1'],
        agentIds: ['a1'],
      });

      expect(result.prompt).toBe(
        'Hello Alice, your order ORD-123 is ready.',
      );
      expect(result.name).toBe('Greeting Template');
      expect(result.personaIds).toEqual(['p1']);
      expect(result.agentIds).toEqual(['a1']);
      expect(result.status).toBe('draft');
    });

    it('should use default values for missing optional variables', async () => {
      const tmpl = await service.create({
        name: 'Default Template',
        category: 'support',
        prompt: 'Hello {{name}}',
        variables: [
          {
            name: 'name',
            type: 'string',
            required: true,
            defaultValue: 'Customer',
          },
        ],
      });

      const result = await service.instantiate(tmpl._id!.toString(), {});
      expect(result.prompt).toBe('Hello Customer');
    });

    it('should throw when required variables missing', async () => {
      const tmpl = await service.create({
        name: 'Required Vars',
        category: 'support',
        prompt: 'Hello {{name}}',
        variables: [
          { name: 'name', type: 'string', required: true },
        ],
      });

      await expect(
        service.instantiate(tmpl._id!.toString(), {}),
      ).rejects.toThrow(/Missing required variables/);
    });

    it('should allow custom name override', async () => {
      const tmpl = await service.create({
        name: 'Template Name',
        category: 'support',
        prompt: 'Test',
      });

      const result = await service.instantiate(tmpl._id!.toString(), {
        name: 'My Custom Scenario',
      });

      expect(result.name).toBe('My Custom Scenario');
    });

    it('should add template tag to scenario', async () => {
      const tmpl = await service.create({
        name: 'Tagged Template',
        category: 'support',
        prompt: 'Test',
        tags: ['existing-tag'],
      });

      const result = await service.instantiate(tmpl._id!.toString(), {});
      expect(result.tags).toContain('existing-tag');
      expect(result.tags).toContain('template:Tagged Template');
    });

    it('should increment usage stats', async () => {
      const tmpl = await service.create({
        name: 'Usage Template',
        category: 'support',
        prompt: 'Test',
      });

      await service.instantiate(tmpl._id!.toString(), {});
      await service.instantiate(tmpl._id!.toString(), {});

      const updated = await templateModel.findById(tmpl._id);
      expect(updated!.usageStats.timesUsed).toBe(2);
      expect(updated!.usageStats.lastUsed).toBeDefined();
    });
  });

  describe('validate()', () => {
    it('should return valid for well-formed template', async () => {
      const tmpl = await service.create({
        name: 'Valid Template',
        category: 'support',
        prompt: 'Hello {{name}}',
        variables: [{ name: 'name', type: 'string', required: true }],
      });

      const result = service.validate(tmpl);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect undefined variable references', async () => {
      const tmpl = await service.create({
        name: 'Bad Refs',
        category: 'support',
        prompt: 'Hello {{name}} and {{missing_var}}',
        variables: [{ name: 'name', type: 'string', required: true }],
      });

      const result = service.validate(tmpl);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('missing_var'),
      );
    });

    it('should warn about unused variables', async () => {
      const tmpl = await service.create({
        name: 'Unused Vars',
        category: 'support',
        prompt: 'Hello',
        variables: [{ name: 'unused', type: 'string', required: false }],
      });

      const result = service.validate(tmpl);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('unused'),
      );
    });
  });

  describe('clone()', () => {
    it('should clone a template with "(Clone)" suffix', async () => {
      const original = await service.create({
        name: 'Original',
        category: 'support',
        prompt: 'Test prompt',
        tags: ['tag1'],
      });

      const cloned = await service.clone(original._id!.toString());
      expect(cloned.name).toBe('Original (Clone)');
      expect(cloned.category).toBe('support');
      expect(cloned.prompt).toBe('Test prompt');
      expect(cloned.status).toBe('draft');
      expect(cloned.usageStats.timesUsed).toBe(0);
    });

    it('should allow custom name for clone', async () => {
      const original = await service.create({
        name: 'Original',
        category: 'support',
        prompt: 'Test',
      });

      const cloned = await service.clone(
        original._id!.toString(),
        'Custom Clone Name',
      );
      expect(cloned.name).toBe('Custom Clone Name');
    });
  });

  describe('seedBuiltInTemplates()', () => {
    it('should seed 4 built-in templates', async () => {
      const created = await service.seedBuiltInTemplates();
      expect(created).toHaveLength(4);

      const names = created.map((t) => t.name);
      expect(names).toContain('Customer Service - Refund Request');
      expect(names).toContain('Sales - Product Inquiry');
      expect(names).toContain('Healthcare - Appointment Scheduling');
      expect(names).toContain('Technical Support - Troubleshooting');
    });

    it('should be idempotent - skip existing templates', async () => {
      const first = await service.seedBuiltInTemplates();
      expect(first).toHaveLength(4);

      const second = await service.seedBuiltInTemplates();
      expect(second).toHaveLength(0);

      // Total should still be 4
      const all = await service.findAll();
      expect(all.total).toBe(4);
    });

    it('should set templates as featured and published', async () => {
      const created = await service.seedBuiltInTemplates();
      for (const tmpl of created) {
        expect(tmpl.isFeatured).toBe(true);
        expect(tmpl.status).toBe('published');
        expect(tmpl.visibility).toBe('public');
      }
    });

    it('should have valid variables in all templates', async () => {
      const created = await service.seedBuiltInTemplates();
      for (const tmpl of created) {
        const validation = service.validate(tmpl);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }
    });
  });

  describe('getBuiltInTemplates()', () => {
    it('should return 4 template definitions', () => {
      const templates = getBuiltInTemplates();
      expect(templates).toHaveLength(4);
    });

    it('should have customer-service template with variables', () => {
      const templates = getBuiltInTemplates();
      const cs = templates.find((t) =>
        t.name.includes('Customer Service'),
      );
      expect(cs).toBeDefined();
      expect(cs!.variables!.length).toBeGreaterThan(0);
      expect(cs!.category).toBe('support');
    });

    it('should have all required fields in each template', () => {
      const templates = getBuiltInTemplates();
      for (const t of templates) {
        expect(t.name).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.category).toBeTruthy();
        expect(t.prompt).toBeTruthy();
        expect(t.tags!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('YAML round-trip via instantiate', () => {
    it('should instantiate customer-service template with custom variables', async () => {
      await service.seedBuiltInTemplates();
      const all = await service.findAll({ category: 'support' });
      const tmpl = all.templates[0];

      const scenario = await service.instantiate(tmpl._id!.toString(), {
        name: 'My Refund Test',
        variableValues: {
          product_type: 'headphones',
          days_ago: 7,
          issue_description: 'broken left earpiece',
          resolution_type: 'replacement',
        },
        agentIds: ['agent-1'],
        personaIds: ['persona-1'],
      });

      expect(scenario.prompt).toContain('headphones');
      expect(scenario.prompt).toContain('7');
      expect(scenario.prompt).toContain('broken left earpiece');
      expect(scenario.prompt).toContain('replacement');
      expect(scenario.prompt).not.toContain('{{product_type}}');
      expect(scenario.name).toBe('My Refund Test');
    });
  });
});
