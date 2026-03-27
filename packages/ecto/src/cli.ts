#!/usr/bin/env node

/**
 * Ecto CLI — Command-line interface for managing ecto agents.
 *
 * Usage:
 *   ecto spawn <name> [--model <model>] [--provider <provider>]
 *   ecto list
 *   ecto talk <name> <message>
 *   ecto kill <name>
 *   ecto wake <name>
 *   ecto save <name> [--push]
 *   ecto rm <name>
 *   ecto nudge <name> <event> [reason]
 *   ecto status <name>
 *   ecto serve
 *   ecto upgrade
 */

import {
    spawnEcto, killEcto, wakeEcto, removeEcto,
    sendMessage, saveEcto, listEctos, getEcto,
    nudgeEcto, reconcileEctoStates, upgradeEctos,
} from './orchestrator';
import { getVaultStatus } from './vault';
import { createEctoApi } from './api';
import { log } from './logger';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
    switch (command) {
        case 'spawn': {
            const name = args[1];
            if (!name) { console.error('Usage: ecto spawn <name>'); process.exit(1); }

            const model = getFlag('--model') || undefined;
            const provider = getFlag('--provider') as 'anthropic' | 'openai' | undefined;

            console.log(`Spawning ecto "${name}"...`);
            const ecto = await spawnEcto(name, { model, provider });
            console.log(`Ecto "${name}" is ${ecto.status} on port ${ecto.portBase}`);
            break;
        }

        case 'list': {
            const ectos = listEctos();
            const entries = Object.entries(ectos);

            if (entries.length === 0) {
                console.log('No ectos running.');
                break;
            }

            console.log(`\n  ${'Name'.padEnd(20)} ${'Status'.padEnd(10)} ${'Model'.padEnd(25)} ${'Port'.padEnd(8)} Sessions`);
            console.log(`  ${'─'.repeat(20)} ${'─'.repeat(10)} ${'─'.repeat(25)} ${'─'.repeat(8)} ${'─'.repeat(10)}`);
            for (const [name, ecto] of entries) {
                const status = ecto.status === 'running' ? '\x1b[32m●\x1b[0m running' :
                    ecto.status === 'stopped' ? '\x1b[31m●\x1b[0m stopped' :
                        `\x1b[33m●\x1b[0m ${ecto.status}`;
                console.log(`  ${name.padEnd(20)} ${status.padEnd(19)} ${ecto.config.model.padEnd(25)} ${String(ecto.portBase).padEnd(8)} ${ecto.sessions.length}`);
            }
            console.log();
            break;
        }

        case 'talk': {
            const name = args[1];
            const message = args.slice(2).join(' ');
            if (!name || !message) { console.error('Usage: ecto talk <name> <message>'); process.exit(1); }

            for await (const msg of sendMessage(name, message)) {
                if (msg.type === 'assistant') {
                    process.stdout.write(msg.content);
                } else if (msg.type === 'tool_use') {
                    console.log(`\n\x1b[2m[tool] ${msg.toolName}\x1b[0m`);
                } else if (msg.type === 'error') {
                    console.error(`\n\x1b[31mError: ${msg.content}\x1b[0m`);
                }
            }
            console.log();
            break;
        }

        case 'kill': {
            const name = args[1];
            if (!name) { console.error('Usage: ecto kill <name>'); process.exit(1); }
            await killEcto(name);
            console.log(`Ecto "${name}" killed.`);
            break;
        }

        case 'wake': {
            const name = args[1];
            if (!name) { console.error('Usage: ecto wake <name>'); process.exit(1); }
            await wakeEcto(name);
            console.log(`Ecto "${name}" woken.`);
            break;
        }

        case 'save': {
            const name = args[1];
            if (!name) { console.error('Usage: ecto save <name> [--push]'); process.exit(1); }
            const push = args.includes('--push');
            const committed = await saveEcto(name, push);
            console.log(committed ? `Vault committed${push ? ' and pushed' : ''}.` : 'No changes to commit.');
            break;
        }

        case 'rm': {
            const name = args[1];
            if (!name) { console.error('Usage: ecto rm <name>'); process.exit(1); }
            await removeEcto(name);
            console.log(`Ecto "${name}" removed.`);
            break;
        }

        case 'nudge': {
            const name = args[1];
            const event = args[2];
            const reason = args.slice(3).join(' ') || undefined;
            if (!name || !event) { console.error('Usage: ecto nudge <name> <event> [reason]'); process.exit(1); }
            await nudgeEcto(name, event, reason);
            console.log(`Nudge "${event}" sent to "${name}".`);
            break;
        }

        case 'status': {
            const name = args[1];
            if (!name) { console.error('Usage: ecto status <name>'); process.exit(1); }

            const ecto = getEcto(name);
            if (!ecto) { console.error(`Ecto "${name}" not found.`); process.exit(1); }

            const vault = getVaultStatus(name);
            console.log(`\n  Ecto: ${name}`);
            console.log(`  Status: ${ecto.status}`);
            console.log(`  Model: ${ecto.config.model}`);
            console.log(`  Provider: ${ecto.config.provider}`);
            console.log(`  Port: ${ecto.portBase}`);
            console.log(`  Sessions: ${ecto.sessions.join(', ')}`);
            console.log(`  Active: ${ecto.activeSession}`);
            if (vault) {
                console.log(`  Vault: ${vault.dirty ? 'dirty' : 'clean'} (${vault.commitCount} commits)`);
                console.log(`  Branch: ${vault.branch}`);
                console.log(`  Last commit: ${vault.lastCommit}`);
            }
            console.log();
            break;
        }

        case 'serve': {
            const { serve } = await import('@hono/node-server' as any);
            const app = createEctoApi();
            const port = parseInt(getFlag('--port') || '8008', 10);
            serve({ fetch: app.fetch, port }, () => {
                console.log(`Ecto API server running on http://localhost:${port}`);
            });
            break;
        }

        case 'reconcile': {
            const restarted = await reconcileEctoStates();
            console.log(restarted.length ? `Restarted: ${restarted.join(', ')}` : 'All ectos healthy.');
            break;
        }

        case 'upgrade': {
            const dockerDir = args[1] || './docker';
            const upgraded = await upgradeEctos(dockerDir);
            console.log(upgraded.length ? `Upgraded: ${upgraded.join(', ')}` : 'All ectos up to date.');
            break;
        }

        default: {
            console.log(`
  ecto — Persistent AI agent runtime for the Swarm network

  Usage:
    ecto spawn <name> [--model <m>] [--provider <p>]   Spawn a new ecto
    ecto list                                           List all ectos
    ecto talk <name> <message>                          Send a message
    ecto kill <name>                                    Stop an ecto
    ecto wake <name>                                    Restart an ecto
    ecto save <name> [--push]                           Commit vault
    ecto rm <name>                                      Remove permanently
    ecto nudge <name> <event> [reason]                  Send nudge event
    ecto status <name>                                  Show ecto details
    ecto serve [--port <n>]                             Start API server
    ecto reconcile                                      Restart dead ectos
    ecto upgrade [docker-dir]                           Rolling upgrade
`);
            break;
        }
    }
}

function getFlag(flag: string): string | null {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

main().catch(err => {
    console.error(err.message || err);
    process.exit(1);
});
