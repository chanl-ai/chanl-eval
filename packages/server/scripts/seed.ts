/**
 * Seed script for chanl-eval.
 *
 * Inserts sample scenarios, personas, and a scorecard (with category + criteria)
 * into the local MongoDB instance. Idempotent — checks by name before inserting.
 *
 * Usage:
 *   pnpm --filter @chanl/eval-server seed
 *   # or directly:
 *   npx tsx packages/server/scripts/seed.ts
 */

import { MongoClient, ObjectId } from 'mongodb';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27217/chanl-eval';

// ─── Seed Data ───────────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    name: 'Angry Customer Refund',
    description:
      'Frustrated customer calling about a double charge on their credit card. They want an immediate refund and are threatening to close their account.',
    prompt:
      'Handle this customer who was double-charged $49.99. They are very upset and want a refund immediately.',
    difficulty: 'hard',
    category: 'support',
    status: 'active',
    personaIds: [],
    agentIds: [],
    promptVariables: [],
    configuration: {},
    metrics: {
      totalExecutions: 0,
      successfulExecutions: 0,
      averageScore: 0,
      lastExecuted: null,
    },
    tags: [],
    version: 1,
    createdBy: 'seed',
  },
  {
    name: 'Product Inquiry',
    description:
      'Curious customer asking about product features, pricing, and availability. They are comparing options and need detailed information.',
    prompt:
      'Help this customer who is interested in your premium plan. They want to understand features, pricing, and how it compares to competitors.',
    difficulty: 'easy',
    category: 'sales',
    status: 'active',
    personaIds: [],
    agentIds: [],
    promptVariables: [],
    configuration: {},
    metrics: {
      totalExecutions: 0,
      successfulExecutions: 0,
      averageScore: 0,
      lastExecuted: null,
    },
    tags: [],
    version: 1,
    createdBy: 'seed',
  },
  {
    name: 'Billing Question',
    description:
      'Customer confused about charges on their monthly statement. They need clear explanation of line items and any applicable discounts.',
    prompt:
      "Explain the charges on this customer's bill. They see a $15 fee they don't recognize and want to understand their statement.",
    difficulty: 'medium',
    category: 'support',
    status: 'active',
    personaIds: [],
    agentIds: [],
    promptVariables: [],
    configuration: {},
    metrics: {
      totalExecutions: 0,
      successfulExecutions: 0,
      averageScore: 0,
      lastExecuted: null,
    },
    tags: [],
    version: 1,
    createdBy: 'seed',
  },
];

const PERSONAS = [
  {
    name: 'Angry Karen',
    description: 'Frustrated customer with demanding tone',
    gender: 'female',
    emotion: 'frustrated',
    language: 'english',
    accent: 'american',
    speechStyle: 'fast',
    intentClarity: 'very clear',
    backgroundNoise: false,
    allowInterruptions: true,
    behavior: {
      personality: 'demanding',
      emotionalState: 'angry',
      cooperationLevel: 'hostile',
      patience: 'very impatient',
      communicationStyle: 'direct',
    },
    variables: {},
    tags: [],
    isActive: true,
    isDefault: false,
    createdBy: 'seed',
  },
  {
    name: 'Calm James',
    description: 'Relaxed and composed customer',
    gender: 'male',
    emotion: 'calm',
    language: 'english',
    accent: 'american',
    speechStyle: 'normal',
    intentClarity: 'very clear',
    backgroundNoise: false,
    allowInterruptions: false,
    behavior: {
      personality: 'friendly',
      emotionalState: 'calm',
      cooperationLevel: 'cooperative',
      patience: 'very patient',
      communicationStyle: 'concise',
    },
    variables: {},
    tags: [],
    isActive: true,
    isDefault: false,
    createdBy: 'seed',
  },
  {
    name: 'Curious Maria',
    description: 'Inquisitive customer asking many questions',
    gender: 'female',
    emotion: 'curious',
    language: 'english',
    accent: 'american',
    speechStyle: 'moderate',
    intentClarity: 'slightly unclear',
    backgroundNoise: false,
    allowInterruptions: false,
    behavior: {
      personality: 'friendly',
      emotionalState: 'neutral',
      cooperationLevel: 'cooperative',
      patience: 'patient',
      communicationStyle: 'verbose',
    },
    conversationTraits: {
      asksClarifyingQuestions: true,
      goesOffTopic: true,
    },
    variables: {},
    tags: [],
    isActive: true,
    isDefault: false,
    createdBy: 'seed',
  },
];

