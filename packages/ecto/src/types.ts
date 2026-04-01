/**
 * Core types for the Ecto agent runtime.
 */

// ── Ecto state ──

export interface EctoConfig {
    name: string;
    provider: 'anthropic' | 'openai';
    model: string;
    systemPrompt?: string;
    createdAt: string;
    orgId?: string;
    agentId?: string;
}

export interface Ecto {
    config: EctoConfig;
    containerId?: string;
    portBase: number;
    status: 'running' | 'stopped' | 'starting' | 'error';
    imageVersion?: string;
    sessions: string[];
    activeSession: string;
}

export interface EctoState {
    ectos: Record<string, Ecto>;
    config: GlobalConfig;
    nextPort: number;
}

export interface GlobalConfig {
    provider: 'anthropic' | 'openai';
    model: string;
    observerModel?: string;
    githubRepo?: string;
    githubToken?: string;
    dataDir: string;
}

// ── Messages ──

export type EctoMessageType = 'assistant' | 'tool_use' | 'tool_result' | 'result' | 'error' | 'status';

export interface EctoMessage {
    type: EctoMessageType;
    content: string;
    toolName?: string;
    toolId?: string;
    timestamp: number;
}

// ── Nudge system ──

export type NudgeEvent =
    | 'message-complete'
    | 'pre-compact'
    | 'pre-new-session'
    | 'idle'
    | 'timer'
    | 'self'
    | 'session-start';

export interface NudgeHandler {
    event: NudgeEvent;
    name: string;
    handler: (context: NudgeContext) => Promise<string | void>;
    /** Minimum messages since last fire */
    minMessages?: number;
    /** Minimum ms since last fire */
    minInterval?: number;
    /** Critical handlers always block (pre-compact, pre-new-session) */
    critical?: boolean;
}

export interface NudgeContext {
    event: NudgeEvent;
    ectoName: string;
    reason?: string;
    messageCount: number;
    sessionAge: number;
    lastActivity: number;
}

// ── Memory ──

export interface WarmMemory {
    /** Agent's own observations and facts (MEMORY.md) */
    memory: string;
    /** User profile and preferences (USER.md) */
    user: string;
}

export interface MemoryEntry {
    id: string;
    content: string;
    source: 'agent' | 'observer' | 'user';
    timestamp: number;
    tags: string[];
}

export interface MemoryObserverResult {
    memoryUpdates: string[];
    userUpdates: string[];
}

// ── Vault ──

export interface VaultStatus {
    dirty: boolean;
    commitCount: number;
    lastCommit?: string;
    branch: string;
}

export interface VaultFile {
    path: string;
    content: string;
    size: number;
}

// ── Scheduling ──

export interface ScheduleEntry {
    id: string;
    ectoName: string;
    cron: string;
    prompt: string;
    timezone: string;
    enabled: boolean;
    lastRun?: number;
    nextRun?: number;
    createdAt: number;
}

// ── Container ──

export interface ContainerConfig {
    name: string;
    image: string;
    portBase: number;
    vaultPath: string;
    env: Record<string, string>;
    memoryMb: number;
    cpuShares: number;
}

// ── Vector Memory ──

export interface VectorMemoryConfig {
    /** Embedding provider: 'openai' | 'local' */
    embeddingProvider: 'openai' | 'local';
    /** Model name for OpenAI embeddings */
    embeddingModel?: string;
    /** Custom embedding API base URL */
    embeddingBaseUrl?: string;
    /** Vector dimensions (auto-detected from provider if not set) */
    dimensions?: number;
    /** Auto-ingest knowledge/ directory on startup */
    autoIngestKnowledge?: boolean;
}
