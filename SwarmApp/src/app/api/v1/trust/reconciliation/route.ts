/**
 * POST /api/v1/trust/reconciliation — Trigger manual reconciliation pass
 * GET  /api/v1/trust/reconciliation — Get latest reconciliation report(s)
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/session";
import { runReconciliation, getReconciliationHistory } from "@/lib/hedera-reconciliation";

export async function POST() {
    try {
        const session = await validateSession();
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const report = await runReconciliation();

        return NextResponse.json({
            success: true,
            report,
        });
    } catch (error) {
        console.error("Manual reconciliation error:", error);
        return NextResponse.json(
            {
                error: "Failed to run reconciliation",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}

export async function GET(req: NextRequest) {
    try {
        const session = await validateSession();
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const limitStr = searchParams.get("limit");
        const maxResults = limitStr ? parseInt(limitStr, 10) : 10;

        const reports = await getReconciliationHistory(maxResults);

        return NextResponse.json({
            count: reports.length,
            reports,
        });
    } catch (error) {
        console.error("Reconciliation history error:", error);
        return NextResponse.json(
            {
                error: "Failed to get reconciliation history",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
