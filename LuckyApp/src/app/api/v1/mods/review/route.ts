/**
 * /api/v1/mods/review
 *
 * Admin review endpoint for community submissions and agent packages.
 * Approves or rejects pending marketplace items.
 *
 * GET  ?status=pending&collection=community|agents
 * POST { itemId, action: "approve" | "reject", collection?: "community" | "agents", reviewComment? }
 *
 * Auth: Platform admin only
 */
import { NextRequest } from "next/server";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { requirePlatformAdmin, unauthorized } from "@/lib/auth-guard";

const COLLECTIONS = {
    community: "communityMarketItems",
    agents: "marketplaceAgents",
} as const;

type CollectionKey = keyof typeof COLLECTIONS;

function resolveCollection(value: string | null): CollectionKey {
    if (value === "agents") return "agents";
    return "community";
}

/** Pending status field differs: community uses "pending", agents use "review" */
function pendingStatus(col: CollectionKey): string {
    return col === "agents" ? "review" : "pending";
}

/**
 * GET /api/v1/mods/review — List pending submissions
 */
export async function GET(req: NextRequest) {
    const admin = requirePlatformAdmin(req);
    if (!admin.ok) return unauthorized(admin.error);

    const { getDocs, query, collection, where } = await import("firebase/firestore");

    const col = resolveCollection(req.nextUrl.searchParams.get("collection"));
    const status = req.nextUrl.searchParams.get("status") || pendingStatus(col);

    const q = query(
        collection(db, COLLECTIONS[col]),
        where("status", "==", status),
    );
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return Response.json({ collection: col, count: items.length, items });
}

/**
 * POST /api/v1/mods/review — Approve or reject a submission
 */
export async function POST(req: NextRequest) {
    const admin = requirePlatformAdmin(req);
    if (!admin.ok) return unauthorized(admin.error);

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const itemId = body.itemId as string | undefined;
    const action = body.action as string | undefined;
    const reviewComment = (body.reviewComment as string) || "";
    const col = resolveCollection((body.collection as string) || null);

    if (!itemId || !action) {
        return Response.json(
            { error: "itemId and action are required" },
            { status: 400 },
        );
    }

    if (action !== "approve" && action !== "reject") {
        return Response.json(
            { error: 'action must be "approve" or "reject"' },
            { status: 400 },
        );
    }

    const ref = doc(db, COLLECTIONS[col], itemId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
        return Response.json({ error: "Submission not found" }, { status: 404 });
    }

    const current = snap.data();
    const expectedPending = pendingStatus(col);
    if (current.status !== expectedPending) {
        return Response.json(
            { error: `Submission already ${current.status}` },
            { status: 409 },
        );
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    await updateDoc(ref, {
        status: newStatus,
        reviewedAt: serverTimestamp(),
        reviewComment,
    });

    return Response.json({
        reviewed: true,
        collection: col,
        itemId,
        status: newStatus,
        reviewComment: reviewComment || undefined,
    });
}
