/**
 * POST /api/v1/jobs/escrow/create
 *
 * Create Hedera scheduled transaction escrow for job bounty
 *
 * Body: {
 *   jobId: string,
 *   bountyHbar: string,
 *   recipientAccountId: string, // Agent's Hedera account
 *   payerAccountId: string // Job poster's Hedera account
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/session";
import { getJob, updateJob } from "@/lib/firestore";
import { createJobBountyEscrow } from "@/lib/hedera-job-bounty";
import { resolveAgentPolicy } from "@/lib/auth-guard";
import { calculateRequiredEscrow } from "@/lib/credit-policy";
import { getCreditPolicyConfig, recordPolicyEvent } from "@/lib/credit-policy-settings";

export async function POST(req: NextRequest) {
  try {
    const session = await validateSession();
    if (!session?.address) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId, bountyHbar, recipientAccountId, payerAccountId } = await req.json();

    if (!jobId || !bountyHbar || !recipientAccountId || !payerAccountId) {
      return NextResponse.json(
        { error: "Missing required fields: jobId, bountyHbar, recipientAccountId, payerAccountId" },
        { status: 400 }
      );
    }

    // Verify job exists and poster owns it
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.postedByAddress !== session.address) {
      return NextResponse.json(
        { error: "Only job poster can create escrow" },
        { status: 403 }
      );
    }

    // ── Credit Policy Enforcement ──
    // Resolve claiming agent's tier for escrow ratio calculation
    let appliedEscrowRatio: number | undefined;
    if (job.takenByAgentId) {
      try {
        const config = await getCreditPolicyConfig();
        const policyResult = await resolveAgentPolicy(job.takenByAgentId);

        if (config.enforcementEnabled && config.enforceEscrow && policyResult.ok && policyResult.policy) {
          const escrow = calculateRequiredEscrow(policyResult.policy, parseFloat(bountyHbar));
          appliedEscrowRatio = escrow.escrowRatio;

          await recordPolicyEvent({
            agentId: job.takenByAgentId,
            orgId: job.orgId,
            action: "escrow_enforced",
            tier: policyResult.tier!,
            details: { jobId, bountyHbar, escrowRatio: escrow.escrowRatio, escrowAmount: escrow.escrowAmount },
          });
        }
      } catch (err) {
        // Fail-open: log warning but don't block escrow creation
        console.warn("[jobs/escrow/create] Credit policy check failed (fail-open):", err);
      }
    }

    // Create Hedera scheduled transaction escrow
    const scheduledTxId = await createJobBountyEscrow(
      jobId,
      bountyHbar,
      recipientAccountId,
      payerAccountId
    );

    // Update job with Hedera escrow details
    await updateJob(jobId, {
      hederaScheduledTxId: scheduledTxId,
      hederaBountyHbar: bountyHbar,
      hederaRecipientAccountId: recipientAccountId,
      hederaEscrowStatus: 'pending',
    });

    return NextResponse.json({
      success: true,
      scheduledTxId,
      bountyHbar,
      message: `✅ Created ${bountyHbar} HBAR escrow for job ${jobId}`,
      hashscanUrl: `https://hashscan.io/testnet/transaction/${scheduledTxId}`,
    });
  } catch (error) {
    console.error("Create job escrow error:", error);
    return NextResponse.json(
      {
        error: "Failed to create job escrow",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
