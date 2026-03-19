/**
 * Chainlink Service — Client helpers for live price feeds + Firestore workflow CRUD.
 */
import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ═══════════════════════════════════════════════════════════════
// Price Feed Types & Fetchers
// ═══════════════════════════════════════════════════════════════

export interface PriceFeedResult {
    pair: string;
    price: number;
    decimals: number;
    roundId: string;
    updatedAt: string;
    network: string;
    status: "success" | "error";
    error?: string;
}

/** Fetch specific pairs on a specific network */
export async function fetchLivePrices(
    pairs: string[],
    network?: string,
): Promise<PriceFeedResult[]> {
    const params = new URLSearchParams();
    params.set("pairs", pairs.join(","));
    if (network) params.set("network", network);

    const resp = await fetch(`/api/chainlink/prices?${params}`);
    if (!resp.ok) throw new Error(`Price API error: ${resp.status}`);
    const json = await resp.json();
    return json.prices as PriceFeedResult[];
}

/** Fetch all configured price feeds across all networks */
export async function fetchAllPrices(): Promise<PriceFeedResult[]> {
    const resp = await fetch("/api/chainlink/prices");
    if (!resp.ok) throw new Error(`Price API error: ${resp.status}`);
    const json = await resp.json();
    return json.prices as PriceFeedResult[];
}

// ═══════════════════════════════════════════════════════════════
// Workflow Types & CRUD
// ═══════════════════════════════════════════════════════════════

export type WorkflowType = "Functions" | "Automation" | "VRF" | "CCIP";
export type WorkflowStatus = "active" | "paused" | "draft";

export interface ChainlinkWorkflow {
    id: string;
    orgId: string;
    name: string;
    description: string;
    type: WorkflowType;
    status: WorkflowStatus;
    trigger: string;
    createdBy: string;
    createdAt: Date | null;
    updatedAt: Date | null;
}

const WORKFLOW_COLLECTION = "chainlinkWorkflows";

export async function createWorkflow(
    orgId: string,
    data: { name: string; description: string; type: WorkflowType; trigger: string },
    createdBy: string,
): Promise<string> {
    const ref = await addDoc(collection(db, WORKFLOW_COLLECTION), {
        orgId,
        name: data.name,
        description: data.description,
        type: data.type,
        status: "draft" as WorkflowStatus,
        trigger: data.trigger,
        createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return ref.id;
}

export async function getWorkflows(orgId: string): Promise<ChainlinkWorkflow[]> {
    const q = query(
        collection(db, WORKFLOW_COLLECTION),
        where("orgId", "==", orgId),
        orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            orgId: data.orgId,
            name: data.name,
            description: data.description ?? "",
            type: data.type,
            status: data.status,
            trigger: data.trigger ?? "",
            createdBy: data.createdBy,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
        };
    });
}

export async function updateWorkflow(
    id: string,
    data: Partial<Pick<ChainlinkWorkflow, "name" | "description" | "type" | "trigger" | "status">>,
): Promise<void> {
    await updateDoc(doc(db, WORKFLOW_COLLECTION, id), {
        ...data,
        updatedAt: serverTimestamp(),
    });
}

export async function deleteWorkflow(id: string): Promise<void> {
    await deleteDoc(doc(db, WORKFLOW_COLLECTION, id));
}

export async function toggleWorkflowStatus(
    id: string,
    status: "active" | "paused",
): Promise<void> {
    await updateWorkflow(id, { status });
}
