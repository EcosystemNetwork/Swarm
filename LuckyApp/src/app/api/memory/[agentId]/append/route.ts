/**
 * POST /api/memory/[agentId]/append
 *
 * Append entry to MEMORY.md.
 * Body: { orgId, entry, section? }
 */

import { NextRequest } from "next/server";
import { getMemoryEntries, addMemoryEntry } from "@/lib/memory";
import {
  getTemplateForSubtype,
  appendToMemoryMd,
  updateTimestamp,
} from "@/lib/memory-templates";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orgId, entry, section } = body;

  if (!orgId || !entry) {
    return Response.json(
      { error: "orgId and entry are required" },
      { status: 400 }
    );
  }

  try {
    // Find MEMORY.md
    const memories = await getMemoryEntries(orgId as string, agentId, "long_term");
    let memoryMd = memories.find((m) => m.subtype === "memory_md");

    let content: string;
    let memoryId: string;

    if (memoryMd) {
      // Append to existing MEMORY.md
      content = appendToMemoryMd(
        memoryMd.content,
        entry as string,
        section as string | undefined
      );
      content = updateTimestamp(content);
      memoryId = memoryMd.id;

      // Update in Firestore
      await setDoc(
        doc(db, "agentMemories", memoryId),
        {
          content,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      // Create MEMORY.md
      const agentName = body.agentName as string | undefined || agentId;
      content = getTemplateForSubtype("memory_md", agentName);
      content = appendToMemoryMd(content, entry as string, section as string | undefined);

      memoryId = await addMemoryEntry({
        orgId: orgId as string,
        agentId,
        agentName,
        type: "long_term",
        title: "MEMORY.md",
        content,
        subtype: "memory_md",
        structuredData: { template: "memory_md" },
      });
    }

    return Response.json({
      ok: true,
      memoryId,
      appended: true,
    });
  } catch (err) {
    console.error("Append to MEMORY.md error:", err);
    return Response.json(
      { error: "Failed to append to MEMORY.md" },
      { status: 500 }
    );
  }
}