// Scorecard uses a category → criteria hierarchy (separate collections).
const SCORECARD = {
  name: 'Call Quality Scorecard',
  description:
    'Default scorecard for evaluating agent conversation quality',
  passingThreshold: 70,
  scoringAlgorithm: 'weighted_average',
  status: 'active',
  tags: [],
};

const SCORECARD_CATEGORY = {
  name: 'Conversation Quality',
  description: 'Core conversation quality metrics',
  weight: 100,
  order: 0,
  version: 1,
};

const SCORECARD_CRITERIA = [
  {
    key: 'greeting',
    name: 'Greeting',
    description: 'Agent greets the customer appropriately',
    type: 'keyword',
    settings: {
      matchType: 'must_contain',
      keyword: ['hello', 'hi', 'welcome', 'good morning', 'good afternoon'],
      caseSensitive: false,
    },
    threshold: { expectedValue: true },
    version: 1,
    isActive: true,
  },
  {
    key: 'response_time',
    name: 'Response Time',
    description: 'Agent responds within acceptable time',
    type: 'response_time',
    settings: {
      participant: 'agent',
    },
    threshold: { max: 5000 },
    version: 1,
    isActive: true,
  },
  {
    key: 'empathy_professionalism',
    name: 'Empathy & Professionalism',
    description:
      'Evaluate whether the agent showed empathy, acknowledged the customer\'s feelings, and maintained a professional tone throughout the conversation. Score 0-10.',
    type: 'prompt',
    settings: {
      description:
        'Evaluate whether the agent showed empathy, acknowledged the customer\'s feelings, and maintained a professional tone throughout the conversation. Score 0-10.',
      evaluationType: 'score',
    },
    threshold: { min: 7 },
    version: 1,
    isActive: true,
  },
  {
    key: 'issue_resolution',
    name: 'Issue Resolution',
    description:
      'Did the agent attempt to resolve the customer\'s issue? Did they provide clear next steps? Score 0-10.',
    type: 'prompt',
    settings: {
      description:
        'Did the agent attempt to resolve the customer\'s issue? Did they provide clear next steps? Score 0-10.',
      evaluationType: 'score',
    },
    threshold: { min: 7 },
    version: 1,
    isActive: true,
  },
];

