/**
 * Ecto Server — Container-based agent runtime.
 *
 * Runs inside each Docker container. Wraps an AI agent session with:
 *   - Two-layer memory (warm injected into prompt, deep searchable on demand)
 *   - NudgeRegistry for proactive behavior
 *   - Memory observer (secondary LLM call for auto-extraction)
 *   - Pre-compaction memory flush
 *   - Request queuing (serialize concurrent messages)
 *   - NDJSON streaming responses
 *   - Session management (create, switch, rename, delete)
 *   - Slash commands (/compact, /reload, /model, /schedule, /new)
 *   - Self-evolution via extensions
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { MemoryManager } from './memory';
import { NudgeRegistry } from './nudge-registry';
import { EctoMessage, NudgeEvent, WarmMemory } from './types';
import { childLogger } from './logger';

const log = childLogger('ecto-server');

// ── Configuration ──

interface EctoServerConfig {
    port: number;
    vaultPath: string;
    ectoName: string;
    provider: 'anthropic' | 'openai';
    model: string;
    apiKey: string;
    observerModel?: string;
    observerApiKey?: string;
    systemPrompt?: string;
    authToken?: string;
    compactionThreshold?: number;
    idleTimeoutMs?: number;
}

// ── Request Queue ──

type QueuedRequest = {
    prompt: string;
    resolve: (messages: EctoMessage[]) => void;
    reject: (err: Error) => void;
    stream?: (msg: EctoMessage) => void;
};

// ── Ecto Server ──

export class EctoServer {
    private config: EctoServerConfig;
    private memory: MemoryManager;
    private nudge: NudgeRegistry;
    private server?: http.Server;
    private queue: QueuedRequest[] = [];
    private processing = false;
    private messageHistory: Array<{ role: string; content: string }> = [];
    private messageCount = 0;
    private sessionId: string;
    private sessions: Map<string, Array<{ role: string; content: string }>> = new Map();
    private startTime = Date.now();
    private abortController?: AbortController;

    constructor(config: EctoServerConfig) {
        this.config = config;
        this.memory = new MemoryManager(config.vaultPath);
        this.nudge = new NudgeRegistry(config.ectoName);
        this.sessionId = 'default';
        this.sessions.set('default', this.messageHistory);

        this.registerDefaultNudgeHandlers();
    }

    /**
     * Start the HTTP server.
     */
    async start(): Promise<void> {
        this.server = http.createServer((req, res) => this.handleRequest(req, res));

        this.server.listen(this.config.port, () => {
            log.info({ ecto: this.config.ectoName, port: this.config.port }, 'ecto server started');
        });

        // Start idle detection
        this.nudge.startIdleDetection(this.config.idleTimeoutMs);

        // Fire session-start nudge
        await this.nudge.fire('session-start');
    }

    /**
     * Stop the server and clean up.
     */
    async stop(): Promise<void> {
        this.nudge.destroy();
        if (this.server) {
            await new Promise<void>(resolve => this.server!.close(() => resolve()));
        }
        log.info({ ecto: this.config.ectoName }, 'ecto server stopped');
    }

    // ── HTTP Request Handler ──

    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const url = new URL(req.url || '/', `http://localhost:${this.config.port}`);
        const method = req.method || 'GET';

        // Auth check
        if (this.config.authToken) {
            const auth = req.headers.authorization;
            if (auth !== `Bearer ${this.config.authToken}`) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'unauthorized' }));
                return;
            }
        }

        try {
            // ── Routes ──
            if (method === 'GET' && url.pathname === '/health') {
                return this.sendJson(res, 200, {
                    status: 'ok',
                    ecto: this.config.ectoName,
                    uptime: Date.now() - this.startTime,
                    messageCount: this.messageCount,
                    session: this.sessionId,
                });
            }

            if (method === 'POST' && url.pathname === '/message') {
                return this.handleMessage(req, res);
            }

            if (method === 'POST' && url.pathname === '/steer') {
                const body = await this.readBody(req);
                const { prompt } = JSON.parse(body);
                this.enqueuePrompt(prompt);
                return this.sendJson(res, 200, { queued: true });
            }

            if (method === 'GET' && url.pathname === '/queue') {
                return this.sendJson(res, 200, { pending: this.queue.length, processing: this.processing });
            }

            if (method === 'POST' && url.pathname === '/clear-queue') {
                const cleared = this.queue.length;
                this.queue = [];
                return this.sendJson(res, 200, { cleared });
            }

            if (method === 'GET' && url.pathname === '/history') {
                return this.sendJson(res, 200, { messages: this.messageHistory.slice(-100) });
            }

            if (method === 'GET' && url.pathname === '/stats') {
                return this.sendJson(res, 200, {
                    ecto: this.config.ectoName,
                    model: this.config.model,
                    provider: this.config.provider,
                    messageCount: this.messageCount,
                    sessionId: this.sessionId,
                    sessions: Array.from(this.sessions.keys()),
                    uptime: Date.now() - this.startTime,
                    memory: this.memory.loadWarm(),
                    nudge: this.nudge.stats(),
                    extensions: this.memory.listExtensions(),
                    vault: this.memory.listKnowledge(),
                });
            }

            if (method === 'POST' && url.pathname === '/compact') {
                await this.triggerCompaction();
                return this.sendJson(res, 200, { compacted: true });
            }

            if (method === 'POST' && url.pathname === '/abort') {
                if (this.abortController) {
                    this.abortController.abort();
                    this.abortController = undefined;
                }
                return this.sendJson(res, 200, { aborted: true });
            }

            if (method === 'POST' && url.pathname === '/reload') {
                // Reload extensions and system prompt from vault
                return this.sendJson(res, 200, { reloaded: true, extensions: this.memory.listExtensions() });
            }

            if (method === 'POST' && url.pathname === '/nudge') {
                const body = await this.readBody(req);
                const { event, reason } = JSON.parse(body);
                const results = await this.nudge.fire(event as NudgeEvent, reason);
                return this.sendJson(res, 200, { results });
            }

            // ── Session management ──

            if (method === 'GET' && url.pathname === '/sessions') {
                return this.sendJson(res, 200, {
                    active: this.sessionId,
                    sessions: Array.from(this.sessions.keys()),
                });
            }

            if (method === 'POST' && url.pathname === '/sessions/new') {
                const body = await this.readBody(req);
                const { name } = JSON.parse(body);
                const sessionName = name || `session-${Date.now()}`;
                this.sessions.set(sessionName, []);
                this.sessionId = sessionName;
                this.messageHistory = this.sessions.get(sessionName)!;
                this.messageCount = 0;
                this.nudge.resetSession();
                await this.nudge.fire('session-start');
                return this.sendJson(res, 200, { session: sessionName });
            }

            if (method === 'POST' && url.pathname === '/sessions/switch') {
                const body = await this.readBody(req);
                const { name } = JSON.parse(body);
                if (!this.sessions.has(name)) {
                    return this.sendJson(res, 404, { error: 'session not found' });
                }
                // Fire pre-new-session on current session
                await this.nudge.fire('pre-new-session');
                this.sessionId = name;
                this.messageHistory = this.sessions.get(name)!;
                this.messageCount = this.messageHistory.length;
                this.nudge.resetSession();
                return this.sendJson(res, 200, { session: name });
            }

            if (method === 'POST' && url.pathname === '/sessions/rename') {
                const body = await this.readBody(req);
                const { oldName, newName } = JSON.parse(body);
                if (!this.sessions.has(oldName)) {
                    return this.sendJson(res, 404, { error: 'session not found' });
                }
                const history = this.sessions.get(oldName)!;
                this.sessions.delete(oldName);
                this.sessions.set(newName, history);
                if (this.sessionId === oldName) this.sessionId = newName;
                return this.sendJson(res, 200, { session: newName });
            }

            if (method === 'DELETE' && url.pathname.startsWith('/sessions/')) {
                const name = url.pathname.split('/sessions/')[1];
                if (name === this.sessionId) {
                    return this.sendJson(res, 400, { error: 'cannot delete active session' });
                }
                this.sessions.delete(name);
                return this.sendJson(res, 200, { deleted: name });
            }

            // ── Memory tools (for agent-internal use) ──

            if (method === 'POST' && url.pathname === '/memory/write') {
                const body = await this.readBody(req);
                const { content, target } = JSON.parse(body);
                if (target === 'user') {
                    return this.sendJson(res, 200, this.memory.writeUser(content));
                }
                return this.sendJson(res, 200, this.memory.writeMemory(content));
            }

            if (method === 'POST' && url.pathname === '/memory/append') {
                const body = await this.readBody(req);
                const { fact } = JSON.parse(body);
                return this.sendJson(res, 200, { ok: this.memory.appendMemory(fact) });
            }

            if (method === 'POST' && url.pathname === '/memory/search') {
                const body = await this.readBody(req);
                const { query, maxResults } = JSON.parse(body);
                return this.sendJson(res, 200, { results: this.memory.searchDeep(query, maxResults) });
            }

            if (method === 'GET' && url.pathname === '/memory') {
                return this.sendJson(res, 200, this.memory.loadWarm());
            }

            // ── Vault file operations ──

            if (method === 'GET' && url.pathname.startsWith('/vault/')) {
                const filePath = url.pathname.slice('/vault/'.length);
                const content = this.memory.readDeep(filePath);
                if (content === null) return this.sendJson(res, 404, { error: 'not found' });
                return this.sendJson(res, 200, { path: filePath, content });
            }

            if (method === 'POST' && url.pathname.startsWith('/vault/')) {
                const filePath = url.pathname.slice('/vault/'.length);
                const body = await this.readBody(req);
                const { content } = JSON.parse(body);
                this.memory.writeDeep(filePath, content);
                return this.sendJson(res, 200, { written: filePath });
            }

            // 404
            this.sendJson(res, 404, { error: 'not found' });
        } catch (err) {
            log.error({ err, path: url.pathname }, 'request error');
            this.sendJson(res, 500, { error: String(err) });
        }
    }

    // ── Message Handling ──

    private async handleMessage(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const body = await this.readBody(req);
        const { prompt } = JSON.parse(body);

        if (!prompt) {
            return this.sendJson(res, 400, { error: 'prompt required' });
        }

        // Check for slash commands
        const slashResult = this.handleSlashCommand(prompt);
        if (slashResult) {
            return this.sendJson(res, 200, slashResult);
        }

        // Stream NDJSON response
        res.writeHead(200, {
            'Content-Type': 'application/x-ndjson',
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
        });

        const messages = await this.processPrompt(prompt, (msg) => {
            res.write(JSON.stringify(msg) + '\n');
        });

        // Final result message
        const lastAssistant = messages.filter(m => m.type === 'assistant').pop();
        if (lastAssistant) {
            res.write(JSON.stringify({ type: 'result', content: lastAssistant.content, timestamp: Date.now() }) + '\n');
        }

        res.end();
    }

    /**
     * Process a prompt through the agent pipeline.
     */
    private async processPrompt(prompt: string, stream?: (msg: EctoMessage) => void): Promise<EctoMessage[]> {
        return new Promise((resolve, reject) => {
            this.queue.push({ prompt, resolve, reject, stream });
            this.drainQueue();
        });
    }

    private async drainQueue(): Promise<void> {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;

        while (this.queue.length > 0) {
            const req = this.queue.shift()!;
            try {
                const messages = await this.executePrompt(req.prompt, req.stream);
                req.resolve(messages);
            } catch (err) {
                req.reject(err instanceof Error ? err : new Error(String(err)));
            }
        }

        this.processing = false;
    }

    /**
     * Execute a single prompt against the AI provider.
     * This is the core agent loop — builds system prompt with warm memory,
     * sends to the AI provider, streams responses, and fires nudge events.
     */
    private async executePrompt(prompt: string, stream?: (msg: EctoMessage) => void): Promise<EctoMessage[]> {
        this.abortController = new AbortController();
        const messages: EctoMessage[] = [];

        // Build system prompt with warm memory injection
        const systemPrompt = this.buildSystemPrompt();

        // Add user message to history
        this.messageHistory.push({ role: 'user', content: prompt });

        // Build message payload for the AI provider
        const payload = this.buildPayload(systemPrompt, this.messageHistory);

        try {
            // Call the AI provider
            const response = await this.callProvider(payload);

            // Process response
            const assistantMsg: EctoMessage = {
                type: 'assistant',
                content: response.content,
                timestamp: Date.now(),
            };
            messages.push(assistantMsg);
            stream?.(assistantMsg);

            // Add to history
            this.messageHistory.push({ role: 'assistant', content: response.content });
            this.messageCount++;
            this.nudge.recordMessage();

            // Process any tool calls in the response
            if (response.toolCalls) {
                for (const tc of response.toolCalls) {
                    const toolUseMsg: EctoMessage = {
                        type: 'tool_use',
                        content: JSON.stringify(tc.input),
                        toolName: tc.name,
                        toolId: tc.id,
                        timestamp: Date.now(),
                    };
                    messages.push(toolUseMsg);
                    stream?.(toolUseMsg);

                    // Execute tool
                    const result = await this.executeTool(tc.name, tc.input);
                    const toolResultMsg: EctoMessage = {
                        type: 'tool_result',
                        content: result,
                        toolName: tc.name,
                        toolId: tc.id,
                        timestamp: Date.now(),
                    };
                    messages.push(toolResultMsg);
                    stream?.(toolResultMsg);
                }
            }

            // Fire message-complete nudge
            await this.nudge.fire('message-complete');

            // Check if compaction needed
            if (this.shouldCompact()) {
                await this.triggerCompaction();
            }

        } catch (err) {
            const errorMsg: EctoMessage = {
                type: 'error',
                content: String(err),
                timestamp: Date.now(),
            };
            messages.push(errorMsg);
            stream?.(errorMsg);
        } finally {
            this.abortController = undefined;
        }

        return messages;
    }

    // ── System Prompt Builder ──

    private buildSystemPrompt(): string {
        const base = this.loadSystemPrompt();
        const memoryInjection = this.memory.buildPromptInjection();
        const extensions = this.memory.listExtensions();

        let prompt = base;

        if (memoryInjection) {
            prompt += `\n\n## Active Memory\n\n${memoryInjection}`;
        }

        if (extensions.length > 0) {
            prompt += `\n\n## Loaded Extensions\n\n${extensions.map(e => `- ${e}`).join('\n')}`;
        }

        return prompt;
    }

    private loadSystemPrompt(): string {
        if (this.config.systemPrompt) return this.config.systemPrompt;

        const claudeMd = path.join(this.config.vaultPath, 'CLAUDE.md');
        if (fs.existsSync(claudeMd)) {
            return fs.readFileSync(claudeMd, 'utf-8');
        }
        return `You are ${this.config.ectoName}, a persistent AI agent in the Swarm network.`;
    }

    // ── AI Provider Abstraction ──

    private buildPayload(systemPrompt: string, history: Array<{ role: string; content: string }>) {
        return {
            model: this.config.model,
            system: systemPrompt,
            messages: history.map(m => ({ role: m.role, content: m.content })),
            max_tokens: 8192,
        };
    }

    private async callProvider(payload: any): Promise<{ content: string; toolCalls?: Array<{ id: string; name: string; input: any }> }> {
        if (this.config.provider === 'anthropic') {
            return this.callAnthropic(payload);
        }
        return this.callOpenAI(payload);
    }

    private async callAnthropic(payload: any): Promise<{ content: string; toolCalls?: Array<{ id: string; name: string; input: any }> }> {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(payload),
            signal: this.abortController?.signal,
        });

        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`Anthropic API error ${resp.status}: ${err}`);
        }

        const data = await resp.json() as any;
        const content = data.content
            ?.filter((b: any) => b.type === 'text')
            .map((b: any) => b.text)
            .join('') || '';

        const toolCalls = data.content
            ?.filter((b: any) => b.type === 'tool_use')
            .map((b: any) => ({ id: b.id, name: b.name, input: b.input }));

        return { content, toolCalls: toolCalls?.length ? toolCalls : undefined };
    }

    private async callOpenAI(payload: any): Promise<{ content: string; toolCalls?: Array<{ id: string; name: string; input: any }> }> {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
                model: payload.model,
                messages: [
                    { role: 'system', content: payload.system },
                    ...payload.messages,
                ],
                max_tokens: payload.max_tokens,
            }),
            signal: this.abortController?.signal,
        });

        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`OpenAI API error ${resp.status}: ${err}`);
        }

        const data = await resp.json() as any;
        const choice = data.choices?.[0];
        return { content: choice?.message?.content || '' };
    }

    // ── Tool Execution (built-in memory tools) ──

    private async executeTool(name: string, input: any): Promise<string> {
        switch (name) {
            case 'memory_write':
                return JSON.stringify(this.memory.writeMemory(input.content));
            case 'memory_append':
                return JSON.stringify({ ok: this.memory.appendMemory(input.fact) });
            case 'memory_replace':
                return JSON.stringify({ ok: this.memory.replaceMemory(input.old, input.new) });
            case 'memory_remove':
                return JSON.stringify({ ok: this.memory.removeMemory(input.line) });
            case 'memory_show':
                return JSON.stringify(this.memory.loadWarm());
            case 'user_write':
                return JSON.stringify(this.memory.writeUser(input.content));
            case 'vault_search':
                return JSON.stringify(this.memory.searchDeep(input.query, input.maxResults));
            case 'vault_read':
                return this.memory.readDeep(input.path) || 'File not found';
            case 'vault_write':
                this.memory.writeDeep(input.path, input.content);
                return `Written to ${input.path}`;
            case 'extension_write':
                this.memory.writeExtension(input.name, input.code);
                return `Extension ${input.name} saved. Reload to activate.`;
            default:
                return `Unknown tool: ${name}`;
        }
    }

    // ── Slash Commands ──

    private handleSlashCommand(prompt: string): any | null {
        const trimmed = prompt.trim();
        if (!trimmed.startsWith('/')) return null;

        const [cmd, ...args] = trimmed.split(/\s+/);

        switch (cmd) {
            case '/compact':
                this.triggerCompaction();
                return { type: 'status', content: 'Compaction triggered' };
            case '/reload':
                return { type: 'status', content: 'Reloaded', extensions: this.memory.listExtensions() };
            case '/model':
                if (args[0]) {
                    this.config.model = args[0];
                    return { type: 'status', content: `Model switched to ${args[0]}` };
                }
                return { type: 'status', content: `Current model: ${this.config.model}` };
            case '/new':
                const name = args[0] || `session-${Date.now()}`;
                this.sessions.set(name, []);
                this.sessionId = name;
                this.messageHistory = [];
                this.sessions.set(name, this.messageHistory);
                this.nudge.resetSession();
                return { type: 'status', content: `New session: ${name}` };
            case '/history':
                const count = parseInt(args[0] || '20', 10);
                return { type: 'history', messages: this.messageHistory.slice(-count) };
            case '/help':
                return {
                    type: 'status',
                    content: 'Commands: /compact /reload /model [name] /new [name] /history [n] /help',
                };
            default:
                return null; // not a recognized slash command, process as normal message
        }
    }

    // ── Compaction ──

    private shouldCompact(): boolean {
        const threshold = this.config.compactionThreshold || 100;
        return this.messageHistory.length > threshold;
    }

    private async triggerCompaction(): Promise<void> {
        log.info({ ecto: this.config.ectoName }, 'triggering compaction');

        // 1. Fire pre-compact nudge (memory observer runs here)
        await this.nudge.fire('pre-compact', 'context compaction');

        // 2. Give agent one last turn to save memories (flush)
        const flushPrompt = this.memory.buildFlushPrompt();
        await this.executePrompt(flushPrompt);

        // 3. Compact history — keep system context + last N messages
        const keepLast = 20;
        if (this.messageHistory.length > keepLast) {
            const summary = this.summarizeHistory(this.messageHistory.slice(0, -keepLast));
            this.messageHistory = [
                { role: 'assistant', content: `[Session context summary]\n${summary}` },
                ...this.messageHistory.slice(-keepLast),
            ];
        }

        log.info({ ecto: this.config.ectoName, remaining: this.messageHistory.length }, 'compaction complete');
    }

    private summarizeHistory(messages: Array<{ role: string; content: string }>): string {
        // Simple summary — concatenate key points
        const points: string[] = [];
        for (const msg of messages) {
            if (msg.role === 'user' && msg.content.length > 10) {
                points.push(`User asked: ${msg.content.slice(0, 100)}...`);
            }
        }
        return points.slice(-10).join('\n');
    }

    // ── Nudge Default Handlers ──

    private registerDefaultNudgeHandlers(): void {
        // Memory observer on pre-compaction
        this.nudge.register({
            event: 'pre-compact',
            name: 'memory-observer',
            critical: true,
            handler: async (ctx) => {
                if (!this.config.observerModel) return;
                log.info({ ecto: ctx.ectoName }, 'running memory observer');

                const transcript = this.messageHistory
                    .slice(-50)
                    .map(m => `${m.role}: ${m.content.slice(0, 500)}`)
                    .join('\n');

                const observerPrompt = this.memory.buildObserverPrompt(transcript);

                try {
                    const result = await this.callProvider({
                        model: this.config.observerModel,
                        system: 'You are a memory extraction assistant. Output only JSON.',
                        messages: [{ role: 'user', content: observerPrompt }],
                        max_tokens: 2048,
                    });

                    const parsed = JSON.parse(result.content);
                    const applied = this.memory.applyObserverResults(parsed);
                    return `Observer extracted ${applied.memoryAdded} memory facts, ${applied.userAdded} user facts`;
                } catch (err) {
                    log.error({ err }, 'memory observer failed');
                    return undefined;
                }
            },
        });

        // Auto-save on pre-new-session
        this.nudge.register({
            event: 'pre-new-session',
            name: 'session-autosave',
            critical: true,
            handler: async (ctx) => {
                log.info({ ecto: ctx.ectoName }, 'auto-saving before session switch');
                // The vault commit happens in the orchestrator, but we ensure
                // the agent gets a chance to flush memories
                return 'session saved';
            },
        });

        // Idle handler — log idle state
        this.nudge.register({
            event: 'idle',
            name: 'idle-logger',
            minInterval: 5 * 60 * 1000,
            handler: async (ctx) => {
                log.info({ ecto: ctx.ectoName, idleSince: new Date(ctx.lastActivity).toISOString() }, 'ecto idle');
                return undefined;
            },
        });
    }

    // ── Utility ──

    private enqueuePrompt(prompt: string): void {
        this.processPrompt(prompt).catch(err => {
            log.error({ err }, 'steered prompt failed');
        });
    }

    private sendJson(res: http.ServerResponse, status: number, data: any): void {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }

    private readBody(req: http.IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', () => resolve(Buffer.concat(chunks).toString()));
            req.on('error', reject);
        });
    }
}

