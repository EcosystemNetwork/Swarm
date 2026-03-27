/**
 * NudgeRegistry — Event bus for proactive agent behavior.
 *
 * Agents can register handlers that fire
 * on events like idle timeouts, pre-compaction, session start, timers, and
 * message completion. Handlers can be gated by minimum message count or time interval.
 *
 * Critical events (pre-compact, pre-new-session) always block and cannot be skipped.
 */

import { NudgeEvent, NudgeHandler, NudgeContext } from './types';
import { childLogger } from './logger';

const log = childLogger('nudge');

export class NudgeRegistry {
    private handlers: Map<NudgeEvent, NudgeHandler[]> = new Map();
    private lastFired: Map<string, { time: number; messageCount: number }> = new Map();
    private messageCount = 0;
    private sessionStart = Date.now();
    private lastActivity = Date.now();
    private idleTimer?: ReturnType<typeof setTimeout>;
    private idleThreshold = 5 * 60 * 1000; // 5 minutes default

    constructor(private ectoName: string) {}

    /**
     * Register a handler for a nudge event.
     */
    register(handler: NudgeHandler): void {
        const list = this.handlers.get(handler.event) || [];
        // Replace existing handler with same name
        const idx = list.findIndex(h => h.name === handler.name);
        if (idx >= 0) {
            list[idx] = handler;
        } else {
            list.push(handler);
        }
        this.handlers.set(handler.event, list);
        log.debug({ ecto: this.ectoName, event: handler.event, name: handler.name }, 'handler registered');
    }

    /**
     * Unregister a handler by name.
     */
    unregister(name: string): boolean {
        let removed = false;
        for (const [event, list] of this.handlers) {
            const filtered = list.filter(h => h.name !== name);
            if (filtered.length !== list.length) {
                this.handlers.set(event, filtered);
                removed = true;
            }
        }
        return removed;
    }

    /**
     * Fire all handlers for an event. Returns collected responses.
     */
    async fire(event: NudgeEvent, reason?: string): Promise<string[]> {
        const handlers = this.handlers.get(event) || [];
        if (handlers.length === 0) return [];

        const context: NudgeContext = {
            event,
            ectoName: this.ectoName,
            reason,
            messageCount: this.messageCount,
            sessionAge: Date.now() - this.sessionStart,
            lastActivity: this.lastActivity,
        };

        const results: string[] = [];
        const isCritical = event === 'pre-compact' || event === 'pre-new-session';

        for (const handler of handlers) {
            if (!isCritical && !this.shouldFire(handler)) {
                log.debug({ ecto: this.ectoName, handler: handler.name }, 'skipped (gate not met)');
                continue;
            }

            try {
                log.info({ ecto: this.ectoName, event, handler: handler.name }, 'firing handler');
                const result = await handler.handler(context);
                if (result) results.push(result);

                this.lastFired.set(handler.name, {
                    time: Date.now(),
                    messageCount: this.messageCount,
                });
            } catch (err) {
                log.error({ ecto: this.ectoName, handler: handler.name, err }, 'handler failed');
            }
        }

        return results;
    }

    /**
     * Record that a message was processed (for gating).
     */
    recordMessage(): void {
        this.messageCount++;
        this.lastActivity = Date.now();
        this.resetIdleTimer();
    }

    /**
     * Reset session counters (e.g. on new session).
     */
    resetSession(): void {
        this.messageCount = 0;
        this.sessionStart = Date.now();
        this.lastActivity = Date.now();
        this.lastFired.clear();
    }

    /**
     * Configure and start the idle detection timer.
     */
    startIdleDetection(thresholdMs?: number): void {
        if (thresholdMs) this.idleThreshold = thresholdMs;
        this.resetIdleTimer();
    }

    /**
     * Stop idle detection.
     */
    stopIdleDetection(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = undefined;
        }
    }

    /**
     * Get registered handler names by event.
     */
    getHandlers(event?: NudgeEvent): string[] {
        if (event) {
            return (this.handlers.get(event) || []).map(h => h.name);
        }
        const all: string[] = [];
        for (const list of this.handlers.values()) {
            all.push(...list.map(h => h.name));
        }
        return [...new Set(all)];
    }

    /**
     * Current stats.
     */
    stats() {
        return {
            messageCount: this.messageCount,
            sessionAge: Date.now() - this.sessionStart,
            lastActivity: this.lastActivity,
            handlerCount: this.getHandlers().length,
        };
    }

    destroy(): void {
        this.stopIdleDetection();
        this.handlers.clear();
        this.lastFired.clear();
    }

    // ── Private ──

    private shouldFire(handler: NudgeHandler): boolean {
        if (handler.critical) return true;

        const last = this.lastFired.get(handler.name);
        if (!last) return true;

        if (handler.minMessages && (this.messageCount - last.messageCount) < handler.minMessages) {
            return false;
        }
        if (handler.minInterval && (Date.now() - last.time) < handler.minInterval) {
            return false;
        }
        return true;
    }

    private resetIdleTimer(): void {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(async () => {
            log.info({ ecto: this.ectoName }, 'idle threshold reached');
            await this.fire('idle', 'idle timeout');
        }, this.idleThreshold);
    }
}
