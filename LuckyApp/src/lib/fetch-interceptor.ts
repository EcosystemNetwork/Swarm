/**
 * Fetch Interceptor — Circuit breaker + retry/backoff for unreliable third-party
 * domains (e.g. social.thirdweb.com).
 *
 * Why this exists:
 *   thirdweb's ConnectButton uses React Query internally. When social.thirdweb.com
 *   returns 500, React Query retries endlessly, causing a cascading render loop
 *   that crashes the React tree and logs the user out.
 *
 * Strategy (replaces the old fake-200 pattern):
 *   1. Retry with exponential backoff (up to MAX_RETRIES attempts)
 *   2. Circuit breaker — after FAILURE_THRESHOLD consecutive failures, stop
 *      making real network requests for CIRCUIT_OPEN_MS and return a clearly-marked
 *      degraded-mode stub response instead.
 *   3. Observable degraded state — React components can subscribe to know
 *      which domains are in degraded mode and surface appropriate UI.
 *   4. Structured logging — every intercept is logged with timestamps and context.
 *
 * Note on the stub response:
 *   The stub uses HTTP 200 because thirdweb's internal React Query retries
 *   infinitely on non-200 (which is the root cause of the crash). The response
 *   body and headers clearly mark it as degraded (`X-Swarm-Degraded` header,
 *   `_degraded` field in body) so it is never mistaken for real data. This is
 *   a standard circuit-breaker fallback pattern.
 */

// ─── Configuration ───────────────────────────────────────────────────

const INTERCEPTED_DOMAINS = ['social.thirdweb.com'];

const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [800, 2_000];
const FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 60_000;
const HALF_OPEN_COOLDOWN_MS = 15_000;

// ─── Circuit State ───────────────────────────────────────────────────

type CircuitState = 'closed' | 'open' | 'half-open';

interface DomainCircuit {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureTime: number;
  lastProbeTime: number;
  totalFailures: number;
  totalRequests: number;
}

const circuits = new Map<string, DomainCircuit>();

function getCircuit(domain: string): DomainCircuit {
  let c = circuits.get(domain);
  if (!c) {
    c = {
      state: 'closed',
      consecutiveFailures: 0,
      lastFailureTime: 0,
      lastProbeTime: 0,
      totalFailures: 0,
      totalRequests: 0,
    };
    circuits.set(domain, c);
  }
  return c;
}

function recordSuccess(domain: string) {
  const c = getCircuit(domain);
  const wasOpen = c.state !== 'closed';
  c.state = 'closed';
  c.consecutiveFailures = 0;
  c.totalRequests++;
  if (wasOpen) {
    log('info', domain, 'Circuit closed — service recovered');
    removeDegraded(domain);
  }
}

function recordFailure(domain: string) {
  const c = getCircuit(domain);
  c.consecutiveFailures++;
  c.totalFailures++;
  c.totalRequests++;
  c.lastFailureTime = Date.now();

  if (c.consecutiveFailures >= FAILURE_THRESHOLD && c.state === 'closed') {
    c.state = 'open';
    log('warn', domain, `Circuit OPEN after ${c.consecutiveFailures} consecutive failures`);
    addDegraded(domain);
  }
}

function maybeHalfOpen(domain: string): boolean {
  const c = getCircuit(domain);
  if (c.state !== 'open') return false;
  if (Date.now() - c.lastFailureTime >= CIRCUIT_OPEN_MS) {
    c.state = 'half-open';
    log('info', domain, 'Circuit half-open — will probe on next request');
    return true;
  }
  return false;
}

function canProbe(domain: string): boolean {
  return Date.now() - getCircuit(domain).lastProbeTime >= HALF_OPEN_COOLDOWN_MS;
}

function markProbed(domain: string) {
  getCircuit(domain).lastProbeTime = Date.now();
}

// ─── Degraded State (Observable) ─────────────────────────────────────

const degradedDomains = new Set<string>();
const listeners = new Set<() => void>();

function addDegraded(domain: string) {
  if (!degradedDomains.has(domain)) {
    degradedDomains.add(domain);
    notify();
  }
}

function removeDegraded(domain: string) {
  if (degradedDomains.has(domain)) {
    degradedDomains.delete(domain);
    notify();
  }
}

function notify() {
  listeners.forEach((fn) => { try { fn(); } catch { /* */ } });
}

