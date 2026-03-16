/**
 * PostHog — Product analytics initialization
 *
 * Provides a singleton PostHog client and event tracking helpers.
 * Set NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST env vars to enable.
 */

import posthog from "posthog-js";

let initialized = false;

export function initPostHog() {
  if (initialized) return;
  if (typeof window === "undefined") return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  if (!key) {
    // PostHog not configured — silently skip
    return;
  }

  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    persistence: "localStorage+cookie",
    loaded: () => {
      initialized = true;
    },
  });
}

export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  posthog.identify(userId, properties);
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  posthog.capture(event, properties);
}

export function resetUser() {
  if (typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  posthog.reset();
}

// ═══════════════════════════════════════════════════════════════
// Compute-specific events
// ═══════════════════════════════════════════════════════════════

export function trackComputeEvent(
  action: string,
  properties?: Record<string, unknown>,
) {
  trackEvent(`compute.${action}`, properties);
}
