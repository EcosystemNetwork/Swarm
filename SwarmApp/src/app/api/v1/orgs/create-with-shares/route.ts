/**
 * POST /api/v1/orgs/create-with-shares
 *
 * Create organization with FULL Hedera integration:
 * 1. HCS ownership proof (immutable audit trail)
 * 2. ERC20 share tokens (tradeable equity)
 *
 * This is the "golden flow" for Hedera hackathon demo!
 *
 * Flow:
 * 1. Verify owner signature
 * 2. Create org in Firestore
 * 3. Submit ownership proof to HCS
 * 4. Issue ERC20 share tokens on Hedera
 * 5. Update org with HCS + token details
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/session";
import {
  createOrganization,
  updateOrganization,
  type Organization,
} from "@/lib/firestore";
import {
  submitOrgCreationToHCS,
  createOrgCreationMessage,
  verifySignature,
  type OrgCreationEvent,
} from "@/lib/hedera-org-ownership";
import {
  issueOrgShares,
} from "@/lib/hedera-org-shares";

export async function POST(req: NextRequest) {
  try {
    const session = await validateSession();
    if (!session?.sub) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ownerAddress = session.sub;

    const body = await req.json();
    const {
      name,
      description,
      website,
      ownerSignature,
      // Share token parameters
      shareSymbol, // e.g., "ACME"
      initialShares, // e.g., 1000000
      holderHederaAccount, // e.g., "0.0.123456"
    } = body;

    if (!name || !ownerSignature || !shareSymbol || !initialShares) {
      return NextResponse.json(
        {
          error: "Missing required fields: name, ownerSignature, shareSymbol, initialShares",
        },
        { status: 400 }
      );
    }

    const timestamp = Date.now();

    // Step 1: Create org in Firestore
    const orgId = await createOrganization({
      name,
      description: description || "",
      ownerAddress,
      members: [ownerAddress],
      createdAt: new Date(),
    } as Omit<Organization, "id">);

    // Step 2: Verify signature
    const message = createOrgCreationMessage(orgId, timestamp);
    const signatureValid = verifySignature(message, ownerSignature, ownerAddress);

    if (!signatureValid) {
      console.error(`[HCS] Invalid signature for org creation: ${orgId}`);
      return NextResponse.json(
        {
          error: "Invalid owner signature",
          orgId,
        },
        { status: 400 }
      );
    }

    // Step 3: Submit to HCS (immutable ownership proof)
    let hcsProof;
    try {
      const event: OrgCreationEvent = {
        type: "org_created",
        orgId,
        name,
        ownerAddress,
        ownerSignature,
        timestamp,
        metadata: {
          description,
          website,
        },
      };

      hcsProof = await submitOrgCreationToHCS(event);
      console.log(`[HCS] Org ownership recorded: ${hcsProof.sequenceNumber}`);
    } catch (hcsError) {
      console.error("[HCS] Failed to submit org creation:", hcsError);
      // Continue anyway - HCS is nice-to-have, shares are critical
    }

    // Step 4: Issue ERC20 share tokens on Hedera
    let shareToken;
    try {
      shareToken = await issueOrgShares(
        name,
        shareSymbol,
        parseInt(initialShares),
        holderHederaAccount || process.env.HEDERA_OPERATOR_ID || ""
      );

      console.log(`[Hedera] Issued ${initialShares} ${shareSymbol} shares`);
      console.log(`[Hedera] Token ID: ${shareToken.tokenId}`);
      console.log(`[Hedera] EVM Address: ${shareToken.tokenAddress}`);
    } catch (shareError) {
      console.error("[Hedera] Failed to issue share tokens:", shareError);

      // Mark org as created but without shares
      await updateOrganization(orgId, {
        hcsTopicId: hcsProof?.topicId,
        hcsSequenceNumber: hcsProof?.sequenceNumber,
        hcsConsensusTimestamp: new Date().toISOString(),
        ownerSignature,
        hcsVerifiedAt: new Date(),
        hcsOwnershipVerified: !!hcsProof,
      });

      return NextResponse.json(
        {
          warning: "Org created with HCS proof but share issuance failed",
          orgId,
          hcsProof,
          error: shareError instanceof Error ? shareError.message : "Share issuance failed",
        },
        { status: 201 }
      );
    }

    // Step 5: Update org with FULL Hedera integration
    await updateOrganization(orgId, {
      hcsTopicId: hcsProof?.topicId,
      hcsSequenceNumber: hcsProof?.sequenceNumber,
      hcsConsensusTimestamp: new Date().toISOString(),
      ownerSignature,
      hcsVerifiedAt: new Date(),
      hcsOwnershipVerified: !!hcsProof,
      // Share token details
      shareTokenId: shareToken.tokenId,
      shareTokenAddress: shareToken.tokenAddress,
      shareTokenSymbol: shareSymbol,
      shareTotalSupply: initialShares,
      sharesIssuedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      orgId,
      hcsProof: hcsProof
        ? {
            topicId: hcsProof.topicId,
            sequenceNumber: hcsProof.sequenceNumber,
            hashscanUrl: `https://hashscan.io/${process.env.HEDERA_NETWORK || "testnet"}/topic/${hcsProof.topicId}`,
          }
        : null,
      shareToken: {
        tokenId: shareToken.tokenId,
        tokenAddress: shareToken.tokenAddress,
        symbol: shareSymbol,
        totalSupply: initialShares,
        hashscanUrl: shareToken.hashscanUrl,
      },
      message: "Organization created with HCS ownership proof + ERC20 share tokens!",
    });
  } catch (error) {
    console.error("[API] Failed to create org with shares:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
