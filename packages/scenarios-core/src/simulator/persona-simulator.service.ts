import { Injectable } from '@nestjs/common';

export interface PersonaTraits {
  name: string;
  emotion: string;
  speechStyle: string;
  intentClarity: string;
  backgroundNoise?: boolean;
  description?: string;
  backstory?: string;
  gender?: string;
  language?: string;
  accent?: string;
  behavior?: {
    personality?: string;
    emotionalState?: string;
    cooperationLevel?: string;
    patience?: string;
    communicationStyle?: string;
  };
  conversationTraits?: {
    allowInterruptions?: boolean;
    interruptionFrequency?: string;
    asksClarifyingQuestions?: boolean;
    repeatsInformation?: boolean;
    goesOffTopic?: boolean;
  };
}

export interface VoiceConfig {
  voiceId: string;
  provider: string;
  speed: number;
  emotion: string;
  backgroundNoise: boolean;
}

@Injectable()
export class PersonaSimulatorService {
  /**
   * Convert persona traits into an LLM system prompt
   */
  toSystemPrompt(persona: PersonaTraits, scenarioPrompt: string): string {
    const parts: string[] = [];

    parts.push(
      'You are simulating a user in a conversation with a customer service agent.',
    );
    parts.push(`\nYour goal: ${scenarioPrompt}`);

    // Emotional state
    parts.push('\n\n## Emotional State');
    parts.push(this.getEmotionPrompt(persona.emotion));

    // Communication style
    parts.push('\n\n## Communication Style');
    parts.push(this.getCommunicationStylePrompt(persona));

    // Intent clarity
    parts.push('\n\n## How to Express Your Needs');
    parts.push(this.getIntentClarityPrompt(persona.intentClarity));

    // Cooperation level (from behavior traits)
    const cooperationLevel = persona.behavior?.cooperationLevel;
    if (cooperationLevel) {
      parts.push('\n\n## Cooperation Level');
      parts.push(this.getCooperationPrompt(cooperationLevel));
    }

    // Patience
    const patience = persona.behavior?.patience;
    if (patience) {
      parts.push('\n\n## Patience');
      parts.push(this.getPatiencePrompt(patience));
    }

    // Interruption behavior
    const interruptionFrequency =
      persona.conversationTraits?.interruptionFrequency;
    if (interruptionFrequency && interruptionFrequency !== 'never') {
      parts.push('\n\n## Interruption Behavior');
      parts.push(this.getInterruptionPrompt(interruptionFrequency));
    }

    // Backstory
    if (persona.backstory) {
      parts.push('\n\n## Your Background');
      parts.push(persona.backstory);
    }

    // Final instruction
    parts.push(
      '\n\n## Important',
      'Stay in character throughout the conversation. Respond naturally as this persona would respond.',
      'Keep responses conversational and realistic - not too long or too short.',
    );

    return parts.join('\n');
  }

  /**
   * Get voice configuration for voice mode
   */
  getVoiceConfig(persona: PersonaTraits): VoiceConfig {
    const baseMapping: Record<string, { voiceId: string; provider: string }> = {
      male: { voiceId: 'josh', provider: 'elevenlabs' },
      female: { voiceId: 'rachel', provider: 'elevenlabs' },
    };

    const base = baseMapping[persona.gender || 'female'] || baseMapping.female;

    return {
      ...base,
      speed: this.getVoiceSpeed(persona.speechStyle),
      emotion: persona.emotion,
      backgroundNoise: persona.backgroundNoise || false,
    };
  }

  /**
   * Check if persona should interrupt based on frequency
   */
  shouldInterrupt(persona: PersonaTraits): boolean {
    const freq = persona.conversationTraits?.interruptionFrequency;
    if (!freq || freq === 'never') return false;

    const probabilities: Record<string, number> = {
      rarely: 0.2,
      sometimes: 0.5,
      often: 0.8,
      frequently: 0.8,
    };

    return Math.random() < (probabilities[freq] || 0);
  }

  private getEmotionPrompt(emotion: string): string {
    const prompts: Record<string, string> = {
      friendly:
        'You are friendly and warm. Use polite language and show appreciation.',
      polite:
        'You are polite and courteous. Use formal language and express gratitude.',
      neutral:
        'You are calm and neutral. Express yourself matter-of-factly without strong emotion.',
      calm: 'You are calm and composed. Speak steadily without rushing or showing anxiety.',
      concerned:
        'You are concerned and worried. Express your worry about the situation and ask for reassurance.',
      stressed:
        'You are stressed and overwhelmed. Speak quickly, express urgency, and may become flustered.',
      annoyed:
        'You are annoyed and short-tempered. Express mild displeasure and be somewhat curt.',
      frustrated:
        'You are frustrated and impatient. Express dissatisfaction with delays, unclear answers, or repeated questions. Your tone should convey annoyance.',
      irritated:
        'You are irritated and on edge. Be confrontational when provoked. Express your displeasure clearly and firmly.',
      curious:
        'You are curious and inquisitive. Ask many follow-up questions. Want to understand everything fully.',
      distracted:
        'You are distracted and not fully focused. Sometimes lose track of the conversation. Ask the agent to repeat things.',
    };

    return prompts[emotion] || prompts.neutral;
  }

