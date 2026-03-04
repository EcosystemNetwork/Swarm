/**
 * Kanban Board — Types + Firestore CRUD
 *
 * 5-column task board inspired by ClawDeck:
 * Inbox → Up Next → In Progress → In Review → Done
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

export type KanbanStatus = "inbox" | "up_next" | "in_progress" | "in_review" | "done";
export type KanbanPriority = "none" | "low" | "medium" | "high";

export const KANBAN_COLUMNS: { key: KanbanStatus; label: string; color: string; icon: string }[] = [
    { key: "inbox", label: "Inbox", color: "border-zinc-500/30", icon: "📥" },
    { key: "up_next", label: "Up Next", color: "border-blue-500/30", icon: "📋" },
    { key: "in_progress", label: "In Progress", color: "border-amber-500/30", icon: "⚡" },
    { key: "in_review", label: "In Review", color: "border-purple-500/30", icon: "🔍" },
    { key: "done", label: "Done", color: "border-emerald-500/30", icon: "✅" },
];

export const PRIORITY_CONFIG: Record<KanbanPriority, { label: string; color: string; dot: string }> = {
    none: { label: "None", color: "text-muted-foreground", dot: "bg-zinc-400" },
    low: { label: "Low", color: "text-blue-400", dot: "bg-blue-400" },
    medium: { label: "Medium", color: "text-amber-400", dot: "bg-amber-400" },
    high: { label: "High", color: "text-red-400", dot: "bg-red-400" },
};

export interface SubTask {
    id: string;
    title: string;
    completed: boolean;
}

export interface KanbanTask {
    id: string;
    orgId: string;
    projectId?: string;
    title: string;
    description?: string;
    status: KanbanStatus;
    priority: KanbanPriority;
    assignee?: string;
    assigneeName?: string;
    subtasks: SubTask[];
    dueDate?: string;
    position: number;
    createdAt: Date | null;
    updatedAt: Date | null;
}

export interface KanbanTaskInput {
    orgId: string;
    projectId?: string;
    title: string;
    description?: string;
    status?: KanbanStatus;
    priority?: KanbanPriority;
    assignee?: string;
    assigneeName?: string;
    subtasks?: SubTask[];
    dueDate?: string;
}

// ═══════════════════════════════════════════════════════════════
// Firestore CRUD
// ═══════════════════════════════════════════════════════════════

const KANBAN_COLLECTION = "kanbanTasks";

export async function createKanbanTask(input: KanbanTaskInput): Promise<string> {
    // Get max position in the target column
    const q = query(
        collection(db, KANBAN_COLLECTION),
        where("orgId", "==", input.orgId),
        where("status", "==", input.status || "inbox"),
    );
    const snap = await getDocs(q);
    const maxPos = snap.docs.reduce((max, d) => Math.max(max, d.data().position || 0), 0);

    const ref = await addDoc(collection(db, KANBAN_COLLECTION), {
        ...input,
        status: input.status || "inbox",
        priority: input.priority || "none",
        subtasks: input.subtasks || [],
        position: maxPos + 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return ref.id;
}

export async function updateKanbanTask(id: string, updates: Partial<KanbanTask>): Promise<void> {
    const ref = doc(db, KANBAN_COLLECTION, id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt, ...rest } = updates;
    await updateDoc(ref, { ...rest, updatedAt: serverTimestamp() });
}

export async function moveTask(id: string, newStatus: KanbanStatus, newPosition: number): Promise<void> {
    const ref = doc(db, KANBAN_COLLECTION, id);
    await updateDoc(ref, { status: newStatus, position: newPosition, updatedAt: serverTimestamp() });
}

export async function deleteKanbanTask(id: string): Promise<void> {
    await deleteDoc(doc(db, KANBAN_COLLECTION, id));
}

export async function getKanbanTasks(orgId: string): Promise<KanbanTask[]> {
    const q = query(
        collection(db, KANBAN_COLLECTION),
        where("orgId", "==", orgId),
        orderBy("position", "asc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            orgId: data.orgId,
            projectId: data.projectId,
            title: data.title,
            description: data.description,
            status: data.status,
            priority: data.priority,
            assignee: data.assignee,
            assigneeName: data.assigneeName,
            subtasks: data.subtasks || [],
            dueDate: data.dueDate,
            position: data.position,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
        } as KanbanTask;
    });
}

/** Group tasks by column status */
export function groupByStatus(tasks: KanbanTask[]): Record<KanbanStatus, KanbanTask[]> {
    const groups: Record<KanbanStatus, KanbanTask[]> = {
        inbox: [], up_next: [], in_progress: [], in_review: [], done: [],
    };
    for (const task of tasks) {
        groups[task.status]?.push(task);
    }
    // Sort each column by position
    for (const key of Object.keys(groups) as KanbanStatus[]) {
        groups[key].sort((a, b) => a.position - b.position);
    }
    return groups;
}
