/**
 * POST /api/v1/mods/review
 *
 * Admin review endpoint for community mod submissions.
 * Approves or rejects pending community market items.
 *
 * Body: { itemId, action: "approve" | "reject", reviewComment? }
 * Auth: Platform admin only
 */
import { NextRequest } from "next/server";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { requirePlatformAdmin, unauthorized } from "@/lib/auth-guard";

/**
 * GET /api/v1/mods/review — List all pending community submissions
 */
export async function GET(req: NextRequest) {
    const admin = requirePlatformAdmin(req);
    if (!admin.ok) return unauthorized(admin.error);

    const { getDocs, query, collection, where } = await import("firebase/firestore");

    const status = req.nextUrl.searchParams.get("status") || "pending";

    const q = query(
        collection(db, "communityMarketItems"),
        where("status", "==", status),
    );
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return Response.json({ count: items.length, items });
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

    const ref = doc(db, "communityMarketItems", itemId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
        return Response.json({ error: "Submission not found" }, { status: 404 });
    }

    const current = snap.data();
    if (current.status !== "pending") {
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
        itemId,
        status: newStatus,
        reviewComment: reviewComment || undefined,
    });
}