  private getCommunicationStylePrompt(persona: PersonaTraits): string {
    const parts: string[] = [];

    const speechPrompts: Record<string, string> = {
      fast: "Keep your responses short and to the point. Don't elaborate unless asked.",
      slow: 'Take your time responding. Provide detailed explanations and think through your questions.',
      normal: 'Respond at a normal pace with moderate detail.',
      moderate: 'Respond at a measured pace. Neither too brief nor too verbose.',
    };

    parts.push(speechPrompts[persona.speechStyle] || speechPrompts.normal);

    const commStyle = persona.behavior?.communicationStyle;
    if (commStyle) {
      const commPrompts: Record<string, string> = {
        direct:
          "Be direct and to the point. Don't use unnecessary pleasantries.",
        indirect:
          'Express your needs indirectly. Hint at problems rather than stating them outright.',
        verbose:
          'Provide lots of detail. Explain your situation at length before getting to the point.',
        concise: 'Be brief and efficient with words. Say only what is necessary.',
        rambling:
          'Provide lengthy, meandering responses. Go off on tangents. Include unnecessary details.',
      };

      const prompt = commPrompts[commStyle];
      if (prompt) parts.push(prompt);
    }

    return parts.join(' ');
  }

  private getIntentClarityPrompt(intentClarity: string): string {
    const prompts: Record<string, string> = {
      'very clear':
        'State your needs clearly and specifically from the start. Provide all relevant details upfront.',
      'slightly unclear':
        'State your general need but leave out some details. Provide more information when asked.',
      slurred:
        "Mumble and be unclear. Don't enunciate your words well. Make the agent ask for clarification.",
      'slightly slurred':
        'Speak somewhat unclearly. Occasionally be hard to understand.',
      mumbled:
        "Be very unclear in how you express yourself. Don't state your actual need directly.",
      unclear:
        'Be vague about what you need. Make the agent work to understand your request. Reveal information slowly.',
    };

    return prompts[intentClarity] || prompts['slightly unclear'];
  }

  private getCooperationPrompt(level: string): string {
    const prompts: Record<string, string> = {
      'very cooperative':
        'Be extremely cooperative. Answer all questions fully. Follow instructions immediately.',
      cooperative:
        'Be cooperative and helpful. Answer questions and follow reasonable instructions.',
      neutral:
        'Be neutral in your cooperation. Answer direct questions but do not volunteer extra information.',
      difficult:
        "Be somewhat resistant. Question instructions. Don't provide information easily. Make the agent work for it.",
      hostile:
        'Be hostile and adversarial. Challenge everything the agent says. Refuse to cooperate unless given good reasons.',
    };

    return prompts[level] || prompts.cooperative;
  }

  private getPatiencePrompt(patience: string): string {
    const prompts: Record<string, string> = {
      'very patient':
        'Be extremely patient. Wait calmly for responses. Never express frustration about delays.',
      patient:
        'Be patient with the agent. Allow time for them to look things up or explain.',
      neutral:
        'Have normal patience. Tolerate reasonable wait times but note if things take too long.',
      impatient:
        'Be impatient. Express frustration with delays. Ask "how long will this take?" frequently.',
      'very impatient':
        'Be extremely impatient. Demand immediate answers. Threaten to escalate or leave if things take too long. Interrupt the agent if they are too slow.',
    };

    return prompts[patience] || prompts.neutral;
  }

  private getInterruptionPrompt(frequency: string): string {
    const prompts: Record<string, string> = {
      rarely:
        'Occasionally interrupt if the agent takes too long to respond.',
      sometimes:
        "Interrupt the agent sometimes, especially if they're being too verbose.",
      often:
        "Frequently interrupt the agent mid-response with follow-up questions or comments. Don't let them finish long explanations.",
      frequently:
        "Frequently interrupt the agent mid-response with follow-up questions or comments. Don't let them finish long explanations.",
    };

    return prompts[frequency] || '';
  }

  private getVoiceSpeed(speechStyle: string): number {
    const speeds: Record<string, number> = {
      fast: 1.2,
      slow: 0.8,
      normal: 1.0,
      moderate: 1.0,
    };
    return speeds[speechStyle] || 1.0;
  }
}
