/**
 * The default scorecard seeded on first boot: categories, weights, and criteria definitions.
 *
 * Data, not behaviour. Kept out of the service so that editing the rubric does not mean editing a
 * service, and so the service's own size reflects its logic.
 */
import { CriteriaType } from './schemas/scorecard-criteria.schema';

export const DEFAULT_SCORECARD = {
      name: 'Call Quality Scorecard',
      description:
        'Comprehensive call quality evaluation with communication, problem-solving, and timing metrics',
      status: 'active',
      categories: [
        {
          name: 'Opening & Greeting',
          description: 'Evaluates how the agent opens the call',
          weight: 15,
          criteria: [
            {
              key: 'proper_greeting',
              name: 'Proper Greeting',
              type: CriteriaType.PROMPT,
              settings: {
                description:
                  'Did the agent introduce themselves and greet the customer professionally?',
                evaluationType: 'boolean',
              },
              threshold: { expectedValue: true },
            },
            {
              key: 'greeting_keywords',
              name: 'Greeting Keywords',
              type: CriteriaType.KEYWORD,
              settings: {
                matchType: 'must_contain',
                keyword: [
                  'hello',
                  'hi',
                  'good morning',
                  'good afternoon',
                  'good evening',
                  'thank you for calling',
                  'how can I help',
                ],
              },
            },
          ],
        },
        {
          name: 'Problem Resolution',
          description:
            'Evaluates how well the agent addresses customer issues',
          weight: 35,
          criteria: [
            {
              key: 'issue_identified',
              name: 'Issue Identified',
              type: CriteriaType.PROMPT,
              settings: {
                description:
                  "Did the agent correctly identify and understand the customer's issue or request?",
                evaluationType: 'boolean',
              },
              threshold: { expectedValue: true },
            },
            {
              key: 'resolution_quality',
              name: 'Resolution Quality',
              type: CriteriaType.PROMPT,
              settings: {
                description:
                  "Rate how effectively the agent resolved or addressed the customer's issue (0-10, where 10 is fully resolved)",
                evaluationType: 'score',
              },
              threshold: { min: 7, max: 10 },
            },
            {
              key: 'clear_explanation',
              name: 'Clear Explanation',
              type: CriteriaType.PROMPT,
              settings: {
                description:
                  'Did the agent provide clear and understandable explanations?',
                evaluationType: 'boolean',
              },
              threshold: { expectedValue: true },
            },
          ],
        },
        {
          name: 'Communication Quality',
          description:
            'Evaluates professionalism and communication style',
          weight: 25,
          criteria: [
            {
              key: 'politeness_score',
              name: 'Politeness & Professionalism',
              type: CriteriaType.PROMPT,
              settings: {
                description:
                  "Rate the agent's overall politeness and professional demeanor (0-10)",
                evaluationType: 'score',
              },
              threshold: { min: 7, max: 10 },
            },
            {
              key: 'empathy_shown',
              name: 'Empathy Demonstrated',
              type: CriteriaType.PROMPT,
              settings: {
                description:
                  "Did the agent show empathy and understanding toward the customer's situation?",
                evaluationType: 'boolean',
              },
              threshold: { expectedValue: true },
            },
            {
              key: 'no_inappropriate_language',
              name: 'Professional Language',
              type: CriteriaType.KEYWORD,
              settings: {
                matchType: 'must_not_contain',
                keyword: [
                  'damn',
                  'hell',
                  'crap',
                  'stupid',
                  'idiot',
                  'shut up',
                ],
              },
            },
          ],
        },
        {
          name: 'Closing & Follow-up',
          description: 'Evaluates how the agent closes the call',
          weight: 10,
          criteria: [
            {
              key: 'proper_closing',
              name: 'Proper Closing',
              type: CriteriaType.PROMPT,
              settings: {
                description:
                  'Did the agent properly close the call by thanking the customer and offering further assistance?',
                evaluationType: 'boolean',
              },
              threshold: { expectedValue: true },
            },
            {
              key: 'closing_keywords',
              name: 'Closing Keywords',
              type: CriteriaType.KEYWORD,
              settings: {
                matchType: 'must_contain',
                keyword: [
                  'thank you',
                  'thanks',
                  'have a great day',
                  'is there anything else',
                  'goodbye',
                  'bye',
                ],
              },
            },
          ],
        },
        {
          name: 'Timing Metrics',
          description:
            'Evaluates response time and call efficiency',
          weight: 15,
          criteria: [
            {
              key: 'agent_response_time',
              name: 'Agent Response Time',
              type: CriteriaType.RESPONSE_TIME,
              settings: { participant: 'agent' },
              threshold: { max: 5 },
            },
          ],
        },
      ],
    } as const;
