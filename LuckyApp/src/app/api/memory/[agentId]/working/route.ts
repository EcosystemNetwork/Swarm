/**
 * GET /api/memory/[agentId]/working
 *
 * Get or create WORKING.md for an agent.
 *
 * PUT /api/memory/[agentId]/working
 *
 * Update WORKING.md content.
 * Body: { content, section? }
 */

import { NextRequest } from "next/server";
import { getMemoryEntries, addMemoryEntry } from "@/lib/memory";
import {
  getTemplateForSubtype,
  updateWorkingMdSection,
  updateTimestamp,
} from "@/lib/memory-templates";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  try {
    // Find WORKING.md memory
    const memories = await getMemoryEntries(orgId, agentId, "workspace");
    const workingMd = memories.find((m) => m.subtype === "working_md");

    if (workingMd) {
      return Response.json({
        ok: true,
        content: workingMd.content,
        id: workingMd.id,
        updatedAt: workingMd.updatedAt,
      });
    }

    // Create WORKING.md if it doesn't exist
    const agentName = searchParams.get("agentName") || agentId;
    const template = getTemplateForSubtype("working_md", agentName);

    const id = await addMemoryEntry({
      orgId,
      agentId,
      agentName,
      type: "workspace",
      title: "WORKING.md",
      content: template,
      subtype: "working_md",
      structuredData: { template: "working_md" },
    });

    return Response.json({
      ok: true,
      content: template,
      id,
      created: true,
    });
  } catch (err) {
    console.error("Get WORKING.md error:", err);
    return Response.json(
      { error: "Failed to get WORKING.md" },
      { status: 500 }
    );
  }
}

export async function PUT(
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

  const { orgId, content, section, memoryId } = body;

  if (!orgId || !content) {
    return Response.json(
      { error: "orgId and content are required" },
      { status: 400 }
    );
  }

  try {
    let newContent = content as string;

    // If updating a specific section
    if (section && typeof section === "string") {
      const memories = await getMemoryEntries(orgId as string, agentId, "workspace");
      const workingMd = memories.find((m) => m.subtype === "working_md");

      if (workingMd) {
        newContent = updateWorkingMdSection(
          workingMd.content,
          section as any,
          content as string
        );
      }
    }

    // Update timestamp
    newContent = updateTimestamp(newContent);

    // Update in Firestore
    if (memoryId) {
      await setDoc(
        doc(db, "agentMemories", memoryId as string),
        {
          content: newContent,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    return Response.json({
      ok: true,
      content: newContent,
    });
  } catch (err) {
    console.error("Update WORKING.md error:", err);
    return Response.json(
      { error: "Failed to update WORKING.md" },
      { status: 500 }
    );
  }
}
