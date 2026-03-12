/**
 * POST /api/tasks/[id]/unblock
 *
 * Unblock a task (remove all blockers).
 */

import { NextRequest } from "next/server";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await setDoc(
      doc(db, "kanbanTasks", id),
      {
        blockedBy: [],
        blockReason: "",
        blockedAt: null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return Response.json({
      ok: true,
      message: `Task ${id} has been unblocked`,
    });
  } catch (err) {
    console.error("Unblock task error:", err);
    return Response.json(
      { error: "Failed to unblock task" },
      { status: 500 }
    );
  }
}
