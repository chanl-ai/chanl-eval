/**
 * Avatar Gradient Utilities
 *
 * Maps platforms/credentials to beautiful gradient backgrounds
 * Reused from getting-started page design patterns
 *
 * Now varies gradients based on name for visual diversity
 */

export type Platform =
  | "vapi"
  | "bland"
  | "bland-ai"
  | "elevenlabs"
  | "twilio"
  | "custom"
  | "deepgram"
  | "assemblyai"
  | "pipecat"
  | "daily"
  | "salesforce"
  | "slack"
  | "zapier"
  | "webhooks"
  | "persona" // For personas
  | string; // Allow any string for flexibility

/**
 * Simple hash function to convert string to number
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Platform to gradient arrays mapping
 * Each platform has multiple gradient variations for visual diversity
 */
const PLATFORM_GRADIENT_SETS: Record<string, string[]> = {
  // Voice AI Platforms - Purple/Indigo theme variations (subtle)
  vapi: [
    "from-indigo-500/10 via-violet-500/10 to-purple-500/10",
    "from-indigo-500/12 via-purple-500/12 to-pink-500/10",
    "from-violet-500/10 via-purple-500/12 to-indigo-500/10",
    "from-purple-500/10 via-indigo-500/12 to-violet-500/10",
    "from-indigo-400/10 via-violet-400/10 to-purple-400/10",
    "from-violet-500/12 via-indigo-500/10 to-purple-500/12",
  ],
  bland: [
    "from-indigo-500/10 via-violet-500/10 to-purple-500/10",
    "from-indigo-500/12 via-purple-500/12 to-pink-500/10",
    "from-violet-500/10 via-purple-500/12 to-indigo-500/10",
    "from-purple-500/10 via-indigo-500/12 to-violet-500/10",
    "from-indigo-400/10 via-violet-400/10 to-purple-400/10",
    "from-violet-500/12 via-indigo-500/10 to-purple-500/12",
  ],
  "bland-ai": [
    "from-indigo-500/10 via-violet-500/10 to-purple-500/10",
    "from-indigo-500/12 via-purple-500/12 to-pink-500/10",
    "from-violet-500/10 via-purple-500/12 to-indigo-500/10",
    "from-purple-500/10 via-indigo-500/12 to-violet-500/10",
    "from-indigo-400/10 via-violet-400/10 to-purple-400/10",
    "from-violet-500/12 via-indigo-500/10 to-purple-500/12",
  ],

  // ElevenLabs - Purple/Pink/Rose theme variations (subtle)
  elevenlabs: [
    "from-purple-500/10 via-pink-500/10 to-rose-500/10",
    "from-purple-500/12 via-rose-500/12 to-pink-500/10",
    "from-pink-500/10 via-purple-500/12 to-rose-500/10",
    "from-rose-500/10 via-pink-500/12 to-purple-500/10",
    "from-purple-400/10 via-pink-400/10 to-rose-400/10",
    "from-pink-500/12 via-purple-500/10 to-rose-500/12",
  ],

  // Twilio - Red/Orange/Amber theme variations (subtle)
  twilio: [
    "from-red-500/10 via-orange-500/10 to-amber-500/10",
    "from-red-500/12 via-amber-500/12 to-orange-500/10",
    "from-orange-500/10 via-red-500/12 to-amber-500/10",
    "from-amber-500/10 via-orange-500/12 to-red-500/10",
    "from-red-400/10 via-orange-400/10 to-amber-400/10",
    "from-orange-500/12 via-red-500/10 to-amber-500/12",
  ],

  // Deepgram - Blue/Cyan/Teal theme variations (subtle)
  deepgram: [
    "from-blue-500/10 via-cyan-500/10 to-teal-500/10",
    "from-blue-500/12 via-teal-500/12 to-cyan-500/10",
    "from-cyan-500/10 via-blue-500/12 to-teal-500/10",
    "from-teal-500/10 via-cyan-500/12 to-blue-500/10",
    "from-blue-400/10 via-cyan-400/10 to-teal-400/10",
    "from-cyan-500/12 via-blue-500/10 to-teal-500/12",
  ],

  // AssemblyAI - Blue/Indigo/Purple theme variations (subtle)
  assemblyai: [
    "from-blue-500/10 via-indigo-500/10 to-purple-500/10",
    "from-blue-500/12 via-purple-500/12 to-indigo-500/10",
    "from-indigo-500/10 via-blue-500/12 to-purple-500/10",
    "from-purple-500/10 via-indigo-500/12 to-blue-500/10",
    "from-blue-400/10 via-indigo-400/10 to-purple-400/10",
    "from-indigo-500/12 via-blue-500/10 to-purple-500/12",
  ],

  // Pipecat - Violet/Purple/Fuchsia theme variations (subtle)
  pipecat: [
    "from-violet-500/10 via-purple-500/10 to-fuchsia-500/10",
    "from-violet-500/12 via-fuchsia-500/12 to-purple-500/10",
    "from-purple-500/10 via-violet-500/12 to-fuchsia-500/10",
    "from-fuchsia-500/10 via-purple-500/12 to-violet-500/10",
    "from-violet-400/10 via-purple-400/10 to-fuchsia-400/10",
    "from-purple-500/12 via-violet-500/10 to-fuchsia-500/12",
  ],

  // Daily - Cyan/Blue/Indigo theme variations (subtle)
  daily: [
    "from-cyan-500/10 via-blue-500/10 to-indigo-500/10",
    "from-cyan-500/12 via-indigo-500/12 to-blue-500/10",
    "from-blue-500/10 via-cyan-500/12 to-indigo-500/10",
    "from-indigo-500/10 via-blue-500/12 to-cyan-500/10",
    "from-cyan-400/10 via-blue-400/10 to-indigo-400/10",
    "from-blue-500/12 via-cyan-500/10 to-indigo-500/12",
  ],

  // CRM & Sales - Orange/Amber/Yellow theme variations (subtle)
  salesforce: [
    "from-orange-500/10 via-amber-500/10 to-yellow-500/10",
    "from-orange-500/12 via-yellow-500/12 to-amber-500/10",
    "from-amber-500/10 via-orange-500/12 to-yellow-500/10",
    "from-yellow-500/10 via-amber-500/12 to-orange-500/10",
    "from-orange-400/10 via-amber-400/10 to-yellow-400/10",
    "from-amber-500/12 via-orange-500/10 to-yellow-500/12",
  ],

  // Communication - Purple/Pink/Rose theme variations (subtle)
  slack: [
    "from-purple-500/10 via-pink-500/10 to-rose-500/10",
    "from-purple-500/12 via-rose-500/12 to-pink-500/10",
    "from-pink-500/10 via-purple-500/12 to-rose-500/10",
    "from-rose-500/10 via-pink-500/12 to-purple-500/10",
    "from-purple-400/10 via-pink-400/10 to-rose-400/10",
    "from-pink-500/12 via-purple-500/10 to-rose-500/12",
  ],

  // Automation - Green/Emerald/Teal theme variations (subtle)
  zapier: [
    "from-green-500/10 via-emerald-500/10 to-teal-500/10",
    "from-green-500/12 via-teal-500/12 to-emerald-500/10",
    "from-emerald-500/10 via-green-500/12 to-teal-500/10",
    "from-teal-500/10 via-emerald-500/12 to-green-500/10",
    "from-green-400/10 via-emerald-400/10 to-teal-400/10",
    "from-emerald-500/12 via-green-500/10 to-teal-500/12",
  ],
  webhooks: [
    "from-green-500/10 via-emerald-500/10 to-teal-500/10",
    "from-green-500/12 via-teal-500/12 to-emerald-500/10",
    "from-emerald-500/10 via-green-500/12 to-teal-500/10",
    "from-teal-500/10 via-emerald-500/12 to-green-500/10",
    "from-green-400/10 via-emerald-400/10 to-teal-400/10",
    "from-emerald-500/12 via-green-500/10 to-teal-500/12",
  ],

  // Personas - Diverse color themes (not just green)
  // Uses hash to select from all available color themes for visual variety
  persona: [
    // Green/Emerald/Teal (test & simulate category)
    "from-green-500/10 via-emerald-500/10 to-teal-500/10",
    "from-green-500/12 via-teal-500/12 to-emerald-500/10",
    "from-emerald-500/10 via-green-500/12 to-teal-500/10",
    // Purple/Indigo (getting started category)
    "from-indigo-500/10 via-violet-500/10 to-purple-500/10",
    "from-purple-500/10 via-indigo-500/12 to-violet-500/10",
    // Purple/Pink/Rose (observe & analyze category)
    "from-purple-500/10 via-pink-500/10 to-rose-500/10",
    "from-pink-500/10 via-purple-500/12 to-rose-500/10",
    // Blue/Cyan/Teal (observe & analyze category)
    "from-blue-500/10 via-cyan-500/10 to-teal-500/10",
    "from-cyan-500/10 via-blue-500/12 to-teal-500/10",
    // Orange/Amber/Yellow (optimize & experiment category)
    "from-orange-500/10 via-amber-500/10 to-yellow-500/10",
    "from-amber-500/10 via-orange-500/12 to-yellow-500/10",
    // Blue/Indigo/Purple
    "from-blue-500/10 via-indigo-500/10 to-purple-500/10",
    "from-indigo-500/10 via-blue-500/12 to-purple-500/10",
  ],

  // Contacts - Teal/Emerald/Cyan theme (distinct from persona green and agent purple)
  contact: [
    "from-teal-500/10 via-emerald-500/10 to-cyan-500/10",
    "from-teal-500/12 via-cyan-500/12 to-emerald-500/10",
    "from-emerald-500/10 via-teal-500/12 to-cyan-500/10",
    "from-cyan-500/10 via-emerald-500/12 to-teal-500/10",
    "from-teal-400/10 via-emerald-400/10 to-cyan-400/10",
    "from-emerald-500/12 via-teal-500/10 to-cyan-500/12",
  ],

  // Scorecards - Blue/Indigo/Purple theme variations (matching getting started cards)
  scorecard: [
    "from-blue-500/10 via-indigo-500/10 to-purple-500/10",
    "from-blue-500/12 via-purple-500/12 to-indigo-500/10",
    "from-indigo-500/10 via-blue-500/12 to-purple-500/10",
    "from-purple-500/10 via-indigo-500/12 to-blue-500/10",
    "from-blue-400/10 via-indigo-400/10 to-purple-400/10",
    "from-indigo-500/12 via-blue-500/10 to-purple-500/12",
  ],

  // Custom/Unknown - Neutral theme variations (subtle)
  custom: [
    "from-gray-500/10 via-slate-500/10 to-zinc-500/10",
    "from-gray-500/12 via-zinc-500/12 to-slate-500/10",
    "from-slate-500/10 via-gray-500/12 to-zinc-500/10",
    "from-zinc-500/10 via-slate-500/12 to-gray-500/10",
    "from-gray-400/10 via-slate-400/10 to-zinc-400/10",
    "from-slate-500/12 via-gray-500/10 to-zinc-500/12",
  ],
};

