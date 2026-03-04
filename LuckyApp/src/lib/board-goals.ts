/**
 * Board Goals — Project-level goals/OKRs
 *
 * Inspired by abhi1693/openclaw-mission-control BoardGoalPanel.
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
// Types
// ═══════════════════════════════════════════════════════════════

export type GoalStatus = "not_started" | "in_progress" | "completed" | "blocked";

export interface BoardGoal {
    id: string;
    orgId: string;
    projectId?: string;
    title: string;
    description?: string;
    status: GoalStatus;
    progress: number;       // 0-100
    targetDate?: string;    // YYYY-MM-DD
    keyResults: KeyResult[];
    createdAt: Date | null;
}

export interface KeyResult {
    id: string;
    title: string;
    current: number;
    target: number;
    unit?: string;         // e.g. "tasks", "%", "agents"
}

export const GOAL_STATUS_CONFIG: Record<GoalStatus, { label: string; color: string; bg: string }> = {
    not_started: { label: "Not Started", color: "text-zinc-400", bg: "bg-zinc-500/10" },
    in_progress: { label: "In Progress", color: "text-amber-400", bg: "bg-amber-500/10" },
    completed: { label: "Completed", color: "text-emerald-400", bg: "bg-emerald-500/10" },
    blocked: { label: "Blocked", color: "text-red-400", bg: "bg-red-500/10" },
};

// ═══════════════════════════════════════════════════════════════
// Firestore CRUD
// ═══════════════════════════════════════════════════════════════

const GOALS_COLLECTION = "boardGoals";

export async function createGoal(
    goal: Omit<BoardGoal, "id" | "createdAt">,
): Promise<string> {
    const ref = await addDoc(collection(db, GOALS_COLLECTION), {
        ...goal, createdAt: serverTimestamp(),
    });
    return ref.id;
}

export async function getGoals(orgId: string, projectId?: string): Promise<BoardGoal[]> {
    let q;
    if (projectId) {
        q = query(collection(db, GOALS_COLLECTION),
            where("orgId", "==", orgId), where("projectId", "==", projectId),
            orderBy("createdAt", "desc"));
    } else {
        q = query(collection(db, GOALS_COLLECTION),
            where("orgId", "==", orgId), orderBy("createdAt", "desc"));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => {
        const data = d.data();
        return {
            id: d.id, orgId: data.orgId, projectId: data.projectId,
            title: data.title, description: data.description,
            status: data.status, progress: data.progress || 0,
            targetDate: data.targetDate,
            keyResults: data.keyResults || [],
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
        } as BoardGoal;
    });
}

export async function updateGoal(id: string, updates: Partial<BoardGoal>): Promise<void> {
    const { id: _id, createdAt, ...rest } = updates;
    await updateDoc(doc(db, GOALS_COLLECTION, id), rest);
}

export async function deleteGoal(id: string): Promise<void> {
    await deleteDoc(doc(db, GOALS_COLLECTION, id));
}
