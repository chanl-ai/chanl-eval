#!/usr/bin/env node
/**
 * File size budget.
 *
 * Counting files over the limit is insensitive to severity: a file going from 799 to 865 lines does
 * not change the count, so appending to an already-oversized file reports as no regression. Total
 * excess — the sum of lines above the limit — moves whenever any oversized file grows.
 *
 *   node scripts/check-file-size.mjs            report against the committed baseline
 *   node scripts/check-file-size.mjs --update   write the current totals as the new baseline
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const LIMIT = 500;
const BASELINE_PATH = new URL('./file-size-baseline.json', import.meta.url);

// execFile, not exec: no shell, so the glob patterns reach git verbatim instead of being
// expanded or reinterpreted on the way.
const files = execFileSync('git', ['ls-files', '*.ts', '*.tsx'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !f.includes('/dist/') && !/\.spec\.|\.test\./.test(f));

let excess = 0;
const over = [];

for (const file of files) {
  let lines;
  try {
    lines = readFileSync(file, 'utf8').split('\n').length;
  } catch {
    continue;
  }
  if (lines > LIMIT) {
    excess += lines - LIMIT;
    over.push({ file, lines });
  }
}

over.sort((a, b) => b.lines - a.lines);
const current = { totalExcess: excess, filesOverLimit: over.length };

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n');
  console.log(`Baseline updated: ${excess} excess lines across ${over.length} files.`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error('No baseline. Run with --update to create one.');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const delta = current.totalExcess - baseline.totalExcess;

console.log(`Files over ${LIMIT} lines: ${over.length} (baseline ${baseline.filesOverLimit})`);
console.log(`Total excess: ${current.totalExcess} (baseline ${baseline.totalExcess}, ${delta >= 0 ? '+' : ''}${delta})`);

if (delta > 0) {
  console.error(
    `\nOversized files grew by ${delta} lines. Split the file, or run --update with a reason if the growth is deliberate.`,
  );
  console.error('\nLargest files:');
  for (const { file, lines } of over.slice(0, 8)) {
    console.error(`  ${String(lines).padStart(5)}  ${file}`);
  }
  process.exit(1);
}

if (delta < 0) {
  console.log(`\n${-delta} lines removed from oversized files. Run --update to lock it in.`);
}
