/**
 * Rate Limiter - Simple in-memory rate limiting for API endpoints
 * Uses sliding window algorithm
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const limits = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  max: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

/**
 * Check if a request is allowed under rate limit
 * @param key - Unique identifier (e.g., IP address, user ID)
 * @param config - Rate limit configuration
 * @returns Result indicating if request is allowed
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const entry = limits.get(key);

  // Clean up expired entries periodically
  if (Math.random() < 0.01) {
    cleanupExpiredEntries();
  }

  // No entry or expired - allow and create new entry
  if (!entry || now >= entry.resetTime) {
    limits.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return {
      allowed: true,
      remaining: config.max - 1,
      resetTime: now + config.windowMs,
    };
  }

  // Entry exists and not expired
  if (entry.count >= config.max) {
    // Rate limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
    };
  }

  // Increment count
  entry.count++;
  limits.set(key, entry);

  return {
    allowed: true,
    remaining: config.max - entry.count,
    resetTime: entry.resetTime,
  };
}

/**
 * Clean up expired rate limit entries
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  const keysToDelete: string[] = [];

  limits.forEach((entry, key) => {
    if (now >= entry.resetTime) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => limits.delete(key));
}

/**
 * Reset rate limit for a specific key
 */
export function resetRateLimit(key: string): void {
  limits.delete(key);
}

/**
 * Clear all rate limit entries
 */
export function clearAllRateLimits(): void {
  limits.clear();
}

/**
 * Get rate limit statistics (for debugging)
 */
export function getRateLimitStats() {
  const now = Date.now();
  let activeEntries = 0;
  let expiredEntries = 0;

  limits.forEach((entry) => {
    if (now < entry.resetTime) {
      activeEntries++;
    } else {
      expiredEntries++;
    }
  });

  return {
    totalEntries: limits.size,
    activeEntries,
    expiredEntries,
  };
}

/**
 * Get client IP from Next.js request
 */
export function getClientIp(req: Request): string {
  // Try various headers in order of preference
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to a default (will rate limit all requests together in dev)
  return 'unknown';
}
