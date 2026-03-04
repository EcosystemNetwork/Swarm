/**
 * Board Groups — Group multiple boards under a category
 *
 * Inspired by abhi1693/openclaw-mission-control board-groups component.
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

export interface BoardGroup {
    id: string;
    orgId: string;
    name: string;
    description?: string;
    icon?: string;
    boardIds: string[];
    position: number;
    createdAt: Date | null;
}

// ═══════════════════════════════════════════════════════════════
// Firestore CRUD
// ═══════════════════════════════════════════════════════════════

const BOARD_GROUP_COLLECTION = "boardGroups";

export async function createBoardGroup(
    orgId: string,
    name: string,
    opts?: { description?: string; icon?: string },
): Promise<string> {
    const q = query(collection(db, BOARD_GROUP_COLLECTION), where("orgId", "==", orgId));
    const snap = await getDocs(q);
    const maxPos = snap.docs.reduce((m, d) => Math.max(m, d.data().position || 0), 0);

    const ref = await addDoc(collection(db, BOARD_GROUP_COLLECTION), {
        orgId, name, description: opts?.description || "", icon: opts?.icon || "📁",
        boardIds: [], position: maxPos + 1, createdAt: serverTimestamp(),
    });
    return ref.id;
}

export async function getBoardGroups(orgId: string): Promise<BoardGroup[]> {
    const q = query(
        collection(db, BOARD_GROUP_COLLECTION),
        where("orgId", "==", orgId),
        orderBy("position", "asc"),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => {
        const data = d.data();
        return {
            id: d.id, orgId: data.orgId, name: data.name, description: data.description,
            icon: data.icon, boardIds: data.boardIds || [], position: data.position,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
        } as BoardGroup;
    });
}

export async function updateBoardGroup(id: string, updates: Partial<BoardGroup>): Promise<void> {
    const { id: _id, createdAt, ...rest } = updates;
    await updateDoc(doc(db, BOARD_GROUP_COLLECTION, id), rest);
}

export async function addBoardToGroup(groupId: string, boardId: string): Promise<void> {
    const { getDoc } = await import("firebase/firestore");
    const ref = doc(db, BOARD_GROUP_COLLECTION, groupId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const ids: string[] = snap.data().boardIds || [];
    if (!ids.includes(boardId)) {
        await updateDoc(ref, { boardIds: [...ids, boardId] });
    }
}

export async function deleteBoardGroup(id: string): Promise<void> {
    await deleteDoc(doc(db, BOARD_GROUP_COLLECTION, id));
}
