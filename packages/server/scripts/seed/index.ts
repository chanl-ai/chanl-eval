/**
 * Seed orchestrator for chanl-eval.
 *
 * Imports entity data from sibling files and inserts into MongoDB.
 * Idempotent — checks by name before inserting.
 *
 * Usage:
 *   npx tsx packages/server/scripts/seed/index.ts
 */

import { MongoClient, ObjectId } from 'mongodb';
import { PROMPTS } from './prompts';
import { PERSONAS } from './personas';
import { TOOL_FIXTURES } from './tool-fixtures';
import { SCORECARDS } from './scorecards';
import { SCENARIOS, SCENARIO_LINKS } from './scenarios';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27217/chanl-eval';

async function seed() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();

    console.log(`\n🌱 Seeding chanl-eval → ${MONGODB_URI}\n`);

    // ── Prompts ──────────────────────────────────────────────────────────
    const promptsCol = db.collection('prompts');
    let promptsInserted = 0;
    const promptIds: Record<string, ObjectId> = {};
    for (const prompt of PROMPTS) {
      const exists = await promptsCol.findOne({ name: prompt.name });
      if (exists) { promptIds[prompt.name] = exists._id; continue; }
      const now = new Date();
      const r = await promptsCol.insertOne({ ...prompt, createdAt: now, updatedAt: now });
      promptIds[prompt.name] = r.insertedId;
      console.log(`  ✓ Prompt "${prompt.name}"`);
      promptsInserted++;
    }
    console.log(`  Prompts: ${promptsInserted} new, ${PROMPTS.length - promptsInserted} existing\n`);

    // ── Tool Fixtures ────────────────────────────────────────────────────
    const toolsCol = db.collection('tool_fixtures');
    let toolsInserted = 0;
    for (const tf of TOOL_FIXTURES) {
      const exists = await toolsCol.findOne({ name: tf.name });
      if (exists) continue;
      const now = new Date();
      await toolsCol.insertOne({ ...tf, createdAt: now, updatedAt: now });
      console.log(`  ✓ Tool "${tf.name}"`);
      toolsInserted++;
    }
    console.log(`  Tools: ${toolsInserted} new, ${TOOL_FIXTURES.length - toolsInserted} existing\n`);

    // ── Personas ─────────────────────────────────────────────────────────
    const personasCol = db.collection('personas');
    let personasInserted = 0;
    const personaIds: Record<string, ObjectId> = {};
    for (const persona of PERSONAS) {
      const exists = await personasCol.findOne({ name: persona.name });
      if (exists) { personaIds[persona.name] = exists._id; continue; }
      const now = new Date();
      const r = await personasCol.insertOne({ ...persona, createdAt: now, updatedAt: now });
      personaIds[persona.name] = r.insertedId;
      console.log(`  ✓ Persona "${persona.name}"`);
      personasInserted++;
    }
    console.log(`  Personas: ${personasInserted} new, ${PERSONAS.length - personasInserted} existing\n`);

    // ── Scorecards ───────────────────────────────────────────────────────
    const scorecardsCol = db.collection('scorecards');
    const categoriesCol = db.collection('scorecard_categories');
    const criteriaCol = db.collection('scorecard_criteria');
    let scorecardsInserted = 0;

    for (const sc of SCORECARDS) {
      const exists = await scorecardsCol.findOne({ name: sc.scorecard.name });
      if (exists) continue;
      const now = new Date();
      const scResult = await scorecardsCol.insertOne({ ...sc.scorecard, categoryIds: [], createdAt: now, updatedAt: now });
      const scorecardId = scResult.insertedId;
      const allCatIds: ObjectId[] = [];
      let totalCriteria = 0;

      for (const cat of sc.categories) {
        const { criteria, ...catData } = cat;
        const catResult = await categoriesCol.insertOne({ ...catData, scorecardId, criteriaIds: [], createdAt: now, updatedAt: now });
        allCatIds.push(catResult.insertedId);
        const critIds: ObjectId[] = [];
        for (const crit of criteria) {
          const cr = await criteriaCol.insertOne({ ...crit, scorecardId, categoryId: catResult.insertedId, createdAt: now, updatedAt: now });
          critIds.push(cr.insertedId);
        }
        totalCriteria += critIds.length;
        await categoriesCol.updateOne({ _id: catResult.insertedId }, { $set: { criteriaIds: critIds } });
      }
      await scorecardsCol.updateOne({ _id: scorecardId }, { $set: { categoryIds: allCatIds } });
      console.log(`  ✓ Scorecard "${sc.scorecard.name}" (${sc.categories.length} categories, ${totalCriteria} criteria)`);
      scorecardsInserted++;
    }
    console.log(`  Scorecards: ${scorecardsInserted} new, ${SCORECARDS.length - scorecardsInserted} existing\n`);

    // ── Scenarios ────────────────────────────────────────────────────────
    const scenariosCol = db.collection('scenarios');
    let scenariosInserted = 0;

    for (const scenario of SCENARIOS) {
      const exists = await scenariosCol.findOne({ name: scenario.name });
      if (exists) continue;
      const now = new Date();
      const link = SCENARIO_LINKS[scenario.name] || { personaNames: [], scorecardName: '' };
      const linkedPersonaIds = link.personaNames
        .map((n) => personaIds[n])
        .filter(Boolean) as ObjectId[];
      const linkedScorecardId = link.scorecardName
        ? (await scorecardsCol.findOne({ name: link.scorecardName }))?._id
        : undefined;

      await scenariosCol.insertOne({
        ...scenario,
        personaIds: linkedPersonaIds,
        scorecardId: linkedScorecardId,
        promptVariables: [],
        configuration: {},
        metrics: { totalExecutions: 0, successfulExecutions: 0, averageScore: 0, lastExecuted: null },
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`  ✓ Scenario "${scenario.name}" → ${linkedPersonaIds.length} personas, scorecard: ${linkedScorecardId ? 'yes' : 'none'}`);
      scenariosInserted++;
    }
    console.log(`  Scenarios: ${scenariosInserted} new, ${SCENARIOS.length - scenariosInserted} existing\n`);

    // ── Settings ─────────────────────────────────────────────────────────
    const settingsCol = db.collection('settings');
    const existingSettings = await settingsCol.findOne({});
    if (!existingSettings) {
      const now = new Date();
      await settingsCol.insertOne({ providerKeys: {}, createdAt: now, updatedAt: now });
      console.log('  ✓ Settings initialized (set API keys in Settings page)\n');
    }

    // ── Summary ──────────────────────────────────────────────────────────
    const counts = {
      prompts: await promptsCol.countDocuments(),
      scenarios: await scenariosCol.countDocuments(),
      personas: await personasCol.countDocuments(),
      scorecards: await scorecardsCol.countDocuments(),
      toolFixtures: await toolsCol.countDocuments(),
    };
    console.log('─────────────────────────────────────');
    console.log(`  ${counts.prompts} prompts · ${counts.scenarios} scenarios · ${counts.personas} personas`);
    console.log(`  ${counts.scorecards} scorecards · ${counts.toolFixtures} tool fixtures`);
    console.log('─────────────────────────────────────');
    console.log('\n✅ Ready! Open http://localhost:3010/playground');
    console.log('   → Set your API key in Settings, then start chatting\n');
  } finally {
    await client.close();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
