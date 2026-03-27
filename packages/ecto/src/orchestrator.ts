/**
 * Orchestrator — Ecto lifecycle management adapted for Swarm.
 *
 * Manages ecto containers via Docker: spawn, kill, wake, message streaming,
 * state reconciliation, rolling upgrades, and vault operations. Integrates
 * with Swarm's existing swarm-node infrastructure.
 *
 * State persisted to ~/.ecto/state.json.
 */

import Docker from 'dockerode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Ecto, EctoConfig, EctoState, EctoMessage, GlobalConfig, ContainerConfig } from './types';
import { initVault, commitVault, getVaultPath, getDataDir, getVaultStatus, pushVault } from './vault';
import { childLogger } from './logger';

const log = childLogger('orchestrator');

const docker = new Docker();
const ECTO_IMAGE = 'ecto-agent:latest';
const PORT_BASE_START = 3100;
const PORT_INCREMENT = 10;
const HEALTH_CHECK_TIMEOUT = 30_000;
const CONTAINER_MEMORY_MB = 1024;
const CONTAINER_CPU_SHARES = 512;

// ── State Management ──

function getStatePath(): string {
    return path.join(getDataDir(), 'state.json');
}

export function loadState(): EctoState {
    const statePath = getStatePath();
    if (fs.existsSync(statePath)) {
        return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    }
    const defaultState: EctoState = {
        ectos: {},
        config: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-6',
            dataDir: getDataDir(),
        },
        nextPort: PORT_BASE_START,
    };
    saveState(defaultState);
    return defaultState;
}

