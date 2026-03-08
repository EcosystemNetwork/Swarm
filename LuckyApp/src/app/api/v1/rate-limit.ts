/**
 * Simple in-memory sliding-window rate limiter for API routes.
 *
 * LIMITATION: in-memory only — per-process, not shared across instances.
 * For production multi-instance deployments, replace with Redis
 * (e.g. @upstash/ratelimit or ioredis + sliding-window script).
 *
 * Usage:
 *   const limited = rateLimit(identifier);
 *   if (limited) return limited; // returns a 429 Response
 */

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;  // per identifier per window
const SWEEP_INTERVAL_MS = 120_000; // sweep stale entries every 2 min

interface RateLimitEntry {
    timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Periodic sweep to prevent unbounded growth from abandoned keys
setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [key, entry] of store) {
        entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
        if (entry.timestamps.length === 0) store.delete(key);
    }
}, SWEEP_INTERVAL_MS).unref();

/**
 * Check rate limit for an identifier (typically agentId or IP).
 * Returns null if allowed, or a 429 Response if rate-limited.
 */
export function rateLimit(identifier: string): Response | null {
    const now = Date.now();
    let entry = store.get(identifier);
    if (!entry) {
        entry = { timestamps: [] };
        store.set(identifier, entry);
    }

    // Slide window — drop timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);

    if (entry.timestamps.length >= MAX_REQUESTS) {
        const retryAfterSec = Math.ceil(
            (entry.timestamps[0] + WINDOW_MS - now) / 1000
        );
        return Response.json(
            { error: "Rate limit exceeded" },
            {
                status: 429,
                headers: { "Retry-After": String(retryAfterSec) },
            }
        );
    }

    entry.timestamps.push(now);
    return null;
}
