/**
 * Vector Memory — Semantic search layer for Ecto deep memory.
 *
 * Adds embedding-based retrieval on top of the existing ripgrep text search.
 * Uses a local index stored as JSON in the vault, so no external vector DB
 * dependency is required. Embeddings are generated via the configured LLM
 * provider's embedding endpoint (OpenAI or a local model).
 *
 * Architecture:
 *   1. On ingest: chunk text → embed → store vectors + metadata in index file
 *   2. On query: embed query → cosine similarity → rank → return top-K
 *   3. Hybrid search: vector results merged with ripgrep text results via RRF
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { childLogger } from './logger';

const log = childLogger('vector-memory');

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of entries in the index to prevent OOM */
const MAX_INDEX_ENTRIES = 50_000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface EmbeddingProvider {
    /** Generate embeddings for a batch of texts */
    embed(texts: string[]): Promise<number[][]>;
    /** Dimensionality of the embedding vectors */
    dimensions: number;
}

export interface VectorEntry {
    id: string;
    /** Source file path relative to vault */
    file: string;
    /** Chunk index within the file */
    chunkIndex: number;
    /** Original text content */
    content: string;
    /** Embedding vector */
    vector: number[];
    /** Optional tags for filtering */
    tags: string[];
    /** Timestamp of ingestion */
    ingestedAt: number;
}

export interface VectorIndex {
    version: number;
    dimensions: number;
    entries: VectorEntry[];
    lastUpdated: number;
}

export interface VectorSearchResult {
    file: string;
    chunkIndex: number;
    content: string;
    score: number;
    tags: string[];
}

export interface HybridSearchResult {
    file: string;
    content: string;
    score: number;
    source: 'vector' | 'text' | 'both';
}

// ── Embedding Providers ──────────────────────────────────────────────────────

/**
 * OpenAI-compatible embedding provider.
 * Works with OpenAI, Azure OpenAI, and any compatible endpoint.
 */
export function createOpenAIEmbeddingProvider(opts: {
    apiKey: string;
    model?: string;
    baseUrl?: string;
}): EmbeddingProvider {
    const model = opts.model || 'text-embedding-3-small';
    const baseUrl = opts.baseUrl || 'https://api.openai.com/v1';
    const dimensions = model.includes('3-large') ? 3072
        : model.includes('3-small') ? 1536
        : 1536;

    return {
        dimensions,
        async embed(texts: string[]): Promise<number[][]> {
            const resp = await fetch(`${baseUrl}/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${opts.apiKey}`,
                },
                body: JSON.stringify({ input: texts, model }),
            });

            if (!resp.ok) {
                const err = await resp.text();
                throw new Error(`Embedding API error (${resp.status}): ${err}`);
            }

            const data = await resp.json() as {
                data: Array<{ embedding: number[] }>;
            };
            return data.data.map(d => d.embedding);
        },
    };
}

/**
 * Lightweight local embedding using TF-IDF + dimensionality reduction.
 * Zero external dependencies — suitable for offline/air-gapped environments.
 * Lower quality than neural embeddings but works without API calls.
 */
export function createLocalEmbeddingProvider(dimensions = 256): EmbeddingProvider {
    return {
        dimensions,
        async embed(texts: string[]): Promise<number[][]> {
            return texts.map(text => tfidfEmbed(text, dimensions));
        },
    };
}