export function saveState(state: EctoState): void {
    const statePath = getStatePath();
    const dir = path.dirname(statePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

// ── Ecto Lifecycle ──

/**
 * Spawn a new ecto — creates vault, starts Docker container, waits for health.
 */
export async function spawnEcto(
    name: string,
    options?: {
        provider?: 'anthropic' | 'openai';
        model?: string;
        systemPrompt?: string;
        orgId?: string;
        agentId?: string;
    }
): Promise<Ecto> {
    const state = loadState();

    if (state.ectos[name]) {
        throw new Error(`Ecto "${name}" already exists`);
    }

    const config: EctoConfig = {
        name,
        provider: options?.provider || state.config.provider,
        model: options?.model || state.config.model,
        systemPrompt: options?.systemPrompt,
        createdAt: new Date().toISOString(),
        orgId: options?.orgId,
        agentId: options?.agentId,
    };

    // Initialize vault
    const vaultPath = initVault(name, options?.systemPrompt);

    // Allocate port
    const portBase = state.nextPort;
    state.nextPort += PORT_INCREMENT;

    // Generate auth token
    const authToken = crypto.randomBytes(32).toString('hex');

    // Create container
    const containerId = await createEctoContainer({
        name: `ecto-${name}`,
        image: ECTO_IMAGE,
        portBase,
        vaultPath,
        env: {
            ECTO_NAME: name,
            ECTO_PORT: '3000',
            ECTO_PROVIDER: config.provider,
            ECTO_MODEL: config.model,
            ECTO_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '',
            ECTO_AUTH_TOKEN: authToken,
            ECTO_OBSERVER_MODEL: state.config.observerModel || '',
            VAULT_PATH: '/vault',
        },
        memoryMb: CONTAINER_MEMORY_MB,
        cpuShares: CONTAINER_CPU_SHARES,
    });

    const ecto: Ecto = {
        config,
        containerId,
        portBase,
        status: 'starting',
        sessions: ['default'],
        activeSession: 'default',
    };

    state.ectos[name] = ecto;
    saveState(state);

    // Wait for health check
    try {
        await waitForHealth(portBase, authToken);
        ecto.status = 'running';
        state.ectos[name] = ecto;
        saveState(state);
        log.info({ ecto: name, port: portBase, container: containerId }, 'ecto spawned');
    } catch (err) {
        ecto.status = 'error';
        state.ectos[name] = ecto;
        saveState(state);
        log.error({ ecto: name, err }, 'ecto failed health check');
    }

    return ecto;
}

/**
 * Kill an ecto — commit vault, remove container.
 */
export async function killEcto(name: string): Promise<void> {
    const state = loadState();
    const ecto = state.ectos[name];
    if (!ecto) throw new Error(`Ecto "${name}" not found`);

    // Commit vault before killing
    commitVault(name, `auto: pre-kill snapshot`);

    // Remove container
    if (ecto.containerId) {
        try {
            const container = docker.getContainer(ecto.containerId);
            await container.stop().catch(() => { /* might already be stopped */ });
            await container.remove({ force: true });
        } catch (err) {
            log.warn({ ecto: name, err }, 'container removal issue');
        }
    }

    ecto.status = 'stopped';
    ecto.containerId = undefined;
    state.ectos[name] = ecto;
    saveState(state);
    log.info({ ecto: name }, 'ecto killed');
}

/**
 * Wake a stopped ecto — restart its container.
 */
export async function wakeEcto(name: string): Promise<void> {
    const state = loadState();
    const ecto = state.ectos[name];
    if (!ecto) throw new Error(`Ecto "${name}" not found`);
    if (ecto.status === 'running') throw new Error(`Ecto "${name}" already running`);

    const vaultPath = getVaultPath(name);
    const authToken = crypto.randomBytes(32).toString('hex');

    // Remove stale container if present
    if (ecto.containerId) {
        try {
            await docker.getContainer(ecto.containerId).remove({ force: true });
        } catch { /* ignore */ }
    }

    const containerId = await createEctoContainer({
        name: `ecto-${name}`,
        image: ECTO_IMAGE,
        portBase: ecto.portBase,
        vaultPath,
        env: {
            ECTO_NAME: name,
            ECTO_PORT: '3000',
            ECTO_PROVIDER: ecto.config.provider,
            ECTO_MODEL: ecto.config.model,
            ECTO_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '',
            ECTO_AUTH_TOKEN: authToken,
            VAULT_PATH: '/vault',
        },
        memoryMb: CONTAINER_MEMORY_MB,
        cpuShares: CONTAINER_CPU_SHARES,
    });

    ecto.containerId = containerId;
    ecto.status = 'running';
    state.ectos[name] = ecto;
    saveState(state);

    await waitForHealth(ecto.portBase, authToken);
    log.info({ ecto: name }, 'ecto woken');
}

/**
 * Permanently remove an ecto — kill + delete vault.
 */
export async function removeEcto(name: string): Promise<void> {
    await killEcto(name).catch(() => { /* might already be dead */ });

    const state = loadState();
    delete state.ectos[name];
    saveState(state);

    // Move vault to trash instead of hard delete
    const vaultPath = getVaultPath(name);
    const trashPath = path.join(getDataDir(), 'trash', name, `vault-${Date.now()}`);
    if (fs.existsSync(vaultPath)) {
        fs.mkdirSync(path.dirname(trashPath), { recursive: true });
        fs.renameSync(vaultPath, trashPath);
    }

    log.info({ ecto: name, trash: trashPath }, 'ecto removed');
}

/**
 * Send a message to an ecto. Returns an async generator of NDJSON messages.
 */
export async function* sendMessage(
    name: string,
    prompt: string
): AsyncGenerator<EctoMessage> {
    const state = loadState();
    const ecto = state.ectos[name];
    if (!ecto) throw new Error(`Ecto "${name}" not found`);
    if (ecto.status !== 'running') throw new Error(`Ecto "${name}" is not running (status: ${ecto.status})`);

    const url = `http://localhost:${ecto.portBase}/message`;

    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
    });

    if (!resp.ok) {
        throw new Error(`Ecto response error: ${resp.status}`);
    }

    const reader = resp.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                yield JSON.parse(line) as EctoMessage;
            } catch {
                // skip malformed lines
            }
        }
    }

    // Process remaining buffer
    if (buffer.trim()) {
        try {
            yield JSON.parse(buffer) as EctoMessage;
        } catch { /* ignore */ }
    }
}

/**
 * Send a non-blocking steer prompt to an ecto.
 */
export async function steerEcto(name: string, prompt: string): Promise<void> {
    const state = loadState();
    const ecto = state.ectos[name];
    if (!ecto || ecto.status !== 'running') return;

    await callEcto(ecto.portBase, '/steer', { prompt });
}

/**
 * Send a nudge event to an ecto.
 */
export async function nudgeEcto(name: string, event: string, reason?: string): Promise<any> {
    const state = loadState();
    const ecto = state.ectos[name];
    if (!ecto || ecto.status !== 'running') return;

    return callEcto(ecto.portBase, '/nudge', { event, reason });
}

/**
 * Save an ecto's vault (commit + optional push).
 */
export async function saveEcto(name: string, push = false): Promise<boolean> {
    const committed = commitVault(name);
    if (push) {
        const state = loadState();
        if (state.config.githubRepo && state.config.githubToken) {
            pushVault(name, state.config.githubRepo, state.config.githubToken);
        }
    }
    return committed;
}

/**
 * List all ectos.
 */
export function listEctos(): Record<string, Ecto> {
    return loadState().ectos;
}

