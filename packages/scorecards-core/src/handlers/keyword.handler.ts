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
    const keywords = Array.isArray(settings.keyword)
      ? settings.keyword
      : [settings.keyword];
    const caseSensitive = settings.caseSensitive ?? false;
    const matchType = settings.matchType || 'must_contain';

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

    return { result: found, passed, reasoning, evidence };
  }
}
