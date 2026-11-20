import { ScorecardCriteria, PatternCriteriaSettings } from '../schemas';
import {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from './criteria-handler.interface';
import { LibraryPattern, resolvePresets } from './pattern-library';

/** Guard against pathological regex cost on a huge transcript. */
const MAX_SCAN_CHARS = 200_000;
/** Characters of surrounding text included on each side of a match in evidence. */
const EVIDENCE_CONTEXT = 40;
const DEFAULT_MAX_EVIDENCE = 5;

interface Match {
  patternId: string;
  label: string;
  speaker: string;
  snippet: string;
}

/**
 * Deterministic pattern matching over a transcript. No LLM call, no cost, no sampling variance.
 *
 * Some failures are decidable by inspection: unfilled template output is wrong regardless of
 * context, so a regex answers exactly what an LLM judge would answer approximately and for a fee.
 *
 * Defaults to `must_not_match` against agent turns only. The persona may say anything, so scanning
 * its turns would fail the agent for output it does not control.
 */
export class PatternHandler implements CriteriaHandler {
  readonly type = 'pattern';

  async evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult> {
    const settings = (criteria.settings || {}) as PatternCriteriaSettings;

    const presetNames = normalizeList(settings.presets);
    const rawPatterns = normalizeList(settings.patterns);

    if (presetNames.length === 0 && rawPatterns.length === 0) {
      return {
        result: null,
        passed: false,
        notApplicable: true,
        reasoning:
          'No patterns configured. Set `presets` (placeholder, system_prompt_leak, pii, internal_ids) and/or `patterns` (custom regex strings).',
        evidence: [],
      };
    }

    const flags = settings.caseSensitive ? 'g' : 'gi';
    const { patterns: presetPatterns, unknown } = resolvePresets(presetNames);

    const compiled: LibraryPattern[] = [];
    const invalid: string[] = [];

    // Recompile preset regexes per evaluation. The library exports shared RegExp objects with the `g`
    // flag, and `g` regexes carry mutable `lastIndex` — reusing the instance across evaluations makes
    // matching depend on what ran before it.
    for (const p of presetPatterns) {
      compiled.push({ ...p, regex: new RegExp(p.regex.source, p.regex.flags) });
    }

    for (const src of rawPatterns) {
      try {
        compiled.push({
          id: `custom:${src}`,
          label: `Custom pattern /${src}/`,
          regex: new RegExp(src, flags),
        });
      } catch {
        invalid.push(src);
      }
    }

    if (compiled.length === 0) {
      return {
        result: null,
        passed: false,
        notApplicable: true,
        reasoning: `No usable patterns. ${describeConfigProblems(unknown, invalid)}`.trim(),
        evidence: [],
      };
    }

    const speaker = settings.speaker || 'agent';
    const turns = collectTurns(context, speaker);

    if (turns.length === 0) {
      return {
        result: null,
        passed: false,
        notApplicable: true,
        reasoning: `No ${speaker === 'any' ? '' : speaker + ' '}turns found in the transcript to scan.`.replace(
          /\s+/g,
          ' ',
        ),
        evidence: [],
      };
    }

    const maxEvidence = settings.maxEvidence ?? DEFAULT_MAX_EVIDENCE;
    const matches = findMatches(turns, compiled, maxEvidence);

    const matchType = settings.matchType || 'must_not_match';
    const found = matches.length > 0;
    const passed = matchType === 'must_not_match' ? !found : found;

    const firedRules = [...new Set(matches.map((m) => m.patternId))];
    const configNote = describeConfigProblems(unknown, invalid);

    let reasoning: string;
    if (matchType === 'must_not_match') {
      reasoning = found
        ? `Prohibited pattern${firedRules.length > 1 ? 's' : ''} matched in ${speaker} output: ${firedRules.join(', ')} (${matches.length} occurrence${matches.length > 1 ? 's' : ''}).`
        : `No prohibited patterns matched across ${compiled.length} rule${compiled.length > 1 ? 's' : ''}.`;
    } else {
      reasoning = found
        ? `Required pattern${firedRules.length > 1 ? 's' : ''} matched: ${firedRules.join(', ')}.`
        : `None of the ${compiled.length} required pattern${compiled.length > 1 ? 's' : ''} matched the ${speaker} output.`;
    }
    if (configNote) reasoning += ` ${configNote}`;

    return {
      result: passed,
      passed,
      reasoning,
      evidence: matches
        .slice(0, maxEvidence)
        .map((m) => `[${m.patternId}] ${m.speaker}: "${m.snippet}"`),
    };
  }
}

function normalizeList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.filter((v) => typeof v === 'string' && v.trim().length > 0);
}

