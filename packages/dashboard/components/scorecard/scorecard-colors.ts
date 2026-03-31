'use client';

/**
 * Scorecard Status Colors — copied from @chanl-ai/platform-sdk.
 * Uses OKLCH color space with CSS custom property overrides.
 */
export const SCORECARD_COLORS = {
  pass: {
    bg: 'var(--scorecard-pass-bg, oklch(0.609 0.126 221.723 / 15%))',
    border: 'var(--scorecard-pass-border, oklch(0.609 0.126 221.723 / 25%))',
    solid: 'var(--scorecard-pass-solid, oklch(0.609 0.126 221.723))',
    text: 'var(--scorecard-pass-text, oklch(0.52 0.105 221.723))',
    bar: 'var(--scorecard-pass-bar, oklch(0.705 0.14 215.221))',
  },
  fail: {
    bg: 'var(--scorecard-fail-bg, oklch(0.645 0.246 16.439 / 15%))',
    border: 'var(--scorecard-fail-border, oklch(0.645 0.246 16.439 / 25%))',
    solid: 'var(--scorecard-fail-solid, oklch(0.645 0.246 16.439))',
    text: 'var(--scorecard-fail-text, oklch(0.55 0.22 16.439))',
    bar: 'var(--scorecard-fail-bar, oklch(0.777 0.152 24.568))',
  },
  warning: {
    bg: 'var(--scorecard-warning-bg, oklch(0.705 0.213 47.604 / 15%))',
    border: 'var(--scorecard-warning-border, oklch(0.705 0.213 47.604 / 25%))',
    solid: 'var(--scorecard-warning-solid, oklch(0.705 0.213 47.604))',
    text: 'var(--scorecard-warning-text, oklch(0.6 0.19 47.604))',
    bar: 'var(--scorecard-warning-bar, oklch(0.82 0.16 84.429))',
  },
  neutral: {
    bg: 'var(--scorecard-neutral-bg, oklch(0.708 0.018 264.436 / 15%))',
    border: 'var(--scorecard-neutral-border, oklch(0.708 0.018 264.436 / 25%))',
    solid: 'var(--scorecard-neutral-solid, oklch(0.708 0.018 264.436))',
    text: 'var(--scorecard-neutral-text, oklch(0.551 0.018 264.436))',
    bar: 'var(--scorecard-neutral-bar, oklch(0.551 0.018 264.436))',
  },
} as const;

export type ScorecardStatus = keyof typeof SCORECARD_COLORS;

export function getScorecardStatusColors(status: ScorecardStatus) {
  return SCORECARD_COLORS[status];
}

export function getStatusFromPassRate(passRate: number, threshold = 0.8): ScorecardStatus {
  if (passRate >= threshold) return 'pass';
  if (passRate >= 0.5) return 'warning';
  return 'fail';
}
