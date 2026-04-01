/**
 * Storacha Agent Coordination — Multi-agent data sharing via CIDs
 *
 * Enables agents to coordinate by sharing content-addressed artifacts through Storacha.
 * Each coordination task gets a "coordination space" where multiple agents can contribute
 * outputs, share intermediate results, and build on each other's work — all verified
 * via CIDs for data integrity.
 *
 * Key patterns:
 *   - Coordination Spaces: Group agents around a task with shared CID-linked data
 *   - Agent Contributions: Track which agent produced which CID
 *   - CID Chains: Link sequential outputs (agent A produces CID₁ → agent B reads CID₁, produces CID₂)
 *   - Verifiable Outputs: On-chain CID references for provable agent work (Flow + Filecoin)
 *
 * Hackathon: PL Genesis — Storacha ($500), Filecoin Foundation ($2,500)
 */

import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    query,
    where,
    orderBy,
    limit as firestoreLimit,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface CoordinationSpace {
    id: string;
    orgId: string;
    /** Human-readable task name */
    name: string;
    description: string;
    /** Which agents are participating */
    agentIds: string[];
    /** Current status */
    status: "active" | "completed" | "cancelled";
    /** Total contributions across all agents */
    contributionCount: number;
    /** Total bytes stored across all contributions */
    totalBytes: number;
    /** Optional deadline */
    deadline: Date | null;
    /** Tags for filtering */
    tags: string[];
    createdBy: string;
    createdAt: Date | null;
    completedAt: Date | null;
}

export interface AgentContribution {
    id: string;
    orgId: string;
    /** Reference to the coordination space */
    spaceId: string;
    /** Which agent produced this */
    agentId: string;
    /** CID of the stored content */
    cid: string;
    /** Content type: intermediate result, final output, data source */
    contributionType: "source_data" | "intermediate" | "final_output" | "review" | "metadata";
    /** Human-readable description of what this is */
    description: string;
    /** Size in bytes */
    sizeBytes: number;
    /** MIME type */
    mimeType: string;
    /** Optional parent CID — for building CID chains (this output was derived from parent) */
    parentCid: string | null;
    /** Optional Flow/Filecoin on-chain reference */
    onChainRef: {
        network: "flow" | "filecoin";
        txHash: string;
        contractAddress?: string;
    } | null;
    /** Retrieval URL */
    gatewayUrl: string;
    createdAt: Date | null;
}

export interface CidChainEntry {
    cid: string;
    agentId: string;
    description: string;
    contributionType: string;
    parentCid: string | null;
    depth: number;
    createdAt: Date | null;
}

// ═══════════════════════════════════════════════════════════════
// Collection Names
// ═══════════════════════════════════════════════════════════════

const COLLECTIONS = {
    spaces: "coordinationSpaces",
    contributions: "agentContributions",
} as const;

// ═══════════════════════════════════════════════════════════════
// Coordination Space CRUD
// ═══════════════════════════════════════════════════════════════

export async function createCoordinationSpace(
    input: Omit<CoordinationSpace, "id" | "contributionCount" | "totalBytes" | "createdAt" | "completedAt">,
): Promise<CoordinationSpace> {
    const ref = await addDoc(collection(db, COLLECTIONS.spaces), {
        ...input,
        contributionCount: 0,
        totalBytes: 0,
        createdAt: serverTimestamp(),
        completedAt: null,
    });
    return {
        ...input,
        id: ref.id,
        contributionCount: 0,
        totalBytes: 0,
        createdAt: new Date(),
        completedAt: null,
    };
}

export async function getCoordinationSpace(id: string): Promise<CoordinationSpace | null> {
    const snap = await getDoc(doc(db, COLLECTIONS.spaces, id));
    if (!snap.exists()) return null;
    return docToSpace(snap.id, snap.data());
}

export async function getCoordinationSpaces(
    orgId: string,
    statusFilter?: "active" | "completed" | "cancelled",
): Promise<CoordinationSpace[]> {
    const constraints = [
        where("orgId", "==", orgId),
        orderBy("createdAt", "desc"),
    ];
    if (statusFilter) {
        constraints.splice(1, 0, where("status", "==", statusFilter));
    }
    const q = query(collection(db, COLLECTIONS.spaces), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToSpace(d.id, d.data()));
}

export async function completeCoordinationSpace(id: string): Promise<void> {
    await updateDoc(doc(db, COLLECTIONS.spaces, id), {
        status: "completed",
        completedAt: serverTimestamp(),
    });
}

export async function cancelCoordinationSpace(id: string): Promise<void> {
    await updateDoc(doc(db, COLLECTIONS.spaces, id), {
        status: "cancelled",
        completedAt: serverTimestamp(),
    });
}

export async function addAgentToSpace(spaceId: string, agentId: string): Promise<void> {
    const space = await getCoordinationSpace(spaceId);
    if (!space) return;
    if (space.agentIds.includes(agentId)) return;
    await updateDoc(doc(db, COLLECTIONS.spaces, spaceId), {
        agentIds: [...space.agentIds, agentId],
    });
}

