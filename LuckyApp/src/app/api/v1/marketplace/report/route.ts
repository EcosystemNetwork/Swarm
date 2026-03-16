/**
 * POST /api/v1/marketplace/report
 *
 * Report a marketplace item for spam, malicious behavior, or quality issues.
 * Auto-suspends items after 3+ reports.
 *
 * Auth: x-wallet-address header
 */
import { NextRequest } from "next/server";
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getWalletAddress } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit-firestore";

const REPORTS_COLLECTION = "marketplaceReports";
const AUTO_SUSPEND_THRESHOLD = 3;
const VALID_REASONS = ["spam", "malicious", "broken", "inappropriate"] as const;

const COLLECTIONS = {
    community: "communityMarketItems",
    agents: "marketplaceAgents",
} as const;

export async function POST(req: NextRequest) {
    const wallet = getWalletAddress(req);
    if (!wallet) {
        return Response.json({ error: "Missing x-wallet-address header" }, { status: 401 });
    }

    // Rate limit: 5 reports/day per wallet
    const rateCheck = await checkRateLimit(`report:${wallet}`, { max: 5, windowMs: 24 * 60 * 60 * 1000 });
    if (!rateCheck.allowed) {
        return Response.json(
            { error: "Report limit reached (5/day). Try again later." },
            { status: 429 },
        );
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const itemId = body.itemId as string | undefined;
    const reason = body.reason as string | undefined;
    const comment = (body.comment as string)?.trim().slice(0, 1000) || "";
    const collectionKey = body.collection === "agents" ? "agents" as const : "community" as const;

    if (!itemId || !reason) {
        return Response.json({ error: "itemId and reason are required" }, { status: 400 });
    }

    if (!VALID_REASONS.includes(reason as typeof VALID_REASONS[number])) {
        return Response.json(
            { error: `reason must be one of: ${VALID_REASONS.join(", ")}` },
            { status: 400 },
        );
    }

    // Verify item exists
    const collectionName = COLLECTIONS[collectionKey];
    const itemRef = doc(db, collectionName, itemId);
    const itemSnap = await getDoc(itemRef);

    if (!itemSnap.exists()) {
        return Response.json({ error: "Item not found" }, { status: 404 });
    }

    // Don't allow self-reporting
    const itemData = itemSnap.data();
    const ownerField = collectionKey === "agents" ? "authorWallet" : "submittedBy";
    if (itemData[ownerField]?.toLowerCase() === wallet) {
        return Response.json({ error: "Cannot report your own item" }, { status: 400 });
    }

    // Create report document
    await addDoc(collection(db, REPORTS_COLLECTION), {
        itemId,
        collection: collectionKey,
        reportedBy: wallet,
        reason,
        comment,
        createdAt: serverTimestamp(),
    });

    // Increment report count on the item
    const currentReportCount = (itemData.reportCount || 0) + 1;
    const updates: Record<string, unknown> = {
        reportCount: increment(1),
    };

    // Auto-suspend if threshold reached
    let autoSuspended = false;
    if (currentReportCount >= AUTO_SUSPEND_THRESHOLD && itemData.publicationStatus !== "suspended") {
        updates.publicationStatus = "suspended";
        updates.stage = "product_review"; // Flag for re-review
        autoSuspended = true;
    }

    await updateDoc(itemRef, updates);

    return Response.json({
        reported: true,
        itemId,
        reason,
        autoSuspended,
    });
}
