/**
 * @swarm/ecto — Ecto agent runtime for the Swarm network.
 *
 * Persistent, isolated AI agents with two-layer memory, self-evolution,
 * proactive behavior (nudge events), and Docker container isolation.
 *
 */

// ── Core types ──
export type {
    Ecto,
    EctoConfig,
    EctoState,
    GlobalConfig,
    EctoMessage,
    EctoMessageType,
    NudgeEvent,
    NudgeHandler,
    NudgeContext,
    WarmMemory,
    MemoryEntry,
    MemoryObserverResult,
    VaultStatus,
    VaultFile,
    ScheduleEntry,
    ContainerConfig,
} from './types';

// ── Orchestrator (ecto lifecycle) ──
export {
    loadState,
    saveState,
    spawnEcto,
    killEcto,
    wakeEcto,
    removeEcto,
    sendMessage,
    steerEcto,
    nudgeEcto,
    saveEcto,
    listEctos,
    getEcto,
    reconcileEctoStates,
    upgradeEctos,
    getConfig,
    updateConfig,
} from './orchestrator';

// ── Vault (git-backed persistence) ──
export {
    getDataDir,
    getVaultPath,
    initVault,
    commitVault,
    pushVault,
    pullVault,
    mergeVaults,
    getVaultStatus,
    readVaultFile,
    writeVaultFile,
    deleteVaultFile,
    listVaultFiles,
} from './vault';

// ── Memory (two-layer: warm + deep) ──
export { MemoryManager } from './memory';

// ── Nudge Registry (proactive behavior) ──
export { NudgeRegistry } from './nudge-registry';

// ── Schedule Manager (cron) ──
export { ScheduleManager } from './schedule';

// ── Ecto Server (container runtime) ──
export { EctoServer } from './ecto-server';

// ── API (Hono) ──
export { createEctoApi } from './api';

// ── Logger ──
export { log, childLogger } from './logger';
