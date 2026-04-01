/**
 * Two-Layer Memory Manager — Warm + Deep memory with observer and pre-compaction flush.
 *
 * Warm memory: MEMORY.md + USER.md injected directly into the system prompt.
 * Character-limited to keep context lean. Managed by the agent via native tools.
 *
 * Deep memory: Vault files (knowledge/, code/, extensions/) searchable on demand
 * via ripgrep. Stores detailed knowledge, code artifacts, and agent-written tools.
 *
 * Memory Observer: A secondary LLM call that reviews conversation history and
 * auto-extracts facts into warm memory. Fires on pre-compaction.
 *
 * Pre-compaction flush: Before context compression, gives the agent one turn
 * to save anything important from the conversation to warm or deep memory.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { WarmMemory, MemoryEntry, MemoryObserverResult } from './types';
import { childLogger } from './logger';
import {
    VectorMemoryManager,
    EmbeddingProvider,
    VectorSearchResult,
    HybridSearchResult,
    createOpenAIEmbeddingProvider,
    createLocalEmbeddingProvider,
} from './vector-memory';

const log = childLogger('memory');

const MEMORY_MAX_CHARS = 4000;
const USER_MAX_CHARS = 2000;

export class MemoryManager {
    private vaultPath: string;
    private memoryPath: string;
    private userPath: string;
    private vectorMemory: VectorMemoryManager | null = null;

    constructor(vaultPath: string) {
        this.vaultPath = vaultPath;
        this.memoryPath = path.join(vaultPath, 'MEMORY.md');
        this.userPath = path.join(vaultPath, 'USER.md');
    }

    // ── Vector Memory Integration ──

    /**
     * Initialize semantic vector memory with an embedding provider.
     * Call once after construction to enable semantic search.
     */
    initVectorMemory(provider?: EmbeddingProvider): VectorMemoryManager {
        if (!provider) {
            // Auto-detect: use OpenAI if key available, else local
            const apiKey = process.env.OPENAI_API_KEY;
            provider = apiKey
                ? createOpenAIEmbeddingProvider({ apiKey })
                : createLocalEmbeddingProvider();
        }
        this.vectorMemory = new VectorMemoryManager(this.vaultPath, provider);
        log.info('vector memory initialized');
        return this.vectorMemory;
    }

    /** Get the vector memory manager (null if not initialized) */
    getVectorMemory(): VectorMemoryManager | null {
        return this.vectorMemory;
    }

    /**
     * Semantic search across vault — falls back to text search if vector memory
     * is not initialized.
     */
    async searchSemantic(query: string, topK = 10): Promise<HybridSearchResult[]> {
        if (!this.vectorMemory) {
            // Fallback to text-only search
            const textResults = this.searchDeep(query, topK);
            return textResults.map(r => ({
                file: r.file,
                content: r.content,
                score: 1, // text matches are binary
                source: 'text' as const,
            }));
        }

        // Hybrid: combine vector + text search via RRF
        const textResults = this.searchDeep(query, topK);
        return this.vectorMemory.hybridSearch(query, textResults, topK);
    }

    // ── Warm Memory (injected into system prompt) ──

    /**
     * Load warm memory from vault files.
     */
    loadWarm(): WarmMemory {
        return {
            memory: this.readFile(this.memoryPath),
            user: this.readFile(this.userPath),
        };
    }

    /**
     * Write to MEMORY.md (agent's observations and facts).
     * Enforces character limit.
     */
    writeMemory(content: string): { ok: boolean; truncated: boolean } {
        const truncated = content.length > MEMORY_MAX_CHARS;
        const final = truncated ? content.slice(0, MEMORY_MAX_CHARS) : content;
        fs.writeFileSync(this.memoryPath, final, 'utf-8');
        log.info({ chars: final.length, truncated }, 'memory updated');
        return { ok: true, truncated };
    }

    /**
     * Write to USER.md (user profile and preferences).
     * Enforces character limit.
     */
    writeUser(content: string): { ok: boolean; truncated: boolean } {
        const truncated = content.length > USER_MAX_CHARS;
        const final = truncated ? content.slice(0, USER_MAX_CHARS) : content;
        fs.writeFileSync(this.userPath, final, 'utf-8');
        log.info({ chars: final.length, truncated }, 'user profile updated');
        return { ok: true, truncated };
    }

    /**
     * Append a fact to MEMORY.md. Returns false if at capacity.
     */
    appendMemory(fact: string): boolean {
        const current = this.readFile(this.memoryPath);
        const updated = current ? `${current}\n- ${fact}` : `- ${fact}`;
        if (updated.length > MEMORY_MAX_CHARS) {
            log.warn('memory at capacity, cannot append');
            return false;
        }
        fs.writeFileSync(this.memoryPath, updated, 'utf-8');
        return true;
    }

    /**
     * Replace a specific line in MEMORY.md.
     */
    replaceMemory(oldLine: string, newLine: string): boolean {
        const current = this.readFile(this.memoryPath);
        if (!current.includes(oldLine)) return false;
        const updated = current.replace(oldLine, newLine);
        fs.writeFileSync(this.memoryPath, updated, 'utf-8');
        return true;
    }

    /**
     * Remove a line from MEMORY.md.
     */
    removeMemory(line: string): boolean {
        const current = this.readFile(this.memoryPath);
        const lines = current.split('\n').filter(l => !l.includes(line));
        fs.writeFileSync(this.memoryPath, lines.join('\n'), 'utf-8');
        return true;
    }

    /**
     * Build the memory injection block for the system prompt.
     */
    buildPromptInjection(): string {
        const warm = this.loadWarm();
        const parts: string[] = [];

        if (warm.memory.trim()) {
            parts.push(`<memory>\n${warm.memory}\n</memory>`);
        }
        if (warm.user.trim()) {
            parts.push(`<user_profile>\n${warm.user}\n</user_profile>`);
        }

        return parts.join('\n\n');
    }

    // ── Deep Memory (vault search) ──

    /**
     * Search the vault for content matching a query using ripgrep.
     * Returns matching file paths and line content.
     */
    searchDeep(query: string, maxResults = 20): Array<{ file: string; line: number; content: string }> {
        try {
            const result = execSync(
                `rg --json -m ${maxResults} -i ${JSON.stringify(query)} ${JSON.stringify(this.vaultPath)}`,
                { encoding: 'utf-8', timeout: 10000 }
            );

            const matches: Array<{ file: string; line: number; content: string }> = [];
            for (const line of result.split('\n').filter(Boolean)) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.type === 'match') {
                        matches.push({
                            file: path.relative(this.vaultPath, parsed.data.path.text),
                            line: parsed.data.line_number,
                            content: parsed.data.lines.text.trim(),
                        });
                    }
                } catch {
                    // skip malformed lines
                }
            }
            return matches;
        } catch {
            return [];
        }
    }

    /**
     * List all files in the knowledge directory.
     */
    listKnowledge(): string[] {
        const knowledgeDir = path.join(this.vaultPath, 'knowledge');
        if (!fs.existsSync(knowledgeDir)) return [];
        return this.listFilesRecursive(knowledgeDir).map(f => path.relative(this.vaultPath, f));
    }

    /**
     * Read a specific deep memory file.
     */
    readDeep(filePath: string): string | null {
        const full = path.join(this.vaultPath, filePath);
        if (!fs.existsSync(full)) return null;
        // Prevent path traversal
        if (!full.startsWith(this.vaultPath)) return null;
        return fs.readFileSync(full, 'utf-8');
    }

    /**
     * Write a deep memory file (knowledge, code, or extension).
     */
    writeDeep(filePath: string, content: string): void {
        const full = path.join(this.vaultPath, filePath);
        if (!full.startsWith(this.vaultPath)) {
            throw new Error('Path traversal not allowed');
        }
        const dir = path.dirname(full);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(full, content, 'utf-8');
        log.info({ file: filePath }, 'deep memory written');
    }

    // ── Memory Observer ──

    /**
     * Process a conversation transcript and extract facts for warm memory.
     * This is called by the observer model (a secondary LLM) during pre-compaction.
     *
     * Returns structured updates to apply to MEMORY.md and USER.md.
     */
    buildObserverPrompt(transcript: string): string {
        const warm = this.loadWarm();
        return `You are a memory observer. Your job is to review a conversation transcript and extract important facts that should be persisted in the agent's memory.

Current MEMORY.md (${warm.memory.length}/${MEMORY_MAX_CHARS} chars):
${warm.memory || '(empty)'}

Current USER.md (${warm.user.length}/${USER_MAX_CHARS} chars):
${warm.user || '(empty)'}

Review this conversation transcript and output a JSON object with two arrays:
- "memoryUpdates": facts about the world, project, codebase, or decisions to add to MEMORY.md
- "userUpdates": facts about the user's preferences, role, or patterns to add to USER.md

Only include genuinely important facts that aren't already captured. Be concise.
Each entry should be a single line starting with "- ".

Transcript:
${transcript}

Respond with ONLY a JSON object, no other text.`;
    }

    /**
     * Apply observer results to warm memory.
     */
    applyObserverResults(results: MemoryObserverResult): { memoryAdded: number; userAdded: number } {
        let memoryAdded = 0;
        let userAdded = 0;

        for (const entry of results.memoryUpdates) {
            if (this.appendMemory(entry)) memoryAdded++;
        }

        const currentUser = this.readFile(this.userPath);
        const userEntries = results.userUpdates.join('\n');
        const updatedUser = currentUser ? `${currentUser}\n${userEntries}` : userEntries;
        if (updatedUser.length <= USER_MAX_CHARS) {
            fs.writeFileSync(this.userPath, updatedUser, 'utf-8');
            userAdded = results.userUpdates.length;
        }

        log.info({ memoryAdded, userAdded }, 'observer results applied');
        return { memoryAdded, userAdded };
    }

    // ── Pre-compaction Flush ──

    /**
     * Build a flush prompt that asks the agent to save important context
     * before compaction destroys the full conversation history.
     */
    buildFlushPrompt(): string {
        return `⚠️ CONTEXT COMPACTION IMMINENT

Your conversation context is about to be compressed. After compaction, you will lose access to the detailed conversation history.

NOW is your last chance to save any important information. Use your memory tools to:
1. Update MEMORY.md with any important facts, decisions, or context from this conversation
2. Update USER.md if you learned anything about the user's preferences
3. Write any important code snippets or knowledge to the vault (knowledge/ directory)

Review the conversation above and save what matters. Be selective — only save what you'll genuinely need later.`;
    }

    // ── Self-Evolution: Extensions ──

    /**
     * List agent-written extensions (self-evolution tools).
     */
    listExtensions(): string[] {
        const extDir = path.join(this.vaultPath, '.ecto', 'extensions');
        if (!fs.existsSync(extDir)) return [];
        return fs.readdirSync(extDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
    }

    /**
     * Read an extension file.
     */
    readExtension(name: string): string | null {
        const full = path.join(this.vaultPath, '.ecto', 'extensions', name);
        if (!fs.existsSync(full)) return null;
        return fs.readFileSync(full, 'utf-8');
    }

    /**
     * Write an extension (agent self-evolution).
     */
    writeExtension(name: string, code: string): void {
        const extDir = path.join(this.vaultPath, '.ecto', 'extensions');
        if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true });
        fs.writeFileSync(path.join(extDir, name), code, 'utf-8');
        log.info({ extension: name }, 'extension written (self-evolution)');
    }

    // ── Helpers ──

    private readFile(filePath: string): string {
        if (!fs.existsSync(filePath)) return '';
        return fs.readFileSync(filePath, 'utf-8');
    }

    private listFilesRecursive(dir: string): string[] {
        const results: string[] = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== '.git' && entry.name !== 'node_modules') {
                    results.push(...this.listFilesRecursive(full));
                }
            } else {
                results.push(full);
            }
        }
        return results;
    }
}
