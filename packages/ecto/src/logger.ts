/**
 * Structured logging via pino — replaces console.log across the ecto package.
 * Usage: import { log } from './logger'; log.info({ ecto: 'atlas' }, 'spawned');
 */

import pino from 'pino';

export const log = pino({
    name: 'ecto',
    level: process.env.ECTO_LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined,
});

export function childLogger(component: string) {
    return log.child({ component });
}
