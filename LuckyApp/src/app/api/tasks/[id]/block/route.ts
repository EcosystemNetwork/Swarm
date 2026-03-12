/**
 * POST /api/tasks/[id]/block
 *
 * Block a task with dependent tasks or reason.
 * Body: { blockedBy?: string[], blockReason?: string }
 */

import { NextRequest } from "next/server";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { blockedBy, blockReason } = body;

  if (!blockedBy && !blockReason) {
    return Response.json(
      { error: "Either blockedBy or blockReason is required" },
      { status: 400 }
    );
  }

  try {
    await setDoc(
      doc(db, "kanbanTasks", id),
      {
        blockedBy: blockedBy || [],
        blockReason: blockReason || "",
        blockedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return Response.json({
      ok: true,
      message: `Task ${id} has been blocked`,
      blockedBy,
      blockReason,
    });
  } catch (err) {
    console.error("Block task error:", err);
    return Response.json(
      { error: "Failed to block task" },
      { status: 500 }
    );
  }
}
