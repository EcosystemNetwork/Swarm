/**
 * Ecto API Server — Hono-based REST API for ecto management.
 *
 * Can run standalone (port 8008) or be mounted into SwarmApp's Next.js routes.
 * Provides full CRUD for ectos, message streaming (SSE), vault file operations,
 * schedule management, and config.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
    spawnEcto, killEcto, wakeEcto, removeEcto,
    sendMessage, steerEcto, nudgeEcto, saveEcto,
    listEctos, getEcto, getConfig, updateConfig,
    reconcileEctoStates,
} from './orchestrator';
import {
    getVaultStatus, readVaultFile, writeVaultFile,
    deleteVaultFile, listVaultFiles,
} from './vault';
import { ScheduleManager } from './schedule';
import { childLogger } from './logger';

const log = childLogger('api');

export function createEctoApi(): Hono {
    const app = new Hono();

    // CORS
    app.use('*', cors());

    // ── Schedule manager (singleton) ──

    const scheduler = new ScheduleManager(async (entry) => {
        log.info({ ecto: entry.ectoName, prompt: entry.prompt.slice(0, 80) }, 'schedule firing');
        // Collect messages (we don't stream scheduled prompts)
        for await (const _msg of sendMessage(entry.ectoName, entry.prompt)) {
            // consume the stream
        }
    });
    scheduler.start();

    // ── Ecto CRUD ──

    app.get('/api/ectos', (c) => {
        return c.json(listEctos());
    });

    app.post('/api/ectos', async (c) => {
        const body = await c.req.json();
        const { name, provider, model, systemPrompt, orgId, agentId } = body;
        if (!name) return c.json({ error: 'name required' }, 400);

        try {
            const ecto = await spawnEcto(name, { provider, model, systemPrompt, orgId, agentId });
            return c.json(ecto, 201);
        } catch (err: any) {
            const status = err.message?.includes('already exists') ? 409 : 500;
            return c.json({ error: err.message }, status);
        }
    });

    app.get('/api/ectos/:name', (c) => {
        const ecto = getEcto(c.req.param('name'));
        if (!ecto) return c.json({ error: 'not found' }, 404);
        return c.json(ecto);
    });

    app.delete('/api/ectos/:name', async (c) => {
        try {
            await removeEcto(c.req.param('name'));
            return c.json({ removed: true });
        } catch (err: any) {
            return c.json({ error: err.message }, 404);
        }
    });

    app.post('/api/ectos/:name/kill', async (c) => {
        try {
            await killEcto(c.req.param('name'));
            return c.json({ killed: true });
        } catch (err: any) {
            return c.json({ error: err.message }, 404);
        }
    });

    app.post('/api/ectos/:name/wake', async (c) => {
        try {
            await wakeEcto(c.req.param('name'));
            return c.json({ woken: true });
        } catch (err: any) {
            return c.json({ error: err.message }, 404);
        }
    });

    app.post('/api/ectos/:name/save', async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const committed = await saveEcto(c.req.param('name'), body.push);
        return c.json({ committed });
    });

    // ── Message Streaming (SSE) ──

    app.post('/api/ectos/:name/message', async (c) => {
        const { prompt } = await c.req.json();
        if (!prompt) return c.json({ error: 'prompt required' }, 400);

        const name = c.req.param('name');

        // Stream as Server-Sent Events
        return new Response(
            new ReadableStream({
                async start(controller) {
                    const encoder = new TextEncoder();
                    try {
                        for await (const msg of sendMessage(name, prompt)) {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
                        }
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    } catch (err: any) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`));
                    }
                    controller.close();
                },
            }),
            {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                },
            }
        );
    });

    app.post('/api/ectos/:name/steer', async (c) => {
        const { prompt } = await c.req.json();
        await steerEcto(c.req.param('name'), prompt);
        return c.json({ queued: true });
    });

    app.post('/api/ectos/:name/nudge', async (c) => {
        const { event, reason } = await c.req.json();
        const results = await nudgeEcto(c.req.param('name'), event, reason);
        return c.json({ results });
    });

    // ── Ecto proxy endpoints ──

    app.get('/api/ectos/:name/stats', async (c) => {
        const ecto = getEcto(c.req.param('name'));
        if (!ecto || ecto.status !== 'running') return c.json({ error: 'not running' }, 400);
        const resp = await fetch(`http://localhost:${ecto.portBase}/stats`);
        return c.json(await resp.json());
    });

    app.get('/api/ectos/:name/history', async (c) => {
        const ecto = getEcto(c.req.param('name'));
        if (!ecto || ecto.status !== 'running') return c.json({ error: 'not running' }, 400);
        const resp = await fetch(`http://localhost:${ecto.portBase}/history`);
        return c.json(await resp.json());
    });

    app.get('/api/ectos/:name/sessions', async (c) => {
        const ecto = getEcto(c.req.param('name'));
        if (!ecto || ecto.status !== 'running') return c.json({ error: 'not running' }, 400);
        const resp = await fetch(`http://localhost:${ecto.portBase}/sessions`);
        return c.json(await resp.json());
    });

    app.post('/api/ectos/:name/sessions/new', async (c) => {
        const ecto = getEcto(c.req.param('name'));
        if (!ecto || ecto.status !== 'running') return c.json({ error: 'not running' }, 400);
        const body = await c.req.json();
        const resp = await fetch(`http://localhost:${ecto.portBase}/sessions/new`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return c.json(await resp.json());
    });

    app.post('/api/ectos/:name/compact', async (c) => {
        const ecto = getEcto(c.req.param('name'));
        if (!ecto || ecto.status !== 'running') return c.json({ error: 'not running' }, 400);
        const resp = await fetch(`http://localhost:${ecto.portBase}/compact`, { method: 'POST' });
        return c.json(await resp.json());
    });

    app.post('/api/ectos/:name/abort', async (c) => {
        const ecto = getEcto(c.req.param('name'));
        if (!ecto || ecto.status !== 'running') return c.json({ error: 'not running' }, 400);
        const resp = await fetch(`http://localhost:${ecto.portBase}/abort`, { method: 'POST' });
        return c.json(await resp.json());
    });

    // ── Vault File Operations ──

    app.get('/api/ectos/:name/vault', (c) => {
        return c.json({ files: listVaultFiles(c.req.param('name')) });
    });

    app.get('/api/ectos/:name/vault/*', (c) => {
        const name = c.req.param('name');
        const filePath = c.req.path.split(`/api/ectos/${name}/vault/`)[1];
        const file = readVaultFile(name, filePath);
        if (!file) return c.json({ error: 'not found' }, 404);
        return c.json(file);
    });

    app.post('/api/ectos/:name/vault/*', async (c) => {
        const name = c.req.param('name');
        const filePath = c.req.path.split(`/api/ectos/${name}/vault/`)[1];
        const { content } = await c.req.json();
        writeVaultFile(name, filePath, content);
        return c.json({ written: filePath });
    });

    app.delete('/api/ectos/:name/vault/*', (c) => {
        const name = c.req.param('name');
        const filePath = c.req.path.split(`/api/ectos/${name}/vault/`)[1];
        const deleted = deleteVaultFile(name, filePath);
        return c.json({ deleted });
    });

    // ── Vault Status ──

    app.get('/api/ectos/:name/vault-status', (c) => {
        const status = getVaultStatus(c.req.param('name'));
        if (!status) return c.json({ error: 'not found' }, 404);
        return c.json(status);
    });

    // ── Schedules ──

    app.get('/api/ectos/:name/schedules', (c) => {
        return c.json(scheduler.list(c.req.param('name')));
    });

    app.post('/api/ectos/:name/schedules', async (c) => {
        const name = c.req.param('name');
        const body = await c.req.json();
        const id = `${name}-${Date.now()}`;
        scheduler.set({
            id,
            ectoName: name,
            cron: body.cron,
            prompt: body.prompt,
            timezone: body.timezone || 'UTC',
            enabled: body.enabled !== false,
            createdAt: Date.now(),
        });
        return c.json({ id }, 201);
    });

    app.delete('/api/schedules/:id', (c) => {
        const removed = scheduler.remove(c.req.param('id'));
        return c.json({ removed });
    });

    // ── Config ──

    app.get('/api/config', (c) => {
        const config = getConfig();
        // Mask sensitive fields
        return c.json({
            ...config,
            githubToken: config.githubToken ? '***' : undefined,
        });
    });

    app.patch('/api/config', async (c) => {
        const updates = await c.req.json();
        const config = updateConfig(updates);
        return c.json(config);
    });

    // ── System ──

    app.post('/api/reconcile', async (c) => {
        const restarted = await reconcileEctoStates();
        return c.json({ restarted });
    });

    app.get('/api/health', (c) => {
        return c.json({ status: 'ok', timestamp: Date.now() });
    });

    return app;
}

// ── Standalone server ──

if (require.main === module) {
    const { serve } = require('@hono/node-server');
    const app = createEctoApi();
    const port = parseInt(process.env.ECTO_API_PORT || '8008', 10);

    serve({ fetch: app.fetch, port }, () => {
        log.info({ port }, 'Ecto API server started');
    });
}
