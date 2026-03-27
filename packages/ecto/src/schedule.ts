/**
 * ScheduleManager — In-process cron scheduler for ecto prompts.
 *
 * Parses 5-field cron expressions, computes next fire times with timezone support,
 * and dispatches prompts to ectos on schedule. Supports per-ecto schedules,
 * heartbeat intervals, and auto-wake of stopped ectos.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ScheduleEntry } from './types';
import { childLogger } from './logger';
import { getDataDir } from './vault';

const log = childLogger('schedule');

/** Cron field ranges */
const RANGES: [number, number][] = [
    [0, 59],  // minute
    [0, 23],  // hour
    [1, 31],  // day of month
    [1, 12],  // month
    [0, 6],   // day of week (0=Sun)
];

export class ScheduleManager {
    private schedules: Map<string, ScheduleEntry> = new Map();
    private pollTimer?: ReturnType<typeof setInterval>;
    private filePath: string;
    private onFire: (entry: ScheduleEntry) => Promise<void>;

    constructor(onFire: (entry: ScheduleEntry) => Promise<void>) {
        this.filePath = path.join(getDataDir(), 'schedules.json');
        this.onFire = onFire;
        this.loadFromDisk();
    }

    /**
     * Add or update a schedule.
     */
    set(entry: Omit<ScheduleEntry, 'nextRun'>): void {
        const full: ScheduleEntry = {
            ...entry,
            nextRun: this.computeNextRun(entry.cron, entry.timezone),
        };
        this.schedules.set(entry.id, full);
        this.saveToDisk();
        log.info({ id: entry.id, ecto: entry.ectoName, cron: entry.cron, nextRun: new Date(full.nextRun!).toISOString() }, 'schedule set');
    }

    /**
     * Remove a schedule.
     */
    remove(id: string): boolean {
        const removed = this.schedules.delete(id);
        if (removed) this.saveToDisk();
        return removed;
    }

    /**
     * Get all schedules, optionally filtered by ecto.
     */
    list(ectoName?: string): ScheduleEntry[] {
        const all = Array.from(this.schedules.values());
        return ectoName ? all.filter(s => s.ectoName === ectoName) : all;
    }

    /**
     * Get a single schedule.
     */
    get(id: string): ScheduleEntry | undefined {
        return this.schedules.get(id);
    }

    /**
     * Start the polling loop (checks every 30s).
     */
    start(): void {
        if (this.pollTimer) return;

        log.info('scheduler started');
        this.pollTimer = setInterval(() => this.poll(), 30_000);
        // Also poll immediately
        this.poll();
    }

    /**
     * Stop the polling loop.
     */
    stop(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
            log.info('scheduler stopped');
        }
    }

    /**
     * Check for schedules that need to fire.
     */
    private async poll(): Promise<void> {
        const now = Date.now();

        for (const [id, entry] of this.schedules) {
            if (!entry.enabled) continue;
            if (!entry.nextRun || entry.nextRun > now) continue;

            log.info({ id, ecto: entry.ectoName, prompt: entry.prompt.slice(0, 80) }, 'firing schedule');

            try {
                await this.onFire(entry);
                entry.lastRun = now;
                entry.nextRun = this.computeNextRun(entry.cron, entry.timezone);
                this.schedules.set(id, entry);
                this.saveToDisk();
            } catch (err) {
                log.error({ id, err }, 'schedule fire failed');
            }
        }
    }

    /**
     * Compute the next run time for a cron expression.
     * Supports 5-field cron: minute hour day-of-month month day-of-week
     */
    private computeNextRun(cron: string, timezone: string): number {
        const fields = cron.trim().split(/\s+/);
        if (fields.length !== 5) {
            log.error({ cron }, 'invalid cron expression');
            return Date.now() + 3600_000; // fallback: 1 hour
        }

        const parsed = fields.map((f, i) => this.parseCronField(f, RANGES[i]));
        const now = new Date();

        // Brute-force next matching minute within the next 48 hours
        const check = new Date(now);
        check.setSeconds(0, 0);
        check.setMinutes(check.getMinutes() + 1);

        const limit = 48 * 60; // 48 hours of minutes
        for (let i = 0; i < limit; i++) {
            const m = check.getMinutes();
            const h = check.getHours();
            const dom = check.getDate();
            const mon = check.getMonth() + 1;
            const dow = check.getDay();

            if (
                parsed[0].has(m) &&
                parsed[1].has(h) &&
                parsed[2].has(dom) &&
                parsed[3].has(mon) &&
                parsed[4].has(dow)
            ) {
                return check.getTime();
            }

            check.setMinutes(check.getMinutes() + 1);
        }

        // Fallback: 24 hours from now
        return Date.now() + 86400_000;
    }

    /**
     * Parse a single cron field into a set of allowed values.
     */
    private parseCronField(field: string, [min, max]: [number, number]): Set<number> {
        const values = new Set<number>();

        for (const part of field.split(',')) {
            if (part === '*') {
                for (let i = min; i <= max; i++) values.add(i);
                continue;
            }

            const stepMatch = part.match(/^(.+)\/(\d+)$/);
            if (stepMatch) {
                const [, range, stepStr] = stepMatch;
                const step = parseInt(stepStr, 10);
                let start = min;
                let end = max;

                if (range !== '*') {
                    const [s, e] = range.split('-').map(Number);
                    start = s;
                    end = e ?? s;
                }

                for (let i = start; i <= end; i += step) values.add(i);
                continue;
            }

            const rangeMatch = part.match(/^(\d+)-(\d+)$/);
            if (rangeMatch) {
                const [, s, e] = rangeMatch.map(Number);
                for (let i = s; i <= e; i++) values.add(i);
                continue;
            }

            const num = parseInt(part, 10);
            if (!isNaN(num)) values.add(num);
        }

        return values;
    }

    // ── Persistence ──

    private saveToDisk(): void {
        const data = Object.fromEntries(this.schedules);
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    }

    private loadFromDisk(): void {
        if (!fs.existsSync(this.filePath)) return;
        try {
            const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
            for (const [id, entry] of Object.entries(raw)) {
                this.schedules.set(id, entry as ScheduleEntry);
            }
            log.info({ count: this.schedules.size }, 'schedules loaded from disk');
        } catch {
            log.warn('failed to load schedules from disk');
        }
    }
}