function describeConfigProblems(unknown: string[], invalid: string[]): string {
  const parts: string[] = [];
  if (unknown.length > 0) parts.push(`Unknown preset(s) ignored: ${unknown.join(', ')}.`);
  if (invalid.length > 0) parts.push(`Invalid regex ignored: ${invalid.join(', ')}.`);
  return parts.join(' ');
}

/**
 * Pull the turns to scan. Prefers structured segments; falls back to parsing the joined transcript,
 * which is written as "Agent: ..." / "Customer: ..." lines by the execution service.
 */
function collectTurns(
  context: EvaluationContext,
  speaker: 'agent' | 'customer' | 'any',
): Array<{ speaker: string; text: string }> {
  const wanted = (s: string) =>
    speaker === 'any' ? true : s.toLowerCase() === speaker;

  if (context.segments && context.segments.length > 0) {
    return context.segments
      .filter((s) => wanted(s.speaker) && typeof s.text === 'string' && s.text.length > 0)
      .map((s) => ({ speaker: s.speaker, text: s.text }));
  }

  const text = context.transcriptText || '';
  if (!text) return [];

  const turns: Array<{ speaker: string; text: string }> = [];
  let current: { speaker: string; text: string } | null = null;

  for (const line of text.split('\n')) {
    const labelled = /^(agent|customer|persona|user)\s*:\s?(.*)$/i.exec(line);
    if (labelled) {
      const who = labelled[1].toLowerCase() === 'agent' ? 'agent' : 'customer';
      current = { speaker: who, text: labelled[2] };
      turns.push(current);
    } else if (current) {
      // Continuation of a multi-line turn.
      current.text += '\n' + line;
    } else if (speaker === 'any') {
      // Unlabelled transcript — scan it wholesale rather than silently skipping it.
      turns.push({ speaker: 'unknown', text: line });
    }
  }

  return turns.filter((t) => wanted(t.speaker) && t.text.trim().length > 0);
}

function findMatches(
  turns: Array<{ speaker: string; text: string }>,
  patterns: LibraryPattern[],
  maxEvidence: number,
): Match[] {
  const matches: Match[] = [];
  let scanned = 0;

  for (const turn of turns) {
    if (scanned >= MAX_SCAN_CHARS) break;
    const text = turn.text.slice(0, MAX_SCAN_CHARS - scanned);
    scanned += text.length;

    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      let guard = 0;

      while ((m = pattern.regex.exec(text)) !== null) {
        matches.push({
          patternId: pattern.id,
          label: pattern.label,
          speaker: turn.speaker,
          snippet: snippetAround(text, m.index, m[0].length),
        });

        // Zero-length match would loop forever; advance manually.
        if (m[0].length === 0) pattern.regex.lastIndex++;
        if (!pattern.regex.global) break;
        // One occurrence per rule per turn is enough to prove the failure.
        if (++guard >= 1) break;
      }

      // Enough evidence gathered — the verdict cannot change by scanning further.
      if (matches.length >= maxEvidence * 2) return matches;
    }
  }

  return matches;
}

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - EVIDENCE_CONTEXT);
  const end = Math.min(text.length, index + length + EVIDENCE_CONTEXT);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return (prefix + text.slice(start, end) + suffix).replace(/\s+/g, ' ').trim();
}