/** Simple TF-IDF hash-based embedding (no external deps) */
function tfidfEmbed(text: string, dims: number): number[] {
    const vec = new Float64Array(dims);
    const tokens = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    const tf = new Map<string, number>();

    for (const token of tokens) {
        tf.set(token, (tf.get(token) || 0) + 1);
    }

    for (const [token, count] of tf) {
        const h1 = fnv1a(token) % dims;
        const h2 = fnv1a(token + '_2') % dims;
        const h3 = fnv1a(token + '_3') % dims;
        const weight = Math.log(1 + count / tokens.length);
        vec[h1] += weight;
        vec[h2] += weight * 0.5;
        vec[h3] += weight * 0.25;
    }

    // L2 normalize
    let norm = 0;
    for (let i = 0; i < dims; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    const result = new Array(dims);
    for (let i = 0; i < dims; i++) result[i] = vec[i] / norm;
    return result;
}

/** FNV-1a hash */
function fnv1a(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash;
}

// ── Vector Math ──────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
    // Use the shorter length to avoid out-of-bounds on dimension mismatch
    const len = Math.min(a.length, b.length);
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

// ── Path Safety ──────────────────────────────────────────────────────────────

/** Resolve and validate a path is within the vault */
function resolveVaultPath(vaultPath: string, filePath: string): string {
    const resolved = path.resolve(vaultPath, filePath);
    // Ensure resolved path is within vault (use separator to prevent prefix attacks)
    if (!resolved.startsWith(vaultPath + path.sep) && resolved !== vaultPath) {
        throw new Error('Path traversal not allowed');
    }
    return resolved;
}

/** Validate a virtual path contains no traversal */
function validateVirtualPath(virtualPath: string): void {
    if (virtualPath.includes('..') || path.isAbsolute(virtualPath)) {
        throw new Error('Invalid virtual path: must be relative without traversal');
    }
}

// ── Text Chunking ────────────────────────────────────────────────────────────

export interface ChunkOptions {
    /** Max characters per chunk */
    maxChunkSize?: number;
    /** Overlap between chunks in characters */
    overlap?: number;
}

export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
    const maxSize = Math.max(opts.maxChunkSize || 512, 1);
    // Clamp overlap to less than maxSize to prevent infinite loops
    const overlap = Math.min(Math.max(opts.overlap || 64, 0), maxSize - 1);
    const chunks: string[] = [];

    if (text.length <= maxSize) {
        return [text.trim()].filter(Boolean);
    }

    let start = 0;
    while (start < text.length) {
        let end = start + maxSize;

        // Try to break at paragraph or sentence boundary
        if (end < text.length) {
            const slice = text.slice(start, end);
            const paraBreak = slice.lastIndexOf('\n\n');
            const sentBreak = slice.lastIndexOf('. ');
            const lineBreak = slice.lastIndexOf('\n');

            if (paraBreak > maxSize * 0.5) {
                end = start + paraBreak + 2;
            } else if (sentBreak > maxSize * 0.5) {
                end = start + sentBreak + 2;
            } else if (lineBreak > maxSize * 0.5) {
                end = start + lineBreak + 1;
            }
        }

        const chunk = text.slice(start, end).trim();
        if (chunk) chunks.push(chunk);

        start = end - overlap;
        if (start >= text.length) break;
    }

    return chunks;
}

// ── Atomic File Write ────────────────────────────────────────────────────────

/** Write to a temp file then rename for crash safety */
function atomicWriteSync(filePath: string, data: string): void {
    const tmpPath = path.join(os.tmpdir(), `.vec-idx-${process.pid}-${Date.now()}.tmp`);
    fs.writeFileSync(tmpPath, data, 'utf-8');
    fs.renameSync(tmpPath, filePath);
}

// ── VectorMemoryManager ──────────────────────────────────────────────────────

export class VectorMemoryManager {
    private vaultPath: string;
    private indexPath: string;
    private provider: EmbeddingProvider;
    private index: VectorIndex | null = null;

    constructor(vaultPath: string, provider: EmbeddingProvider) {
        this.vaultPath = path.resolve(vaultPath);
        this.indexPath = path.join(this.vaultPath, '.ecto', 'vector-index.json');
        this.provider = provider;
    }

    // ── Index Management ─────────────────────────────────────────────────────

    /** Load or initialize the vector index */
    private loadIndex(): VectorIndex {
        if (this.index) return this.index;

        if (fs.existsSync(this.indexPath)) {
            try {
                const raw = fs.readFileSync(this.indexPath, 'utf-8');
                const loaded = JSON.parse(raw) as VectorIndex;

                // Validate dimension compatibility — discard stale index
                if (loaded.dimensions !== this.provider.dimensions) {
                    log.warn(
                        { indexDims: loaded.dimensions, providerDims: this.provider.dimensions },
                        'Vector index dimensions mismatch, reinitializing',
                    );
                } else {
                    this.index = loaded;
                    return this.index;
                }
            } catch {
                log.warn('Corrupt vector index, reinitializing');
            }
        }

        this.index = {
            version: 1,
            dimensions: this.provider.dimensions,
            entries: [],
            lastUpdated: Date.now(),
        };
        return this.index;
    }

