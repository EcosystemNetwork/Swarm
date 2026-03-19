/**
 * GET /api/tasks/[id]/blockers
 *
 * Get all tasks that are blocking this task.
 */

import { NextRequest } from "next/server";
import { doc, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Get the task
    const taskDoc = await getDoc(doc(db, "kanbanTasks", id));
    if (!taskDoc.exists()) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    const taskData = taskDoc.data();
    const blockedBy = taskData.blockedBy || [];

    if (blockedBy.length === 0) {
      return Response.json({
        ok: true,
        blockers: [],
        count: 0,
        isBlocked: false,
      });
    }

    // Fetch all blocker tasks
    const blockerDocs = await Promise.all(
      blockedBy.map((blockerId: string) => getDoc(doc(db, "kanbanTasks", blockerId)))
    );

    const blockers = blockerDocs
      .filter((d) => d.exists())
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }));

    return Response.json({
      ok: true,
      blockers,
      count: blockers.length,
      isBlocked: blockers.length > 0,
      blockReason: taskData.blockReason || null,
    });
  } catch (err) {
    console.error("Get blockers error:", err);
    return Response.json(
      { error: "Failed to get blockers" },
      { status: 500 }
    );
  }
}
