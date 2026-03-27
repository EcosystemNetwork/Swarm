/**
 * Agent Vault — Git-backed persistent per-agent workspace.
 *
 * Each ecto gets an isolated vault directory with:
 *   - CLAUDE.md     — agent instructions (editable by agent for self-evolution)
 *   - MEMORY.md     — warm memory (injected into system prompt)
 *   - USER.md       — user profile (injected into system prompt)
 *   - knowledge/    — deep memory files (searchable on demand)
 *   - code/         — code artifacts
 *   - .ecto/extensions/ — agent-written tools (self-evolution)
 *
 * All state is version-controlled via git. Each ecto gets its own branch.
 * Vaults can be pushed/pulled from GitHub for backup and cross-machine sync.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { VaultStatus, VaultFile } from './types';
import { childLogger } from './logger';

const log = childLogger('vault');

const DEFAULT_DATA_DIR = path.join(process.env.HOME || '/root', '.ecto');

export function getDataDir(): string {
    return process.env.ECTO_DATA_DIR || DEFAULT_DATA_DIR;
}

export function getVaultPath(ectoName: string): string {
    return path.join(getDataDir(), 'ectos', ectoName, 'vault');
}

/**
 * Initialize a new vault for an ecto.
 */
export function initVault(ectoName: string, systemPrompt?: string): string {
    const vaultPath = getVaultPath(ectoName);

    if (fs.existsSync(vaultPath)) {
        log.info({ ecto: ectoName }, 'vault already exists');
        return vaultPath;
    }

    // Create directory structure
    fs.mkdirSync(vaultPath, { recursive: true });
    fs.mkdirSync(path.join(vaultPath, 'knowledge'), { recursive: true });
    fs.mkdirSync(path.join(vaultPath, 'code'), { recursive: true });
    fs.mkdirSync(path.join(vaultPath, '.ecto', 'extensions'), { recursive: true });

    // Write initial files
    fs.writeFileSync(
        path.join(vaultPath, 'CLAUDE.md'),
        systemPrompt || getDefaultSystemPrompt(ectoName)
    );
    fs.writeFileSync(path.join(vaultPath, 'MEMORY.md'), '');
    fs.writeFileSync(path.join(vaultPath, 'USER.md'), '');
    fs.writeFileSync(
        path.join(vaultPath, '.gitignore'),
        'node_modules/\n.env\n*.log\ntmp/\n'
    );

    // Initialize git repo
    const git = (cmd: string) => execSync(`git ${cmd}`, { cwd: vaultPath, encoding: 'utf-8' });

    git('init');
    git(`config user.name "${ectoName}"`);
    git(`config user.email "${ectoName}@ecto.swarm"`);
    git('add -A');
    git(`commit -m "init: vault created for ${ectoName}"`);
    git(`checkout -b ecto/${ectoName}`);

    log.info({ ecto: ectoName, path: vaultPath }, 'vault initialized');
    return vaultPath;
}

/**
 * Commit all changes in the vault.
 */
export function commitVault(ectoName: string, message?: string): boolean {
    const vaultPath = getVaultPath(ectoName);
    if (!fs.existsSync(vaultPath)) return false;

    try {
        const git = (cmd: string) => execSync(`git ${cmd}`, { cwd: vaultPath, encoding: 'utf-8' });
        git('add -A');

        // Check if there are changes to commit
        try {
            git('diff --cached --quiet');
            return false; // no changes
        } catch {
            // diff returns non-zero when there are changes — good
        }

        const msg = message || `auto: vault snapshot at ${new Date().toISOString()}`;
        git(`commit -m ${JSON.stringify(msg)}`);
        log.info({ ecto: ectoName, message: msg }, 'vault committed');
        return true;
    } catch (err) {
        log.error({ ecto: ectoName, err }, 'vault commit failed');
        return false;
    }
}

/**
 * Push vault to a remote GitHub repo.
 */
export function pushVault(ectoName: string, remote: string, token: string): boolean {
    const vaultPath = getVaultPath(ectoName);
    if (!fs.existsSync(vaultPath)) return false;

    try {
        const git = (cmd: string) => execSync(`git ${cmd}`, { cwd: vaultPath, encoding: 'utf-8' });
        const authedRemote = remote.replace('https://', `https://${token}@`);

        // Set or update remote
        try {
            git(`remote set-url origin ${authedRemote}`);
        } catch {
            git(`remote add origin ${authedRemote}`);
        }

        git(`push -u origin ecto/${ectoName}`);
        log.info({ ecto: ectoName }, 'vault pushed to remote');
        return true;
    } catch (err) {
        log.error({ ecto: ectoName, err }, 'vault push failed');
        return false;
    }
}

/**
 * Pull vault from a remote GitHub repo.
 */
