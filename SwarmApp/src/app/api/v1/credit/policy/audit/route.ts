/**
 * GET /api/v1/credit/policy/audit?agentId=xxx&limit=50
 *
 * Query recent policy enforcement events for an agent.
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, limit as firestoreLimit, getDocs } from "firebase/firestore";

export async function GET(req: NextRequest) {
    const agentId = req.nextUrl.searchParams.get("agentId");
    if (!agentId) {
        return Response.json({ error: "agentId query parameter is required" }, { status: 400 });
    }

    const limitParam = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
    const cap = Math.min(Math.max(limitParam, 1), 200);

    try {
        const q = query(
            collection(db, "creditPolicyLog"),
            where("agentId", "==", agentId),
            orderBy("timestamp", "desc"),
            firestoreLimit(cap),
        );

        const snap = await getDocs(q);
        const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        return Response.json({ agentId, count: events.length, events });
    } catch (error) {
        console.error("Policy audit query error:", error);
        return Response.json(
            { error: "Failed to query policy audit log" },
            { status: 500 },
        );
    }
}