/**
 * Get gradient for a platform based on name (for distribution)
 * Uses hash of name to consistently select a gradient from platform's set
 */
export function getPlatformGradient(platform: Platform, name?: string): string {
  const normalizedPlatform = platform.toLowerCase().trim();
  const gradientSet =
    PLATFORM_GRADIENT_SETS[normalizedPlatform] || PLATFORM_GRADIENT_SETS.custom;

  // If name is provided, use hash to select a gradient from the set
  if (name) {
    const hash = hashString(name);
    const index = hash % gradientSet.length;
    return gradientSet[index];
  }

  // Fallback to first gradient if no name
  return gradientSet[0];
}

/**
 * Platform to gradient mapping (deprecated - kept for backward compatibility)
 * @deprecated Use getPlatformGradient instead
 */
export const PLATFORM_GRADIENTS: Record<string, string> = {
  vapi: PLATFORM_GRADIENT_SETS.vapi[0],
  bland: PLATFORM_GRADIENT_SETS["bland"][0],
  "bland-ai": PLATFORM_GRADIENT_SETS["bland-ai"][0],
  elevenlabs: PLATFORM_GRADIENT_SETS.elevenlabs[0],
  twilio: PLATFORM_GRADIENT_SETS.twilio[0],
  deepgram: PLATFORM_GRADIENT_SETS.deepgram[0],
  assemblyai: PLATFORM_GRADIENT_SETS.assemblyai[0],
  pipecat: PLATFORM_GRADIENT_SETS.pipecat[0],
  daily: PLATFORM_GRADIENT_SETS.daily[0],
  salesforce: PLATFORM_GRADIENT_SETS.salesforce[0],
  slack: PLATFORM_GRADIENT_SETS.slack[0],
  zapier: PLATFORM_GRADIENT_SETS.zapier[0],
  webhooks: PLATFORM_GRADIENT_SETS.webhooks[0],
  persona: PLATFORM_GRADIENT_SETS.persona[0],
  contact: PLATFORM_GRADIENT_SETS.contact[0],
  scorecard: PLATFORM_GRADIENT_SETS.scorecard[0],
  custom: PLATFORM_GRADIENT_SETS.custom[0],
};

/**
 * Get initials from a name
 */
export function getInitials(name: string): string {
  if (!name) return "?";

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Get avatar background color based on platform
 * Returns Tailwind classes for gradient background
 * @deprecated Use getPlatformGradient instead
 */
export function getAvatarBackground(platform: Platform): string {
  return `bg-gradient-to-br ${getPlatformGradient(platform)}`;
}
