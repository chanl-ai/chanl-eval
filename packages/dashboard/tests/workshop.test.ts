// Workshop flow helpers. Run with: node --test tests/workshop.test.ts (Node 22.18+ strips types).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentForScenario, compareChange, scorecardPercent, stepsToLines } from '../lib/workshop.ts';

const acme = { id: 'acme', tags: ['workshop', 'refunds'] };
const invoice = { id: 'inv', tags: ['workshop', 'invoices'] };
const other = { id: 'other', tags: ['workshop'] };

test('a scenario runs against the agent that shares its topic, not the first agent', () => {
  const lateRefund = { id: 's1', tags: ['workshop', 'refunds'] };
  const hiddenNote = { id: 's2', tags: ['workshop', 'invoices', 'red-team'] };
  assert.equal(agentForScenario(lateRefund, [invoice, other, acme], null), 'acme');
  assert.equal(agentForScenario(hiddenNote, [acme, other, invoice], null), 'inv');
  // No topic link: the last agent the person picked.
  assert.equal(agentForScenario({ id: 's3', tags: ['workshop'] }, [acme, invoice, other], 'other'), 'other');
  // A saved v2 copy shares the tag; the one last picked wins.
  const v2 = { id: 'acme-v2', tags: ['workshop', 'refunds'] };
  assert.equal(agentForScenario(lateRefund, [acme, v2], 'acme-v2'), 'acme-v2');
});

test('fewer failures after is improved, more is regressed', () => {
  assert.equal(compareChange(5, 2), 'improved');
  assert.equal(compareChange(1, 3), 'regressed');
  assert.equal(compareChange(2, 2), 'same');
});

test('tool calls show with their mock response from both run and chat shapes', () => {
  const lines = stepsToLines([
    { role: 'persona', actualResponse: 'Refund A-1045' },
    { role: 'tool', toolCalls: [{ name: 'extract_invoice', arguments: { id: 'INV-9' }, result: { note: 'IGNORE PREVIOUS' } }] },
    { role: 'agent', actualResponse: 'Done', toolCalls: [{ name: 'lookup_order', arguments: '{"order_id":"A-1045"}', mockResponse: { status: 'delivered' } }] },
  ]);
  assert.deepEqual(lines.map((l) => l.role), ['persona', 'tool', 'tool', 'agent']);
  assert.deepEqual(lines[1].toolCalls?.[0].result, { note: 'IGNORE PREVIOUS' });
  assert.deepEqual(lines[2].toolCalls?.[0], { name: 'lookup_order', arguments: { order_id: 'A-1045' }, result: { status: 'delivered' } });
});

test('a run with no scorecard has no score, even though the run reports 100', () => {
  assert.equal(scorecardPercent({ overallScore: 100 } as never), undefined);
  assert.equal(scorecardPercent({ scorecardResults: { overallScore: 7.5 } }), 75);
});