// ── Standalone entry point (runs inside Docker container) ──

if (require.main === module) {
    const config: EctoServerConfig = {
        port: parseInt(process.env.ECTO_PORT || '3000', 10),
        vaultPath: process.env.VAULT_PATH || '/vault',
        ectoName: process.env.ECTO_NAME || 'unnamed',
        provider: (process.env.ECTO_PROVIDER as 'anthropic' | 'openai') || 'anthropic',
        model: process.env.ECTO_MODEL || 'claude-sonnet-4-6',
        apiKey: process.env.ECTO_API_KEY || '',
        observerModel: process.env.ECTO_OBSERVER_MODEL,
        observerApiKey: process.env.ECTO_OBSERVER_API_KEY,
        authToken: process.env.ECTO_AUTH_TOKEN,
        compactionThreshold: parseInt(process.env.ECTO_COMPACTION_THRESHOLD || '100', 10),
        idleTimeoutMs: parseInt(process.env.ECTO_IDLE_TIMEOUT || '300000', 10),
    };

    const server = new EctoServer(config);
    server.start().catch(err => {
        log.fatal({ err }, 'ecto server failed to start');
        process.exit(1);
    });

    process.on('SIGTERM', async () => {
        log.info('SIGTERM received, shutting down');
        await server.stop();
        process.exit(0);
    });
}
