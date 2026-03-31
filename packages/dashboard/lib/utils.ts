import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Speaker colors aligned with chanl-admin transcripts */
export const SPEAKER_COLORS = {
  agent: 'oklch(0.65 0.15 200)',
  persona: 'oklch(0.67 0.13 39)',
} as const;