// ═══════════════════════════════════════════════════════════════
// Agent Contribution CRUD
// ═══════════════════════════════════════════════════════════════

export async function addContribution(
    input: Omit<AgentContribution, "id" | "createdAt">,
): Promise<AgentContribution> {
    const ref = await addDoc(collection(db, COLLECTIONS.contributions), {
        ...input,
        createdAt: serverTimestamp(),
    });

    // Update space counters
    const space = await getCoordinationSpace(input.spaceId);
    if (space) {
        await updateDoc(doc(db, COLLECTIONS.spaces, input.spaceId), {
            contributionCount: space.contributionCount + 1,
            totalBytes: space.totalBytes + input.sizeBytes,
        });
        // Auto-add agent to space if not already present
        if (!space.agentIds.includes(input.agentId)) {
            await addAgentToSpace(input.spaceId, input.agentId);
        }
    }

    return { ...input, id: ref.id, createdAt: new Date() };
}

export async function getContributions(
    spaceId: string,
    agentFilter?: string,
): Promise<AgentContribution[]> {
    const constraints = [
        where("spaceId", "==", spaceId),
        orderBy("createdAt", "asc"),
    ];
    if (agentFilter) {
        constraints.splice(1, 0, where("agentId", "==", agentFilter));
    }
    const q = query(collection(db, COLLECTIONS.contributions), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToContribution(d.id, d.data()));
}

export async function getContributionsByCid(cid: string): Promise<AgentContribution[]> {
    const q = query(
        collection(db, COLLECTIONS.contributions),
        where("cid", "==", cid),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToContribution(d.id, d.data()));
}

/**
 * Build a CID chain — trace the lineage of a CID back to its root source.
 * Follows parentCid links to construct the derivation tree.
 */
export async function buildCidChain(
    spaceId: string,
    leafCid: string,
): Promise<CidChainEntry[]> {
    const allContributions = await getContributions(spaceId);
    const byCid = new Map<string, AgentContribution>();
    for (const c of allContributions) {
        byCid.set(c.cid, c);
    }

    const chain: CidChainEntry[] = [];
    let currentCid: string | null = leafCid;
    let depth = 0;
    const visited = new Set<string>();

    while (currentCid && !visited.has(currentCid)) {
        visited.add(currentCid);
        const contrib = byCid.get(currentCid);
        if (!contrib) break;

        chain.unshift({
            cid: contrib.cid,
            agentId: contrib.agentId,
            description: contrib.description,
            contributionType: contrib.contributionType,
            parentCid: contrib.parentCid,
            depth,
            createdAt: contrib.createdAt,
        });

        currentCid = contrib.parentCid;
        depth++;
    }

    // Re-number depths from root
    chain.forEach((entry, i) => { entry.depth = i; });
    return chain;
}

/**
 * Get coordination stats for an org — used by the Storacha dashboard.
 */
export async function getCoordinationStats(orgId: string): Promise<{
    activeSpaces: number;
    totalContributions: number;
    totalAgents: number;
    totalBytes: number;
}> {
    const spaces = await getCoordinationSpaces(orgId);
    const activeSpaces = spaces.filter((s) => s.status === "active").length;
    const totalContributions = spaces.reduce((s, sp) => s + sp.contributionCount, 0);
    const uniqueAgents = new Set(spaces.flatMap((s) => s.agentIds));
    const totalBytes = spaces.reduce((s, sp) => s + sp.totalBytes, 0);

    return {
        activeSpaces,
        totalContributions,
        totalAgents: uniqueAgents.size,
        totalBytes,
    };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function docToSpace(id: string, d: Record<string, unknown>): CoordinationSpace {
    return {
        id,
        orgId: (d.orgId as string) || "",
        name: (d.name as string) || "",
        description: (d.description as string) || "",
        agentIds: (d.agentIds as string[]) || [],
        status: (d.status as CoordinationSpace["status"]) || "active",
        contributionCount: (d.contributionCount as number) || 0,
        totalBytes: (d.totalBytes as number) || 0,
        deadline: d.deadline instanceof Timestamp ? d.deadline.toDate() : null,
        tags: (d.tags as string[]) || [],
        createdBy: (d.createdBy as string) || "",
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
        completedAt: d.completedAt instanceof Timestamp ? d.completedAt.toDate() : null,
    };
}

function docToContribution(id: string, d: Record<string, unknown>): AgentContribution {
    return {
        id,
        orgId: (d.orgId as string) || "",
        spaceId: (d.spaceId as string) || "",
        agentId: (d.agentId as string) || "",
        cid: (d.cid as string) || "",
        contributionType: (d.contributionType as AgentContribution["contributionType"]) || "intermediate",
        description: (d.description as string) || "",
        sizeBytes: (d.sizeBytes as number) || 0,
        mimeType: (d.mimeType as string) || "application/octet-stream",
        parentCid: (d.parentCid as string) || null,
        onChainRef: (d.onChainRef as AgentContribution["onChainRef"]) || null,
        gatewayUrl: (d.gatewayUrl as string) || "",
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
    };
}
