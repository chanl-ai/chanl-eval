#!/usr/bin/env node
// Verifies every `COPY packages/<name>/...` path referenced by any Dockerfile
// actually exists in the repo. Catches the regression from issue #8, where a
// Dockerfile referenced a package directory that was deleted — breaking
// `docker compose up` for everyone who followed the README.
//
// Zero deps; runs on bare Node. Called from the pre-push hook.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COPY_RE = /^\s*COPY\s+(?:--from=\S+\s+)?(\S+)\s+(\S+)/i;

function findDockerfiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.next' || entry === 'dist') continue;
    if (entry === '.claude') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) findDockerfiles(full, out);
    else if (/^Dockerfile(\..+)?$/.test(entry)) out.push(full);
  }
  return out;
}

const errors = [];
const dockerfiles = findDockerfiles(ROOT);

for (const file of dockerfiles) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, i) => {
    const m = line.match(COPY_RE);
    if (!m) return;
    const src = m[1];
    // Only validate build-context paths (skip --from=builder stage copies and absolute paths).
    if (src.startsWith('/') || src.startsWith('--')) return;
    if (line.includes('--from=')) return;
    // Allow globs (COPY package.json pnpm-lock.yaml* ./). We only care about explicit package paths.
    if (!src.startsWith('packages/')) return;

    const resolved = join(ROOT, src);
    // Strip trailing glob chars for existence check.
    const probe = resolved.replace(/\*$/, '');
    if (!existsSync(probe)) {
      errors.push(`${rel}:${i + 1}  →  missing: ${src}`);
    }
  });
}

if (errors.length) {
  console.error('❌ Dockerfile references paths that do not exist:');
  for (const e of errors) console.error('  ' + e);
  console.error('\nFix: remove the stale COPY line, or restore the package.');
  process.exit(1);
}

console.log(`✓ All Dockerfile package paths valid (${dockerfiles.length} file(s) checked)`);