    /** Persist the index to disk (atomic write) */
    private saveIndex(): void {
        if (!this.index) return;
        const dir = path.dirname(this.indexPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        this.index.lastUpdated = Date.now();
        atomicWriteSync(this.indexPath, JSON.stringify(this.index));
    }

    // ── Ingestion ────────────────────────────────────────────────────────────

    /**
     * Ingest a file from the vault into the vector index.
     * Chunks the text, embeds each chunk, and stores the vectors.
     */
    async ingestFile(
        filePath: string,
        opts?: ChunkOptions & { tags?: string[] },
    ): Promise<number> {
        const fullPath = resolveVaultPath(this.vaultPath, filePath);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const content = fs.readFileSync(fullPath, 'utf-8');
        const chunks = chunkText(content, opts);
        if (chunks.length === 0) return 0;

        const index = this.loadIndex();

        // Check capacity
        if (index.entries.length + chunks.length > MAX_INDEX_ENTRIES) {
            throw new Error(
                `Index capacity exceeded: ${index.entries.length} + ${chunks.length} > ${MAX_INDEX_ENTRIES}`,
            );
        }

        // Snapshot existing entries for rollback on embed failure
        const previousEntries = index.entries.filter(e => e.file === filePath);

        // Remove existing entries for this file (re-ingest)
        index.entries = index.entries.filter(e => e.file !== filePath);

        // Embed all chunks — rollback on failure
        let vectors: number[][];
        try {
            vectors = await this.provider.embed(chunks);
        } catch (err) {
            // Rollback: restore previous entries
            index.entries.push(...previousEntries);
            throw err;
        }

        // Store entries
        for (let i = 0; i < chunks.length; i++) {
            index.entries.push({
                id: `${filePath}#${i}`,
                file: filePath,
                chunkIndex: i,
                content: chunks[i],
                vector: vectors[i],
                tags: opts?.tags || [],
                ingestedAt: Date.now(),
            });
        }

        this.saveIndex();
        log.info({ file: filePath, chunks: chunks.length }, 'file ingested into vector index');
        return chunks.length;
    }

    /**
     * Ingest raw text with a virtual file path.
     * Useful for ingesting conversation summaries, observations, etc.
     */
    async ingestText(
        virtualPath: string,
        text: string,
        opts?: ChunkOptions & { tags?: string[] },
    ): Promise<number> {
        validateVirtualPath(virtualPath);

        const chunks = chunkText(text, opts);
        if (chunks.length === 0) return 0;

        const index = this.loadIndex();

        if (index.entries.length + chunks.length > MAX_INDEX_ENTRIES) {
            throw new Error(
                `Index capacity exceeded: ${index.entries.length} + ${chunks.length} > ${MAX_INDEX_ENTRIES}`,
            );
        }

        const previousEntries = index.entries.filter(e => e.file === virtualPath);
        index.entries = index.entries.filter(e => e.file !== virtualPath);

        let vectors: number[][];
        try {
            vectors = await this.provider.embed(chunks);
        } catch (err) {
            index.entries.push(...previousEntries);
            throw err;
        }

        for (let i = 0; i < chunks.length; i++) {
            index.entries.push({
                id: `${virtualPath}#${i}`,
                file: virtualPath,
                chunkIndex: i,
                content: chunks[i],
                vector: vectors[i],
                tags: opts?.tags || [],
                ingestedAt: Date.now(),
            });
        }

        this.saveIndex();
        return chunks.length;
    }

    /**
     * Ingest all files in the vault's knowledge/ directory.
     */
    async ingestKnowledgeBase(opts?: ChunkOptions): Promise<number> {
        const knowledgeDir = path.join(this.vaultPath, 'knowledge');
        if (!fs.existsSync(knowledgeDir)) return 0;

        const files = listFilesRecursive(knowledgeDir)
            .map(f => path.relative(this.vaultPath, f))
            .filter(f => !f.endsWith('.json')); // Skip index files

        let totalChunks = 0;
        for (const file of files) {
            totalChunks += await this.ingestFile(file, { ...opts, tags: ['knowledge'] });
        }

        log.info({ files: files.length, chunks: totalChunks }, 'knowledge base ingested');
        return totalChunks;
    }

    // ── Search ───────────────────────────────────────────────────────────────

    /**
     * Semantic search — embed query and find most similar chunks.
     */
    async search(
        query: string,
        topK = 10,
        opts?: { tags?: string[]; minScore?: number },
    ): Promise<VectorSearchResult[]> {
        const index = this.loadIndex();
        if (index.entries.length === 0) return [];

        const [queryVec] = await this.provider.embed([query]);

        let candidates = index.entries;

        // Filter by tags if specified
        if (opts?.tags?.length) {
            candidates = candidates.filter(e =>
                opts.tags!.some(t => e.tags.includes(t)),
            );
        }

        // Score all candidates
        const scored = candidates.map(entry => ({
            file: entry.file,
            chunkIndex: entry.chunkIndex,
            content: entry.content,
            score: cosineSimilarity(queryVec, entry.vector),
            tags: entry.tags,
        }));

        // Filter by min score
        const minScore = opts?.minScore ?? 0.1;
        const filtered = scored.filter(s => s.score >= minScore);

        // Sort by score descending
        filtered.sort((a, b) => b.score - a.score);

        return filtered.slice(0, topK);
    }

    /**
     * Hybrid search — combines vector similarity with text search (ripgrep)
     * using Reciprocal Rank Fusion (RRF).
     */
    async hybridSearch(
        query: string,
        textResults: Array<{ file: string; content: string }>,
        topK = 10,
    ): Promise<HybridSearchResult[]> {
        const K = 60; // RRF constant

        // Get vector results
        const vectorResults = await this.search(query, topK * 2);

        // Build RRF score maps
        const scores = new Map<string, { score: number; content: string; source: Set<string> }>();

        // Score vector results
        for (let rank = 0; rank < vectorResults.length; rank++) {
            const key = `${vectorResults[rank].file}::${vectorResults[rank].content.slice(0, 100)}`;
            const existing = scores.get(key) || { score: 0, content: vectorResults[rank].content, source: new Set<string>() };
            existing.score += 1 / (K + rank + 1);
            existing.source.add('vector');
            scores.set(key, existing);
        }

        // Score text results
        for (let rank = 0; rank < textResults.length; rank++) {
            const key = `${textResults[rank].file}::${textResults[rank].content.slice(0, 100)}`;
            const existing = scores.get(key) || { score: 0, content: textResults[rank].content, source: new Set<string>() };
            existing.score += 1 / (K + rank + 1);
            existing.source.add('text');
            scores.set(key, existing);
        }

        // Merge and sort
        const results: HybridSearchResult[] = [];
        for (const [key, val] of scores) {
            const file = key.split('::')[0];
            const source = val.source.has('vector') && val.source.has('text')
                ? 'both' as const
                : val.source.has('vector') ? 'vector' as const : 'text' as const;

            results.push({
                file,
                content: val.content,
                score: val.score,
                source,
            });
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
    }

    // ── Maintenance ──────────────────────────────────────────────────────────

    /** Remove all entries for a file */
    removeFile(filePath: string): number {
        const index = this.loadIndex();
        const before = index.entries.length;
        index.entries = index.entries.filter(e => e.file !== filePath);
        this.saveIndex();
        return before - index.entries.length;
    }

    /** Get index stats */
    getStats(): { entries: number; files: number; dimensions: number; lastUpdated: number } {
        const index = this.loadIndex();
        const files = new Set(index.entries.map(e => e.file));
        return {
            entries: index.entries.length,
            files: files.size,
            dimensions: index.dimensions,
            lastUpdated: index.lastUpdated,
        };
    }

    /** Clear the entire index */
    clear(): void {
        this.index = {
            version: 1,
            dimensions: this.provider.dimensions,
            entries: [],
            lastUpdated: Date.now(),
        };
        this.saveIndex();
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function listFilesRecursive(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== '.git' && entry.name !== 'node_modules') {
                results.push(...listFilesRecursive(full));
            }
        } else {
            results.push(full);
        }
    }
    return results;
}
