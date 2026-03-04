/**
 * Cerebro — Auto-organized conversation topic tracking
 *
 * Inspired by jontsai/openclaw-command-center Cerebro Topics panel.
 */

import {
    collection,
    doc,
    addDoc,
    updateDoc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type TopicStatus = "active" | "resolved" | "parked";

export interface CerebroTopic {
    id: string;
    orgId: string;
    title: string;
    summary?: string;
    status: TopicStatus;
    threadCount: number;
    participants: string[];
    isPrivate: boolean;
    channel?: string;       // e.g. "slack", "discord", "chat"
    lastActivity: Date | null;
    createdAt: Date | null;
}

export const STATUS_CONFIG: Record<TopicStatus, { label: string; color: string; bg: string; emoji: string }> = {
    active: { label: "Active", color: "text-emerald-400", bg: "bg-emerald-500/10", emoji: "🟢" },
    resolved: { label: "Resolved", color: "text-blue-400", bg: "bg-blue-500/10", emoji: "✅" },
    parked: { label: "Parked", color: "text-zinc-400", bg: "bg-zinc-500/10", emoji: "⏸️" },
};

// ═══════════════════════════════════════════════════════════════
// Firestore CRUD
// ═══════════════════════════════════════════════════════════════

const CEREBRO_COLLECTION = "cerebroTopics";

export async function createTopic(topic: Omit<CerebroTopic, "id" | "lastActivity" | "createdAt">): Promise<string> {
    const ref = await addDoc(collection(db, CEREBRO_COLLECTION), {
        ...topic,
        lastActivity: serverTimestamp(),
        createdAt: serverTimestamp(),
    });
    return ref.id;
}

export async function getTopics(orgId: string, status?: TopicStatus): Promise<CerebroTopic[]> {
    let q;
    if (status) {
        q = query(
            collection(db, CEREBRO_COLLECTION),
            where("orgId", "==", orgId),
            where("status", "==", status),
            orderBy("lastActivity", "desc"),
        );
    } else {
        q = query(
            collection(db, CEREBRO_COLLECTION),
            where("orgId", "==", orgId),
            orderBy("lastActivity", "desc"),
        );
    }
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            orgId: data.orgId,
            title: data.title,
            summary: data.summary,
            status: data.status,
            threadCount: data.threadCount || 0,
            participants: data.participants || [],
            isPrivate: data.isPrivate || false,
            channel: data.channel,
            lastActivity: data.lastActivity instanceof Timestamp ? data.lastActivity.toDate() : null,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
        } as CerebroTopic;
    });
}

export async function updateTopicStatus(topicId: string, status: TopicStatus): Promise<void> {
    await updateDoc(doc(db, CEREBRO_COLLECTION, topicId), {
        status,
        lastActivity: serverTimestamp(),
    });
}

export async function togglePrivacy(topicId: string, isPrivate: boolean): Promise<void> {
    await updateDoc(doc(db, CEREBRO_COLLECTION, topicId), { isPrivate });
}
