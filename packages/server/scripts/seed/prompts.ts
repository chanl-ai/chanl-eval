/**
 * Re-export only. The default prompt definitions live in `src/prompts/default-prompts.ts` because
 * `scripts/` is excluded from the TypeScript build (`include: ["src/**\/*"]`), so BootstrapService —
 * which is what the Docker quickstart actually runs — cannot import from here.
 *
 * Keeping the data in src and re-exporting it means the manual seeder and the automatic bootstrap
 * seed identical prompts, rather than drifting into two definitions of "the defaults".
 */
export { DEFAULT_PROMPTS as PROMPTS } from '../../src/prompts/default-prompts';
