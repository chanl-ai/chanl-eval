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
  /** Custom key-value attributes from the persona editor */
  variables?: Record<string, string>;
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
   * Convert persona traits into an LLM system prompt.
   *
   * OSS version: covers basic trait mapping, cooperation levels, patience,
   * conversation flow, and character building. Produces meaningfully different
   * conversations between e.g. a hostile persona vs a cooperative one.
   *
   * chanl cloud extends this with: emotional arcs (escalation/de-escalation),
   * reactive behaviors (jargon/apology detection), negotiation tactics,
   * voice-native speech patterns, and Liquid template customization.
   */
  toSystemPrompt(persona: PersonaTraits, scenarioPrompt: string): string {
    const parts: string[] = [];

    // Character identity
    parts.push(`You are ${persona.name || 'a customer'}.`);

    // Character paragraph — build from available traits
    const characterParagraph = this.buildCharacterParagraph(persona);
    if (characterParagraph) {
      parts.push('');
      parts.push('## Who you are');
      parts.push(characterParagraph);
    }

    // Scenario context
    parts.push('');
    parts.push("## Why you're contacting support");
    parts.push(scenarioPrompt);

    // Emotional state
    parts.push('');
    parts.push('## Emotional State');
    parts.push(this.getEmotionPrompt(persona.emotion));

    // Communication style
    parts.push('');
    parts.push('## Communication Style');
    parts.push(this.getCommunicationStylePrompt(persona));

    // Intent clarity
    parts.push('');
    parts.push('## How to Express Your Needs');
    parts.push(this.getIntentClarityPrompt(persona.intentClarity));

    // Cooperation — what you'll accept and when you'll escalate
    const cooperation = persona.behavior?.cooperationLevel;
    if (cooperation) {
      const negotiation = this.getNegotiationStyle(cooperation);
      parts.push('');
      parts.push('## What you want');
      parts.push(`- Goal: Get your issue resolved`);
      parts.push(`- You'll accept: ${negotiation.acceptable}`);
      parts.push(`- You'll escalate if: ${negotiation.escalation}`);
      parts.push(
        "- You're satisfied when: the agent confirms a specific resolution, not vague promises",
      );

      parts.push('');
      parts.push('## Cooperation Level');
      parts.push(this.getCooperationPrompt(cooperation));
    }

    // Patience — how you react to delays, repeats, scripts
    const patience = persona.behavior?.patience;
    if (patience) {
      const reactions = this.getPatienceReactions(patience);
      parts.push('');
      parts.push('## Patience & Reactions');
      parts.push(this.getPatiencePrompt(patience));
      parts.push(`- If agent makes you repeat yourself → ${reactions.repeat}`);
      parts.push(`- If agent gives scripted response → ${reactions.scripted}`);
      parts.push(`- If agent asks for verification → ${reactions.verification}`);
    }

    // Conversation flow guidance
    parts.push('');
    parts.push('## How the conversation flows');
    parts.push(
      "OPENING: State your reason in 1-2 sentences. Don't dump your whole story.",
    );
    parts.push(
      "EXPLAINING: Give details when asked. Add info gradually. Don't repeat what you already said.",
    );
    const negotiation = this.getNegotiationStyle(cooperation || 'cooperative');
    parts.push(`NEGOTIATING: ${negotiation.style}`);
    parts.push(
      'CLOSING: If satisfied, confirm details and wrap up. If not, express disappointment.',
    );

    // Interruption behavior
    const interruptionFrequency =
      persona.conversationTraits?.interruptionFrequency;
    if (interruptionFrequency && interruptionFrequency !== 'never') {
      parts.push('');
      parts.push('## Interruption Behavior');
      parts.push(this.getInterruptionPrompt(interruptionFrequency));
    }

    // Conversation habits
    if (persona.conversationTraits) {
      const habits = this.getConversationHabits(persona.conversationTraits);
      if (habits.length) {
        parts.push('');
        parts.push('## Your conversation habits');
        habits.forEach((h) => parts.push(`- ${h}`));
      }
    }

    // Backstory
    if (persona.backstory) {
      parts.push('');
      parts.push('## Your Background');
      parts.push(persona.backstory);
    }

    // Pacing guidance
    parts.push('');
    parts.push('## Pacing');
    parts.push(
      "- Don't repeat your issue after the agent acknowledges it",
    );
    parts.push(
      "- Don't restate details you already provided — move the conversation forward",
    );
    parts.push(
      "- If the agent resolved your issue, confirm and say goodbye — don't drag it out",
    );
    parts.push(
      '- If nothing is progressing after several exchanges, mention you need to get going',
    );

    // Final instruction
    parts.push('');
    parts.push(
      'Stay in character throughout the conversation. You are the CUSTOMER, not the agent. Never switch roles.',
    );

    return parts.join('\n');
  }

  /**
   * Build a character paragraph from combined persona traits.
   */
  private buildCharacterParagraph(persona: PersonaTraits): string {
    const parts: string[] = [];
    if (persona.description) parts.push(persona.description);
    if (persona.backstory) parts.push(persona.backstory);

    const traitFragments: string[] = [];
    if (persona.emotion && persona.emotion !== 'neutral')
      traitFragments.push(`feeling ${persona.emotion}`);
    if (persona.behavior?.personality)
      traitFragments.push(persona.behavior.personality);
    if (persona.behavior?.patience)
      traitFragments.push(`${persona.behavior.patience} patience`);
    if (persona.behavior?.communicationStyle)
      traitFragments.push(
        `${persona.behavior.communicationStyle} communicator`,
      );
    if (traitFragments.length) {
      parts.push(`You're ${traitFragments.join(', ')}.`);
    }
    if (persona.speechStyle && persona.speechStyle !== 'normal') {
      parts.push(`You tend to speak at a ${persona.speechStyle} pace.`);
    }

    return (
      parts.join(' ') ||
      `A customer who is feeling ${persona.emotion || 'neutral'}.`
    );
  }

  /**
   * Get patience-based reactions to common agent behaviors.
   */
  private getPatienceReactions(patience: string): {
    repeat: string;
    scripted: string;
    verification: string;
  } {
    switch (patience) {
      case 'very impatient':
        return {
          repeat: 'visibly annoyed, voice gets terse',
          scripted: '"I need an actual answer, not a script."',
          verification: 'sigh, give info quickly',
        };
      case 'impatient':
        return {
          repeat: 'more irritated each time',
          scripted: 'push harder for a real answer',
          verification: 'comply quickly, slight edge in voice',
        };
      case 'patient':
      case 'very patient':
        return {
          repeat: 'comply but note you already mentioned it',
          scripted: 'listen politely, then redirect to your situation',
          verification: 'cooperate easily',
        };
      default:
        // neutral
        return {
          repeat: 'mildly frustrated but comply',
          scripted: '"I appreciate that, but my situation is different..."',
          verification: 'cooperate normally',
        };
    }
  }

  /**
   * Get negotiation style based on cooperation level.
   */
  private getNegotiationStyle(cooperation: string): {
    acceptable: string;
    escalation: string;
    style: string;
  } {
    switch (cooperation) {
      case 'hostile':
      case 'difficult':
        return {
          acceptable: 'only a full resolution — no half-measures',
          escalation: 'agent stalls, deflects, or offers less than promised',
          style:
            "Push hard. Don't accept the first offer. Demand specifics.",
        };
      case 'very cooperative':
        return {
          acceptable: 'a reasonable compromise with clear next steps',
          escalation: 'agent is dismissive or refuses to help entirely',
          style: 'Accept a good offer readily. Thank the agent for their help.',
        };
      default:
        // cooperative, neutral
        return {
          acceptable: 'a fair resolution with a specific commitment',
          escalation:
            'agent refuses without checking or gives the runaround',
          style:
            "Push once if the first offer isn't enough. Accept with good reason.",
        };
    }
  }

  /**
   * Build conversation habit list from traits.
   */
  private getConversationHabits(
    traits: PersonaTraits['conversationTraits'],
  ): string[] {
    if (!traits) return [];
    const habits: string[] = [];
    if (traits.goesOffTopic)
      habits.push(
        'You occasionally go off-topic with a brief tangent before getting back on track.',
      );
    if (traits.repeatsInformation)
      habits.push(
        'You tend to repeat key details to make sure the agent heard you.',
      );
    if (traits.asksClarifyingQuestions)
      habits.push(
        "You ask clarifying questions when something isn't clear.",
      );
    if (traits.interruptionFrequency === 'often')
      habits.push('You tend to interject before the agent finishes.');
    return habits;
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
        'You are frustrated and impatient. Express dissatisfaction with delays, unclear answers, or repeated questions.',
      irritated:
        'You are irritated and on edge. Be confrontational when provoked. Express your displeasure clearly.',
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
        'Be extremely impatient. Demand immediate answers. Threaten to escalate or leave if things take too long.',
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
