import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ScenarioTemplate,
  ScenarioTemplateDocument,
  TemplateVariable,
} from './schemas/scenario-template.schema';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { InstantiateTemplateDto } from './dto/instantiate-template.dto';

export interface PaginatedTemplates {
  templates: ScenarioTemplateDocument[];
  total: number;
}

@Injectable()
export class ScenarioTemplateService {
  private readonly logger = new Logger(ScenarioTemplateService.name);

  constructor(
    @InjectModel(ScenarioTemplate.name)
    private readonly templateModel: Model<ScenarioTemplateDocument>,
  ) {}

  async create(
    dto: CreateTemplateDto,
    createdBy?: string,
  ): Promise<ScenarioTemplateDocument> {
    const template = await this.templateModel.create({
      ...dto,
      createdBy: createdBy || 'local',
      status: 'published',
    });
    return template;
  }

  async findAll(
    filters?: {
      category?: string;
      status?: string;
      search?: string;
    },
    pagination?: { page?: number; limit?: number },
  ): Promise<PaginatedTemplates> {
    const query: any = {};

    if (filters?.category) query.category = filters.category;
    if (filters?.status) query.status = filters.status;
    if (filters?.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
        { tags: { $in: [new RegExp(filters.search, 'i')] } },
      ];
    }

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;
    const skip = (page - 1) * limit;

    const [templates, total] = await Promise.all([
      this.templateModel
        .find(query)
        .sort({ isFeatured: -1, featuredOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      this.templateModel.countDocuments(query),
    ]);

    return { templates, total };
  }

  async findOne(id: string): Promise<ScenarioTemplateDocument> {
    const template = await this.templateModel.findById(id);
    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }
    return template;
  }