const TOOL_FIXTURES = [
  {
    name: 'check_order_status',
    description: 'Look up the current status of a customer order by order ID',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'The order ID (e.g., ORD-123)' },
      },
      required: ['order_id'],
    },
    mockResponses: [
      { when: { order_id: 'ORD-123' }, return: { status: 'shipped', tracking_number: '1Z999AA10123456784', estimated_delivery: '2026-04-05' }, description: 'Shipped order' },
      { when: { order_id: 'ORD-456' }, return: { status: 'cancelled', reason: 'Customer requested cancellation', refund_status: 'processed' }, description: 'Cancelled order' },
      { when: { order_id: 'ORD-789' }, return: { status: 'processing', estimated_ship_date: '2026-04-03' }, description: 'Processing order' },
      { isDefault: true, return: { status: 'not_found', message: 'No order found with that ID' }, description: 'Unknown order' },
    ],
    tags: ['customer-support', 'e-commerce'],
    isActive: true,
    createdBy: 'seed',
  },
  {
    name: 'process_refund',
    description: 'Submit a refund request for a customer order',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'The order ID to refund' },
        reason: { type: 'string', description: 'Reason for the refund' },
        amount: { type: 'number', description: 'Refund amount in dollars (optional, defaults to full refund)' },
      },
      required: ['order_id', 'reason'],
    },
    mockResponses: [
      { when: { order_id: 'ORD-123' }, return: { success: true, refund_id: 'REF-001', amount: 49.99, estimated_days: 5 }, description: 'Successful refund' },
      { when: { order_id: 'ORD-456' }, return: { success: false, error: 'Order already refunded', existing_refund_id: 'REF-000' }, description: 'Already refunded' },
      { isDefault: true, return: { success: true, refund_id: 'REF-999', amount: 0, estimated_days: 7 }, description: 'Generic refund' },
    ],
    tags: ['customer-support', 'e-commerce'],
    isActive: true,
    createdBy: 'seed',
  },
  {
    name: 'get_customer_info',
    description: 'Retrieve customer profile information by email address',
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Customer email address' },
      },
      required: ['email'],
    },
    mockResponses: [
      { when: { email: 'jane@example.com' }, return: { name: 'Jane Smith', email: 'jane@example.com', tier: 'premium', member_since: '2024-01-15', total_orders: 23 }, description: 'Premium customer' },
      { when: { email: 'bob@example.com' }, return: { name: 'Bob Johnson', email: 'bob@example.com', tier: 'basic', member_since: '2025-06-01', total_orders: 2 }, description: 'Basic customer' },
      { isDefault: true, return: { error: 'Customer not found', message: 'No account associated with that email' }, description: 'Unknown customer' },
    ],
    tags: ['customer-support', 'crm'],
    isActive: true,
    createdBy: 'seed',
  },
  {
    name: 'transfer_to_agent',
    description: 'Transfer the customer to a human agent in the specified department',
    parameters: {
      type: 'object',
      properties: {
        department: { type: 'string', enum: ['billing', 'technical', 'sales', 'retention'], description: 'Department to transfer to' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'Transfer priority level' },
        notes: { type: 'string', description: 'Context notes for the receiving agent' },
      },
      required: ['department'],
    },
    mockResponses: [
      { isDefault: true, return: { transferred: true, queue_position: 3, estimated_wait: '2 minutes', department: 'requested_department' }, description: 'Transfer initiated' },
    ],
    tags: ['customer-support', 'escalation'],
    isActive: true,
    createdBy: 'seed',
  },
];

// ─── Seed Logic ──────────────────────────────────────────────────────────────

