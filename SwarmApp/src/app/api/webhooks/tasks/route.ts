/**
 * GET  /api/webhooks/tasks?agentId=X&apiKey=Y          — list tasks assigned to agent
 * PATCH /api/webhooks/tasks?agentId=X&apiKey=Y&taskId=Z — update task status
 *
 * Body for PATCH: { status: "todo" | "in_progress" | "done" }
 */
import { NextRequest } from "next/server";
import { authenticateAgent, unauthorized } from "../auth";
import { db } from "@/lib/firebase";
import {
    collection,
    doc,
    getDocs,
    updateDoc,
    query,
    where,
    serverTimestamp,
} from "firebase/firestore";

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const agentId = searchParams.get("agentId");
    const apiKey = searchParams.get("apiKey");

    const agent = await authenticateAgent(agentId, apiKey);
    if (!agent) return unauthorized();

    try {
        const q = query(
            collection(db, "tasks"),
            where("assignedTo", "==", agent.agentId)
        );
        const snap = await getDocs(q);

        const tasks = snap.docs.map((d) => {
            const t = d.data();
            return {
                id: d.id,
                title: t.title || "(untitled)",
                description: t.description || "",
                status: t.status || "todo",
                priority: t.priority || "medium",
                projectId: t.projectId || "",
                createdAt: t.createdAt?.toMillis?.() || 0,
            };
        });

        return Response.json({ tasks, count: tasks.length });
    } catch (err) {
        console.error("Webhook tasks GET error:", err);
        return Response.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function PATCH(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const agentId = searchParams.get("agentId");
    const apiKey = searchParams.get("apiKey");
    const taskId = searchParams.get("taskId");

    if (!taskId) {
        return Response.json(
            { error: "taskId query parameter is required" },
            { status: 400 }
        );
    }

    const agent = await authenticateAgent(agentId, apiKey);
    if (!agent) return unauthorized();

    let body: Record<string, string>;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { status } = body;
    const validStatuses = ["todo", "in_progress", "done"];
    if (!status || !validStatuses.includes(status)) {
        return Response.json(
            { error: `status must be one of: ${validStatuses.join(", ")}` },
            { status: 400 }
        );
    }

    try {
        const updateData: Record<string, unknown> = {
            status,
            updatedAt: serverTimestamp(),
        };
        if (status === "done") {
            updateData.completedAt = serverTimestamp();
        }

        await updateDoc(doc(db, "tasks", taskId), updateData);

        return Response.json({
            ok: true,
            taskId,
            status,
            updatedAt: Date.now(),
        });
    } catch (err) {
        console.error("Webhook tasks PATCH error:", err);
        return Response.json(
            { error: "Failed to update task" },
            { status: 500 }
        );
    }
}