export function pullVault(ectoName: string, remote: string, token: string): boolean {
    const vaultPath = getVaultPath(ectoName);

    try {
        const authedRemote = remote.replace('https://', `https://${token}@`);

        if (!fs.existsSync(vaultPath)) {
            // Clone
            fs.mkdirSync(path.dirname(vaultPath), { recursive: true });
            execSync(
                `git clone -b ecto/${ectoName} ${authedRemote} ${vaultPath}`,
                { encoding: 'utf-8' }
            );
        } else {
            // Pull
            execSync(`git pull origin ecto/${ectoName}`, { cwd: vaultPath, encoding: 'utf-8' });
        }

        log.info({ ecto: ectoName }, 'vault pulled from remote');
        return true;
    } catch (err) {
        log.error({ ecto: ectoName, err }, 'vault pull failed');
        return false;
    }
}

/**
 * Merge one ecto's vault into another.
 */
export function mergeVaults(sourceName: string, targetName: string): boolean {
    const sourcePath = getVaultPath(sourceName);
    const targetPath = getVaultPath(targetName);

    if (!fs.existsSync(sourcePath) || !fs.existsSync(targetPath)) return false;

    try {
        const git = (cmd: string) => execSync(`git ${cmd}`, { cwd: targetPath, encoding: 'utf-8' });

        try {
            git(`remote add ${sourceName} ${sourcePath}`);
        } catch {
            git(`remote set-url ${sourceName} ${sourcePath}`);
        }

        git(`fetch ${sourceName}`);
        git(`merge ${sourceName}/ecto/${sourceName} --allow-unrelated-histories -m "merge: ${sourceName} into ${targetName}"`);
        git(`remote remove ${sourceName}`);

        log.info({ source: sourceName, target: targetName }, 'vaults merged');
        return true;
    } catch (err) {
        log.error({ source: sourceName, target: targetName, err }, 'vault merge failed');
        return false;
    }
}

/**
 * Get vault status.
 */
export function getVaultStatus(ectoName: string): VaultStatus | null {
    const vaultPath = getVaultPath(ectoName);
    if (!fs.existsSync(vaultPath)) return null;

    try {
        const git = (cmd: string) => execSync(`git ${cmd}`, { cwd: vaultPath, encoding: 'utf-8' }).trim();

        const status = git('status --porcelain');
        const dirty = status.length > 0;
        const commitCount = parseInt(git('rev-list --count HEAD'), 10);
        const lastCommit = git('log -1 --format=%s');
        const branch = git('rev-parse --abbrev-ref HEAD');

        return { dirty, commitCount, lastCommit, branch };
    } catch {
        return null;
    }
}

/**
 * Read a file from the vault.
 */
export function readVaultFile(ectoName: string, filePath: string): VaultFile | null {
    const vaultPath = getVaultPath(ectoName);
    const full = path.join(vaultPath, filePath);

    // Prevent path traversal
    if (!full.startsWith(vaultPath)) return null;
    if (!fs.existsSync(full)) return null;

    const content = fs.readFileSync(full, 'utf-8');
    const stat = fs.statSync(full);
    return { path: filePath, content, size: stat.size };
}

/**
 * Write a file to the vault.
 */
export function writeVaultFile(ectoName: string, filePath: string, content: string): boolean {
    const vaultPath = getVaultPath(ectoName);
    const full = path.join(vaultPath, filePath);

    if (!full.startsWith(vaultPath)) return false;

    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(full, content, 'utf-8');
    return true;
}

/**
 * Delete a file from the vault.
 */
export function deleteVaultFile(ectoName: string, filePath: string): boolean {
    const vaultPath = getVaultPath(ectoName);
    const full = path.join(vaultPath, filePath);

    if (!full.startsWith(vaultPath)) return false;
    if (!fs.existsSync(full)) return false;

    fs.unlinkSync(full);
    return true;
}

/**
 * List all files in the vault (excluding .git).
 */
export function listVaultFiles(ectoName: string): string[] {
    const vaultPath = getVaultPath(ectoName);
    if (!fs.existsSync(vaultPath)) return [];

    const results: string[] = [];
    function walk(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === '.git' || entry.name === 'node_modules') continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else {
                results.push(path.relative(vaultPath, full));
            }
        }
    }
    walk(vaultPath);
    return results;
}

// ── Default system prompt ──

function getDefaultSystemPrompt(ectoName: string): string {
    return `# ${ectoName}

You are ${ectoName}, a persistent AI agent in the Swarm network.

## Memory System

You have a two-layer memory system:

### Warm Memory (auto-injected)
- **MEMORY.md**: Your observations, facts, and context. Use memory tools to update.
- **USER.md**: What you know about the user. Updated via memory tools.

### Deep Memory (search on demand)
- **knowledge/**: Detailed knowledge files you've written.
- **code/**: Code artifacts and snippets.
- Search with the vault_search tool when you need to recall detailed information.

## Self-Evolution

You can create your own tools by writing TypeScript files to \`.ecto/extensions/\`.
Each extension should export a default function that will be registered as a tool.

## Vault

Your entire workspace is git-versioned. Changes are auto-committed and can be
synced across machines via GitHub.

## Guidelines

- Save important facts to MEMORY.md before they leave your context window.
- Write detailed knowledge to knowledge/ files for long-term reference.
- Be proactive about maintaining your memory — context compaction will happen.
- Build tools when you find yourself doing repetitive work.
`;
}