/**
 * Get a single ecto.
 */
export function getEcto(name: string): Ecto | undefined {
    return loadState().ectos[name];
}

/**
 * Reconcile ecto states — restart any containers that died unexpectedly.
 */
export async function reconcileEctoStates(): Promise<string[]> {
    const state = loadState();
    const restarted: string[] = [];

    for (const [name, ecto] of Object.entries(state.ectos)) {
        if (ecto.status !== 'running' || !ecto.containerId) continue;

        try {
            const container = docker.getContainer(ecto.containerId);
            const info = await container.inspect();

            if (!info.State.Running) {
                log.warn({ ecto: name }, 'ecto container died, restarting');
                await wakeEcto(name);
                restarted.push(name);
            }
        } catch {
            log.warn({ ecto: name }, 'ecto container not found, restarting');
            await wakeEcto(name);
            restarted.push(name);
        }
    }

    return restarted;
}

/**
 * Rolling upgrade — rebuild image and restart all running ectos.
 */
export async function upgradeEctos(dockerDir: string): Promise<string[]> {
    // Compute image version from docker build files
    const files = fs.readdirSync(dockerDir).sort();
    const hash = crypto.createHash('sha256');
    for (const f of files) {
        hash.update(fs.readFileSync(path.join(dockerDir, f)));
    }
    const version = `ec-${hash.digest('hex').slice(0, 8)}`;

    log.info({ version }, 'building new ecto image');

    // Build image
    const stream = await docker.buildImage(
        { context: dockerDir, src: files },
        { t: `${ECTO_IMAGE}` }
    );

    await new Promise<void>((resolve, reject) => {
        docker.modem.followProgress(stream, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // Rolling restart
    const state = loadState();
    const upgraded: string[] = [];

    for (const [name, ecto] of Object.entries(state.ectos)) {
        if (ecto.status !== 'running') continue;
        if (ecto.imageVersion === version) continue;

        log.info({ ecto: name, from: ecto.imageVersion, to: version }, 'upgrading ecto');
        await killEcto(name);
        await wakeEcto(name);

        ecto.imageVersion = version;
        state.ectos[name] = ecto;
        upgraded.push(name);
    }

    saveState(state);
    return upgraded;
}

/**
 * Get global config.
 */
export function getConfig(): GlobalConfig {
    return loadState().config;
}

/**
 * Update global config.
 */
export function updateConfig(updates: Partial<GlobalConfig>): GlobalConfig {
    const state = loadState();
    state.config = { ...state.config, ...updates };
    saveState(state);
    return state.config;
}

// ── Docker Helpers ──

async function createEctoContainer(config: ContainerConfig): Promise<string> {
    // Remove any existing container with the same name
    try {
        const existing = docker.getContainer(config.name);
        await existing.remove({ force: true });
    } catch { /* doesn't exist, fine */ }

    const envArray = Object.entries(config.env).map(([k, v]) => `${k}=${v}`);

    // Port bindings: map container port 3000 to host portBase, plus 8 user ports
    const portBindings: Record<string, Array<{ HostPort: string }>> = {
        '3000/tcp': [{ HostPort: String(config.portBase) }],
    };
    for (let i = 1; i <= 8; i++) {
        portBindings[`${8000 + i}/tcp`] = [{ HostPort: String(config.portBase + i) }];
    }

    const container = await docker.createContainer({
        Image: config.image,
        name: config.name,
        Env: envArray,
        ExposedPorts: Object.fromEntries(Object.keys(portBindings).map(p => [p, {}])),
        HostConfig: {
            Memory: config.memoryMb * 1024 * 1024,
            CpuShares: config.cpuShares,
            PortBindings: portBindings,
            Binds: [
                `${config.vaultPath}:/vault`,
            ],
            RestartPolicy: { Name: 'unless-stopped' },
        },
    });

    await container.start();
    return container.id;
}

async function waitForHealth(port: number, authToken: string): Promise<void> {
    const deadline = Date.now() + HEALTH_CHECK_TIMEOUT;

    while (Date.now() < deadline) {
        try {
            const resp = await fetch(`http://localhost:${port}/health`, {
                headers: { Authorization: `Bearer ${authToken}` },
            });
            if (resp.ok) return;
        } catch { /* not ready yet */ }

        await new Promise(r => setTimeout(r, 1000));
    }

    throw new Error(`Health check timed out after ${HEALTH_CHECK_TIMEOUT}ms`);
}

async function callEcto(port: number, endpoint: string, body: any): Promise<any> {
    const resp = await fetch(`http://localhost:${port}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return resp.json();
}
