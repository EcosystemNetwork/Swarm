/**
 * GET /api/v1/trust/snapshots?epoch=42  — Get snapshot by epoch
 * GET /api/v1/trust/snapshots?latest=true — Get latest snapshot
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/session";
import { getSnapshotByEpoch } from "@/lib/hedera-checkpoint-service";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import type { ScoreSnapshot } from "@/lib/hedera-trust-types";

export async function GET(req: NextRequest) {
    try {
        const session = await validateSession();
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const epochStr = searchParams.get("epoch");
        const latest = searchParams.get("latest");

        if (latest === "true") {
            // Get latest snapshot
            const q = query(
                collection(db, "scoreSnapshots"),
                orderBy("epoch", "desc"),
                limit(1),
            );
            const snap = await getDocs(q);

            if (snap.empty) {
                return NextResponse.json(
                    { error: "No snapshots found" },
                    { status: 404 },
                );
            }

            const snapshot = snap.docs[0].data() as ScoreSnapshot;
            return NextResponse.json(snapshot);
        }

        if (epochStr) {
            const epoch = parseInt(epochStr, 10);
            if (isNaN(epoch) || epoch < 1) {
                return NextResponse.json(
                    { error: "Invalid epoch: must be a positive integer" },
                    { status: 400 },
                );
            }

            const snapshot = await getSnapshotByEpoch(epoch);
            if (!snapshot) {
                return NextResponse.json(
                    { error: `No snapshot found for epoch ${epoch}` },
                    { status: 404 },
                );
            }

            return NextResponse.json(snapshot);
        }

        // List recent snapshots (without full agents array for efficiency)
        const q = query(
            collection(db, "scoreSnapshots"),
            orderBy("epoch", "desc"),
            limit(20),
        );
        const snap = await getDocs(q);
        const snapshots = snap.docs.map((d) => {
            const data = d.data() as ScoreSnapshot;
            return {
                snapshotId: data.snapshotId,
                epoch: data.epoch,
                timestamp: data.timestamp,
                agentCount: data.agentCount,
                stateHash: data.stateHash,
                merkleRoot: data.merkleRoot,
                previousStateHash: data.previousStateHash,
                hcsTxId: data.hcsTxId,
            };
        });

        return NextResponse.json({
            count: snapshots.length,
            snapshots,
        });
    } catch (error) {
        console.error("Snapshots error:", error);
        return NextResponse.json(
            {
                error: "Failed to get snapshots",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