  async update(
    id: string,
    dto: UpdateTemplateDto,
  ): Promise<ScenarioTemplateDocument> {
    const template = await this.templateModel.findByIdAndUpdate(
      id,
      { ...dto },
      { new: true },
    );
    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }
    return template;
  }

  async remove(id: string): Promise<void> {
    const template = await this.templateModel.findByIdAndUpdate(
      id,
      { status: 'deprecated' },
      { new: true },
    );
    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }
  }

  /**
   * Instantiate a scenario from a template by substituting variables.
   * Returns the scenario data ready to be created via ScenarioService.
   */
  async instantiate(
    id: string,
    dto: InstantiateTemplateDto,
  ): Promise<Record<string, any>> {
    const template = await this.findOne(id);

    // Validate required variables
    const variableValues = dto.variableValues || {};
    const missingVars: string[] = [];

    for (const v of template.variables || []) {
      if (v.required && variableValues[v.name] === undefined) {
        if (v.defaultValue !== undefined) {
          variableValues[v.name] = v.defaultValue;
        } else {
          missingVars.push(v.name);
        }
      }
    }

    if (missingVars.length > 0) {
      throw new BadRequestException(
        `Missing required variables: ${missingVars.join(', ')}`,
      );
    }

    // Substitute variables in prompt
    let prompt = template.prompt;
    for (const [key, value] of Object.entries(variableValues)) {
      const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      prompt = prompt.replace(pattern, String(value));
    }

    // Update usage stats
    await this.templateModel.findByIdAndUpdate(id, {
      $inc: { 'usageStats.timesUsed': 1 },
      $set: { 'usageStats.lastUsed': new Date() },
    });

    // Build scenario data
    const scenarioData: Record<string, any> = {
      name: dto.name || template.name,
      description: template.description,
      prompt,
      category: template.category,
      difficulty: template.difficulty,
      tags: [...(template.tags || []), `template:${template.name}`],
      personaIds: dto.personaIds || [],
      status: 'draft',
    };

    if (dto.scorecardId) {
      scenarioData.scorecardId = dto.scorecardId;
    }

    if (template.defaultPersonaConfig) {
      scenarioData.defaultPersonaConfig = template.defaultPersonaConfig;
    }

    return scenarioData;
  }

  /**
   * Validate a template's structure and variable references.
   */
  validate(
    template: ScenarioTemplateDocument,
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!template.name) errors.push('Template name is required');
    if (!template.prompt) errors.push('Template prompt is required');
    if (!template.category) errors.push('Template category is required');

    // Check variable references in prompt
    const varPattern = /\{\{\s*(\w+)\s*\}\}/g;
    const referencedVars = new Set<string>();
    let match;
    while ((match = varPattern.exec(template.prompt)) !== null) {
      referencedVars.add(match[1]);
    }

    const definedVars = new Set(
      (template.variables || []).map((v) => v.name),
    );

    // Check for undefined variable references
    for (const ref of referencedVars) {
      if (!definedVars.has(ref)) {
        errors.push(
          `Variable "{{${ref}}}" referenced in prompt but not defined`,
        );
      }
    }

    // Check for unused defined variables
    for (const def of definedVars) {
      if (!referencedVars.has(def)) {
        warnings.push(`Variable "${def}" defined but not used in prompt`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Clone a template.
   */
  async clone(
    id: string,
    name?: string,
  ): Promise<ScenarioTemplateDocument> {
    const original = await this.findOne(id);

    /** Plain object with all ScenarioTemplate fields plus Mongoose internals. */
    interface TemplateObject extends Record<string, unknown> {
      _id?: unknown;
      __v?: unknown;
      id?: unknown;
      createdAt?: unknown;
      updatedAt?: unknown;
      name: string;
    }

    const obj = original.toObject() as unknown as TemplateObject;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, __v, createdAt, updatedAt, id: _idAlias, ...rest } = obj;

    const cloned = await this.templateModel.create({
      ...rest,
      name: name || `${original.name} (Clone)`,
      status: 'draft',
      usageStats: { timesUsed: 0 },
    });

    return cloned;
  }

  /**
   * Seed built-in templates into the database.
   * Returns templates created (skips duplicates by name).
   */
  async seedBuiltInTemplates(): Promise<ScenarioTemplateDocument[]> {
    const builtIns = getBuiltInTemplates();
    const created: ScenarioTemplateDocument[] = [];

    for (const tmpl of builtIns) {
      const existing = await this.templateModel.findOne({
        name: tmpl.name,
      });

      if (!existing) {
        const doc = await this.templateModel.create({
          ...tmpl,
          createdBy: 'system',
          status: 'published',
          visibility: 'public',
          isFeatured: true,
        });
        created.push(doc);
      }
    }

    return created;
  }
}

// ============================================================================
// BUILT-IN TEMPLATES
// ============================================================================

export function getBuiltInTemplates(): CreateTemplateDto[] {
  return [
    {
      name: 'Customer Service - Refund Request',
      description:
        'Simulates a customer requesting a refund or return. Tests agent empathy, policy adherence, and resolution skills.',
      category: 'support',
      difficulty: 'medium',
      tags: ['refund', 'returns', 'customer-service'],
      prompt: `You are a customer calling about a {{product_type}} you purchased {{days_ago}} days ago. The product is {{issue_description}}. You want a {{resolution_type}}.

Your order number is {{order_number}}. You are feeling {{customer_mood}} about this situation.

Start by explaining your issue. If the agent asks clarifying questions, answer them. If the agent offers a solution, evaluate whether it meets your needs. If not satisfied, escalate politely.`,
      variables: [
        {
          name: 'product_type',
          type: 'string',
          required: true,
          defaultValue: 'laptop',
          description: 'Type of product purchased',
        },
        {
          name: 'days_ago',
          type: 'number',
          required: true,
          defaultValue: 14,
          description: 'Days since purchase',
        },
        {
          name: 'issue_description',
          type: 'string',
          required: true,
          defaultValue: 'not working properly - screen flickers intermittently',
          description: 'Description of the product issue',
        },
        {
          name: 'resolution_type',
          type: 'string',
          required: true,
          defaultValue: 'full refund',
          description: 'What the customer wants (refund, exchange, repair)',
        },
        {
          name: 'order_number',
          type: 'string',
          required: false,
          defaultValue: 'ORD-2024-12345',
          description: 'Order number for reference',
        },
        {
          name: 'customer_mood',
          type: 'string',
          required: false,
          defaultValue: 'frustrated but reasonable',
          description: 'Customer emotional state',
        },
      ],
      defaultPersonaConfig: {
        emotion: 'frustrated',
        patience: 'medium',
        cooperationLevel: 'moderate',
      },
      defaultScoringConfig: {
        passingScore: 70,
        suggestedScorecard: 'customer-service',
      },
    },
    {
      name: 'Sales - Product Inquiry',
      description:
        'Simulates a potential customer inquiring about a product or service. Tests agent product knowledge, upselling, and closing skills.',
      category: 'sales',
      difficulty: 'medium',
      tags: ['sales', 'product-inquiry', 'lead-qualification'],
      prompt: `You are a potential customer interested in {{product_name}}. Your budget is around {{budget}} and you need it for {{use_case}}.

You have {{familiarity_level}} familiarity with this type of product. You are comparing it with {{competitor_product}}.

Ask about features, pricing, and availability. If the agent provides good information, show interest. If they try to upsell, evaluate whether it makes sense for your needs.`,
      variables: [
        {
          name: 'product_name',
          type: 'string',
          required: true,
          defaultValue: 'enterprise CRM software',
          description: 'Product being inquired about',
        },
        {
          name: 'budget',
          type: 'string',
          required: true,
          defaultValue: '$500/month',
          description: 'Customer budget range',
        },
        {
          name: 'use_case',
          type: 'string',
          required: true,
          defaultValue: 'managing a sales team of 20 people',
          description: 'What the customer needs the product for',
        },
        {
          name: 'familiarity_level',
          type: 'string',
          required: false,
          defaultValue: 'moderate',
          description: 'Customer familiarity (none, basic, moderate, expert)',
        },
        {
          name: 'competitor_product',
          type: 'string',
          required: false,
          defaultValue: 'Salesforce',
          description: 'Competitor being considered',
        },
      ],
      defaultPersonaConfig: {
        emotion: 'neutral',
        patience: 'high',
        cooperationLevel: 'cooperative',
      },
      defaultScoringConfig: {
        passingScore: 75,
        suggestedScorecard: 'sales',
      },
    },
    {
      name: 'Healthcare - Appointment Scheduling',
      description:
        'Simulates a patient calling to schedule, reschedule, or inquire about a medical appointment. Tests HIPAA awareness, empathy, and scheduling efficiency.',
      category: 'healthcare',
      difficulty: 'hard',
      tags: ['healthcare', 'appointment', 'scheduling', 'hipaa'],
      prompt: `You are a patient calling a {{facility_type}} to {{appointment_action}} an appointment.

Your name is {{patient_name}} and your date of birth is {{date_of_birth}}. You need to see a {{specialist_type}} for {{reason_for_visit}}.

Your preferred times are {{preferred_times}}. You have {{insurance_type}} insurance.

Be cooperative but ask about wait times and preparation instructions. If the agent asks for medical details over the phone, note whether they handle it appropriately.`,
      variables: [
        {
          name: 'facility_type',
          type: 'string',
          required: true,
          defaultValue: "doctor's office",
          description: 'Type of healthcare facility',
        },
        {
          name: 'appointment_action',
          type: 'string',
          required: true,
          defaultValue: 'schedule',
          description: 'Action: schedule, reschedule, cancel',
        },
        {
          name: 'patient_name',
          type: 'string',
          required: true,
          defaultValue: 'Sarah Johnson',
          description: 'Patient name for identification',
        },
        {
          name: 'date_of_birth',
          type: 'string',
          required: true,
          defaultValue: '03/15/1985',
          description: 'Patient date of birth',
        },
        {
          name: 'specialist_type',
          type: 'string',
          required: true,
          defaultValue: 'dermatologist',
          description: 'Type of specialist needed',
        },
        {
          name: 'reason_for_visit',
          type: 'string',
          required: false,
          defaultValue: 'a skin rash that has persisted for two weeks',
          description: 'Reason for the appointment',
        },
        {
          name: 'preferred_times',
          type: 'string',
          required: false,
          defaultValue: 'weekday mornings before 10 AM',
          description: 'Patient scheduling preferences',
        },
        {
          name: 'insurance_type',
          type: 'string',
          required: false,
          defaultValue: 'Blue Cross Blue Shield',
          description: 'Insurance provider',
        },
      ],
      defaultPersonaConfig: {
        emotion: 'neutral',
        patience: 'medium',
        cooperationLevel: 'cooperative',
        speechStyle: 'polite',
      },
      defaultScoringConfig: {
        passingScore: 80,
        suggestedScorecard: 'healthcare',
      },
    },
    {
      name: 'Technical Support - Troubleshooting',
      description:
        'Simulates a user calling with a technical issue. Tests agent diagnostic skills, communication clarity, and problem resolution.',
      category: 'technical',
      difficulty: 'hard',
      tags: ['tech-support', 'troubleshooting', 'technical'],
      prompt: `You are a user experiencing {{issue_type}} with your {{device_or_service}}. The issue started {{when_started}}.

You have already tried {{steps_tried}}. Your technical skill level is {{tech_level}}.

Describe your issue when prompted. Follow troubleshooting steps the agent suggests, but report the outcome of each step. If a step seems too complex, ask for clarification.

The actual root cause is: {{root_cause}} (do not reveal this directly, but respond consistently with this being the problem).`,
      variables: [
        {
          name: 'issue_type',
          type: 'string',
          required: true,
          defaultValue: 'intermittent connectivity issues',
          description: 'Type of technical issue',
        },
        {
          name: 'device_or_service',
          type: 'string',
          required: true,
          defaultValue: 'home WiFi network',
          description: 'Device or service with the issue',
        },
        {
          name: 'when_started',
          type: 'string',
          required: true,
          defaultValue: 'about 3 days ago after a firmware update',
          description: 'When the issue began',
        },
        {
          name: 'steps_tried',
          type: 'string',
          required: false,
          defaultValue: 'restarting the router and checking cable connections',
          description: 'What the user already tried',
        },
        {
          name: 'tech_level',
          type: 'string',
          required: false,
          defaultValue: 'intermediate',
          description: 'User technical skill (beginner, intermediate, advanced)',
        },
        {
          name: 'root_cause',
          type: 'string',
          required: false,
          defaultValue: 'the firmware update changed the WiFi channel to one that conflicts with a neighbor\'s network',
          description: 'Hidden root cause of the issue',
        },
      ],
      defaultPersonaConfig: {
        emotion: 'mildly-frustrated',
        patience: 'medium',
        cooperationLevel: 'cooperative',
      },
      defaultScoringConfig: {
        passingScore: 75,
        suggestedScorecard: 'technical-support',
      },
    },
  ];
}
