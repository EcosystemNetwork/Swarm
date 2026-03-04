/**
 * Gateway Management — Connect and manage remote execution gateways
 *
 * Inspired by abhi1693/openclaw-mission-control gateways component.
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
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type GatewayStatus = "connected" | "disconnected" | "error";

export interface Gateway {
    id: string;
    orgId: string;
    name: string;
    url: string;
    status: GatewayStatus;
    apiKey?: string;
    agentsConnected: number;
    lastPing: Date | null;
    createdAt: Date | null;
}

export const GATEWAY_STATUS: Record<GatewayStatus, { label: string; color: string; dot: string }> = {
    connected: { label: "Connected", color: "text-emerald-400", dot: "bg-emerald-400" },
    disconnected: { label: "Disconnected", color: "text-zinc-400", dot: "bg-zinc-400" },
    error: { label: "Error", color: "text-red-400", dot: "bg-red-400" },
};

// ═══════════════════════════════════════════════════════════════
// Firestore CRUD
// ═══════════════════════════════════════════════════════════════

const GATEWAY_COLLECTION = "gateways";

export async function addGateway(
    gateway: Omit<Gateway, "id" | "createdAt" | "lastPing">,
): Promise<string> {
    const ref = await addDoc(collection(db, GATEWAY_COLLECTION), {
        ...gateway, lastPing: serverTimestamp(), createdAt: serverTimestamp(),
    });
    return ref.id;
}

export async function getGateways(orgId: string): Promise<Gateway[]> {
    const q = query(collection(db, GATEWAY_COLLECTION), where("orgId", "==", orgId));
    const snap = await getDocs(q);
    return snap.docs.map(d => {
        const data = d.data();
        return {
            id: d.id, orgId: data.orgId, name: data.name, url: data.url,
            status: data.status || "disconnected", apiKey: data.apiKey,
            agentsConnected: data.agentsConnected || 0,
            lastPing: data.lastPing instanceof Timestamp ? data.lastPing.toDate() : null,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
        } as Gateway;
    });
}

export async function updateGateway(id: string, updates: Partial<Gateway>): Promise<void> {
    const { id: _id, createdAt, ...rest } = updates;
    await updateDoc(doc(db, GATEWAY_COLLECTION, id), rest);
}

export async function deleteGateway(id: string): Promise<void> {
    await deleteDoc(doc(db, GATEWAY_COLLECTION, id));
}