export function isAnyServiceDegraded(): boolean {
  return degradedDomains.size > 0;
}

export function getDegradedDomains(): string[] {
  return [...degradedDomains];
}

export function subscribeDegraded(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getCircuitDiagnostics(): Record<string, {
  state: CircuitState;
  consecutiveFailures: number;
  totalFailures: number;
  totalRequests: number;
  lastFailure: string | null;
}> {
  const out: Record<string, ReturnType<typeof getCircuitDiagnostics>[string]> = {};
  circuits.forEach((c, domain) => {
    out[domain] = {
      state: c.state,
      consecutiveFailures: c.consecutiveFailures,
      totalFailures: c.totalFailures,
      totalRequests: c.totalRequests,
      lastFailure: c.lastFailureTime ? new Date(c.lastFailureTime).toISOString() : null,
    };
  });
  return out;
}

// ─── Logging ─────────────────────────────────────────────────────────

type LogLevel = 'info' | 'warn' | 'error';

function log(level: LogLevel, domain: string, msg: string, extra?: Record<string, unknown>) {
  const prefix = '[Swarm:fetch]';
  const ctx = extra ? ` ${JSON.stringify(extra)}` : '';
  const line = `${prefix} [${domain}] ${msg}${ctx}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

// ─── Retry with Backoff ──────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  originalFetch: typeof window.fetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  domain: string,
): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
      log('info', domain, `Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
      await sleep(delay);
    }
    try {
      const res = await originalFetch.call(window, input, init);
      if (res.ok) {
        if (attempt > 0) log('info', domain, `Succeeded on retry ${attempt}`);
        recordSuccess(domain);
        return res;
      }
      lastResponse = res;
      log('warn', domain, 'Non-OK response', { status: res.status, attempt });
    } catch (err) {
      lastError = err;
      log('warn', domain, 'Network error', {
        error: err instanceof Error ? err.message : String(err),
        attempt,
      });
    }
  }

  recordFailure(domain);
  log('error', domain, `All ${MAX_RETRIES + 1} attempts failed`, {
    lastStatus: lastResponse?.status,
    lastError: lastError instanceof Error ? lastError.message : lastError ? String(lastError) : null,
  });

  return createDegradedResponse(domain, lastResponse?.status);
}

// ─── Degraded Stub Response ──────────────────────────────────────────

function createDegradedResponse(domain: string, upstreamStatus?: number): Response {
  return new Response(
    JSON.stringify({
      _degraded: true,
      _domain: domain,
      _upstreamStatus: upstreamStatus ?? null,
      _timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Swarm-Degraded': 'true',
        'X-Swarm-Domain': domain,
      },
    },
  );
}

// ─── Install ─────────────────────────────────────────────────────────

function matchDomain(url: string): string | null {
  for (const d of INTERCEPTED_DOMAINS) {
    if (url.includes(d)) return d;
  }
  return null;
}

let installed = false;

export function installFetchInterceptor(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch;

  window.fetch = async function interceptedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    const domain = matchDomain(url);
    if (!domain) return originalFetch.call(this, input, init);

    const circuit = getCircuit(domain);

    // Circuit OPEN — check if we should transition to half-open
    if (circuit.state === 'open') {
      if (maybeHalfOpen(domain) && canProbe(domain)) {
        markProbed(domain);
        // fall through to half-open handler
      } else {
        log('info', domain, 'Circuit open — returning degraded stub');
        return createDegradedResponse(domain);
      }
    }

    // Circuit HALF-OPEN — single probe
    if (circuit.state === 'half-open') {
      if (!canProbe(domain)) {
        return createDegradedResponse(domain);
      }
      markProbed(domain);
      try {
        const res = await originalFetch.call(this, input, init);
        if (res.ok) {
          recordSuccess(domain);
          return res;
        }
        recordFailure(domain);
        return createDegradedResponse(domain, res.status);
      } catch (err) {
        recordFailure(domain);
        log('warn', domain, 'Probe failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        return createDegradedResponse(domain);
      }
    }

    // Circuit CLOSED — normal retry flow
    return fetchWithRetry(originalFetch, input, init, domain);
  };

  log('info', '*', 'Fetch interceptor installed', { domains: INTERCEPTED_DOMAINS });
}