async function seed() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(); // uses DB name from URI

    console.log(`Connected to ${MONGODB_URI}`);

    // --- Scenarios ---
    const scenariosCol = db.collection('scenarios');
    let scenariosInserted = 0;
    for (const scenario of SCENARIOS) {
      const exists = await scenariosCol.findOne({ name: scenario.name });
      if (exists) {
        console.log(`  [skip] Scenario "${scenario.name}" already exists`);
        continue;
      }
      const now = new Date();
      await scenariosCol.insertOne({
        ...scenario,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`  [+] Scenario "${scenario.name}"`);
      scenariosInserted++;
    }
    console.log(
      `Scenarios: ${scenariosInserted} inserted, ${SCENARIOS.length - scenariosInserted} skipped\n`,
    );

    // --- Personas ---
    const personasCol = db.collection('personas');
    let personasInserted = 0;
    for (const persona of PERSONAS) {
      const exists = await personasCol.findOne({ name: persona.name });
      if (exists) {
        console.log(`  [skip] Persona "${persona.name}" already exists`);
        continue;
      }
      const now = new Date();
      await personasCol.insertOne({
        ...persona,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`  [+] Persona "${persona.name}"`);
      personasInserted++;
    }
    console.log(
      `Personas: ${personasInserted} inserted, ${PERSONAS.length - personasInserted} skipped\n`,
    );

    // --- Scorecard (with category + criteria) ---
    const scorecardsCol = db.collection('scorecards');
    const categoriesCol = db.collection('scorecard_categories');
    const criteriaCol = db.collection('scorecard_criteria');

    const existingScorecard = await scorecardsCol.findOne({
      name: SCORECARD.name,
    });
    if (existingScorecard) {
      console.log(
        `  [skip] Scorecard "${SCORECARD.name}" already exists\n`,
      );
    } else {
      const now = new Date();

      // 1. Insert the scorecard (will get categoryIds after category is created)
      const scorecardResult = await scorecardsCol.insertOne({
        ...SCORECARD,
        categoryIds: [],
        createdAt: now,
        updatedAt: now,
      });
      const scorecardId = scorecardResult.insertedId;
      console.log(`  [+] Scorecard "${SCORECARD.name}"`);

      // 2. Insert the category linked to this scorecard
      const categoryResult = await categoriesCol.insertOne({
        ...SCORECARD_CATEGORY,
        scorecardId,
        criteriaIds: [],
        createdAt: now,
        updatedAt: now,
      });
      const categoryId = categoryResult.insertedId;
      console.log(`  [+] Category "${SCORECARD_CATEGORY.name}"`);

      // 3. Insert each criteria linked to scorecard + category
      const criteriaIds: ObjectId[] = [];
      for (const criterion of SCORECARD_CRITERIA) {
        const result = await criteriaCol.insertOne({
          ...criterion,
          scorecardId,
          categoryId,
          createdAt: now,
          updatedAt: now,
        });
        criteriaIds.push(result.insertedId);
        console.log(`  [+] Criteria "${criterion.name}"`);
      }

      // 4. Back-link: update category with criteriaIds
      await categoriesCol.updateOne(
        { _id: categoryId },
        { $set: { criteriaIds } },
      );

      // 5. Back-link: update scorecard with categoryIds
      await scorecardsCol.updateOne(
        { _id: scorecardId },
        { $set: { categoryIds: [categoryId] } },
      );

      console.log(
        `Scorecard: 1 scorecard, 1 category, ${criteriaIds.length} criteria inserted\n`,
      );
    }

    // --- Tool Fixtures ---
    const toolFixturesCol = db.collection('tool_fixtures');
    let toolFixturesInserted = 0;
    for (const fixture of TOOL_FIXTURES) {
      const exists = await toolFixturesCol.findOne({ name: fixture.name });
      if (exists) {
        console.log(`  [skip] Tool fixture "${fixture.name}" already exists`);
        continue;
      }
      const now = new Date();
      await toolFixturesCol.insertOne({
        ...fixture,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`  [+] Tool fixture "${fixture.name}"`);
      toolFixturesInserted++;
    }
    console.log(
      `Tool fixtures: ${toolFixturesInserted} inserted, ${TOOL_FIXTURES.length - toolFixturesInserted} skipped\n`,
    );

    // --- Summary ---
    const counts = {
      scenarios: await scenariosCol.countDocuments(),
      personas: await personasCol.countDocuments(),
      scorecards: await scorecardsCol.countDocuments(),
      categories: await categoriesCol.countDocuments(),
      criteria: await criteriaCol.countDocuments(),
      toolFixtures: await toolFixturesCol.countDocuments(),
    };
    console.log('Database totals:');
    console.log(`  scenarios:            ${counts.scenarios}`);
    console.log(`  personas:             ${counts.personas}`);
    console.log(`  scorecards:           ${counts.scorecards}`);
    console.log(`  scorecard_categories: ${counts.categories}`);
    console.log(`  scorecard_criteria:   ${counts.criteria}`);
    console.log(`  tool_fixtures:        ${counts.toolFixtures}`);
    console.log('\nDone.');
  } finally {
    await client.close();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
