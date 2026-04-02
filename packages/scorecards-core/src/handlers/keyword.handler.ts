import { ScorecardCriteria, KeywordCriteriaSettings } from '../schemas';
import {
  CriteriaHandler,
  CriteriaHandlerResult,
  EvaluationContext,
} from './criteria-handler.interface';

export class KeywordHandler implements CriteriaHandler {
  readonly type = 'keyword';

  async evaluate(
    criteria: ScorecardCriteria,
    context: EvaluationContext,
  ): Promise<CriteriaHandlerResult> {
    const settings = criteria.settings as KeywordCriteriaSettings;
    // Support both 'keyword' (singular) and 'keywords' (plural) from DB
    const rawKeywords = settings.keywords || settings.keyword;
    if (!rawKeywords || (Array.isArray(rawKeywords) && rawKeywords.length === 0)) {
      return {
        result: false,
        passed: false,
        reasoning: 'No keywords configured for this criterion.',
        evidence: [],
      };
    }
    const keywords = Array.isArray(rawKeywords) ? rawKeywords : [rawKeywords];
    const caseSensitive = settings.caseSensitive ?? false;
    // Support 'any'/'all' matchType aliases alongside 'must_contain'/'must_not_contain'
    const rawMatchType = settings.matchType || 'must_contain';
    const matchType = rawMatchType === 'any' ? 'must_contain'
      : rawMatchType === 'none' ? 'must_not_contain'
      : rawMatchType;

    const text = caseSensitive
      ? context.transcriptText
      : context.transcriptText.toLowerCase();

    const normalizedKeywords = caseSensitive
      ? keywords
      : keywords.map((k) => k.toLowerCase());

    const foundKeywords: string[] = [];
    const evidence: string[] = [];

    for (const keyword of normalizedKeywords) {
      if (text.includes(keyword)) {
        foundKeywords.push(keyword);

        // Extract evidence snippets from segments
        if (context.segments) {
          for (const seg of context.segments) {
            const segText = caseSensitive ? seg.text : seg.text.toLowerCase();
            if (segText.includes(keyword) && evidence.length < 3) {
              evidence.push(
                `[${seg.speaker}]: "${seg.text.substring(0, 200)}"`,
              );
            }
          }
        }

        if (evidence.length >= 3) break;
      }
    }

    const found = foundKeywords.length > 0;
    const passed =
      matchType === 'must_contain' ? found : !found;

    const reasoning =
      matchType === 'must_contain'
        ? found
          ? `Keywords found: ${foundKeywords.join(', ')}`
          : `None of the expected keywords were found: ${keywords.join(', ')}`
        : found
          ? `Prohibited keywords found: ${foundKeywords.join(', ')}`
          : `No prohibited keywords were found`;

    return { result: passed, passed, reasoning, evidence };
  }
}
