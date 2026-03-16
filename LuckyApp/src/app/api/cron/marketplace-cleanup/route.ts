/**
 * POST /api/cron/marketplace-cleanup
 *
 * Periodic cleanup job for the marketplace:
 * 1. Dead products: 0 installs after 90 days → unlisted
 * 2. Quality check: <2★ avg with 50+ ratings → suspended for re-review
 * 3. Tier recalculation: auto-upgrade publisher tiers
 *
 * Auth: Platform admin or internal service secret
 * Trigger: Vercel cron (daily) or manual
 */
import { NextRequest } from "next/server";
import { getDocs, query, collection, where, updateDoc, doc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { requirePlatformAdmin, requireInternalService } from "@/lib/auth-guard";
import { updatePublisherStats } from "@/lib/submission-protocol";

const DEAD_PRODUCT_DAYS = 90;
const LOW_QUALITY_RATING = 2.0;
const MIN_RATINGS_FOR_QUALITY_CHECK = 50;

export async function POST(req: NextRequest) {
    // Auth: platform admin or internal service
    const admin = requirePlatformAdmin(req);
    const service = requireInternalService(req);
    if (!admin.ok && !service.ok) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results = {
        deadProductsUnlisted: 0,
        lowQualitySuspended: 0,
        tiersRecalculated: 0,
    };

    try {
        // 1. Dead product cleanup — approved items with 0 installs older than 90 days
        const cutoff = Timestamp.fromMillis(Date.now() - DEAD_PRODUCT_DAYS * 24 * 60 * 60 * 1000);
        const approvedSnap = await getDocs(
            query(collection(db, "communityMarketItems"), where("status", "==", "approved")),
        );

        for (const d of approvedSnap.docs) {
            const data = d.data();
            const lastActive = data.lastActiveAt as Timestamp | undefined;
            const installs = data.installCount || 0;
            const pubStatus = data.publicationStatus;

            if (
                installs === 0 &&
                pubStatus !== "unlisted" &&
                pubStatus !== "suspended" &&
                lastActive &&
                lastActive.toMillis() < cutoff.toMillis()
            ) {
                await updateDoc(doc(db, "communityMarketItems", d.id), {
                    publicationStatus: "unlisted",
                });
                results.deadProductsUnlisted++;
            }
        }

        // 2. Quality check — approved agents with low ratings
        const agentSnap = await getDocs(
            query(collection(db, "marketplaceAgents"), where("status", "==", "approved")),
        );

        for (const d of agentSnap.docs) {
            const data = d.data();
            const avgRating = data.avgRating || 0;
            const ratingCount = data.ratingCount || 0;

            if (
                ratingCount >= MIN_RATINGS_FOR_QUALITY_CHECK &&
                avgRating < LOW_QUALITY_RATING &&
                data.publicationStatus !== "suspended"
            ) {
                await updateDoc(doc(db, "marketplaceAgents", d.id), {
                    publicationStatus: "suspended",
                    stage: "product_review",
                });
                results.lowQualitySuspended++;
            }
        }

        // 3. Tier recalculation — unique publishers with recent submissions
        const publishers = new Set<string>();
        approvedSnap.forEach((d) => {
            const wallet = d.data().submittedBy;
            if (wallet) publishers.add(wallet);
        });
        agentSnap.forEach((d) => {
            const wallet = d.data().authorWallet;
            if (wallet) publishers.add(wallet);
        });

        for (const wallet of publishers) {
            try {
                await updatePublisherStats(wallet);
                results.tiersRecalculated++;
            } catch {
                // Skip individual failures
            }
        }

        return Response.json({
            success: true,
            ...results,
            publishersProcessed: publishers.size,
        });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Cleanup failed" },
            { status: 500 },
        );
    }
}
