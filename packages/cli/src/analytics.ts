import { loadConfig } from './config';
import { randomUUID } from 'crypto';

interface AnalyticsEvent {
  event: string;
  distinctId: string;
  properties?: Record<string, any>;
  timestamp: string;
}

const POSTHOG_KEY = 'phc_chanl_eval_placeholder';
const POSTHOG_HOST = 'https://app.posthog.com';

let initialized = false;
let analyticsEnabled = false;
let distinctId = '';

/**
 * Initialize analytics from config.
 * No-op if analytics are disabled.
 */
export function initAnalytics(): void {
  try {
    const config = loadConfig();
    analyticsEnabled = config.analytics !== false;
    distinctId = config.analyticsId || '';

    if (!distinctId && analyticsEnabled) {
      // Generate a new anonymous ID — it'll be persisted on next config save
      distinctId = randomUUID();
    }

    initialized = true;
  } catch {
    initialized = true;
    analyticsEnabled = false;
  }
}

/**
 * Track an analytics event. No-op if disabled.
 * Never throws — errors are silently swallowed.
 */
export function track(
  event: string,
  properties?: Record<string, any>,
): void {
  if (!initialized) {
    initAnalytics();
  }
  if (!analyticsEnabled || !distinctId) return;

  try {
    const payload: AnalyticsEvent = {
      event,
      distinctId,
      properties: {
        ...properties,
        $lib: 'chanl-cli',
        $lib_version: '0.1.0',
      },
      timestamp: new Date().toISOString(),
    };

    // Fire-and-forget POST to PostHog
    // Using dynamic import to avoid adding posthog-node as hard dependency
    const https = require('https');
    const data = JSON.stringify({
      api_key: POSTHOG_KEY,
      batch: [payload],
    });

    const url = new URL(`${POSTHOG_HOST}/batch/`);
    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 3000,
      },
      () => {
        // Response ignored — fire and forget
      },
    );

    req.on('error', () => {
      // Silently ignore network errors
    });

    req.write(data);
    req.end();
  } catch {
    // Never throw from analytics
  }
}

/**
 * Get the current analytics distinct ID.
 */
export function getAnalyticsId(): string {
  if (!initialized) {
    initAnalytics();
  }
  return distinctId;
}
