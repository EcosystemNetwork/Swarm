/**
 * ASN Memory Status API
 *
 * GET /api/v1/asn-memory/status?asn=ASN-SWM-2026-XXXX-XXXX-XX
 * Check backup status for an ASN: last backup time, CID, size, and credit score.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc } from "firebase/firestore";
import { getAgentNFTIdentity, getReputationTier } from "@/lib/hedera-nft-client";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const asn = searchParams.get("asn");

        if (!asn) {
            return NextResponse.json(
                { error: "Missing ASN parameter" },
                { status: 400 }
            );
        }

        // Validate ASN format
        if (!/^ASN-SWM-\d{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{2}$/i.test(asn)) {
            return NextResponse.json(
                { error: "Invalid ASN format" },
                { status: 400 }
            );
        }

        // Look up ASN backup in Firestore
        const asnMemoryRef = doc(collection(db, "asnMemoryBackups"), asn);
        const asnDoc = await getDoc(asnMemoryRef);

        if (!asnDoc.exists()) {
            return NextResponse.json({
                hasBackup: false,
                asn,
                message: "No backup found for this ASN",
            });
        }

        const backupData = asnDoc.data();
        const { cid, sizeBytes, createdAt, lastBackup, agentId, orgId, walletAddress, messageCount } = backupData;

        // Fetch current credit score from Hedera NFT
        let creditScore = backupData.creditScore || 680;
        let trustScore = backupData.trustScore || 50;
        let tier = backupData.tier || getReputationTier(creditScore);
        let hasNFT = false;

        if (walletAddress) {
            const nftIdentity = await getAgentNFTIdentity(walletAddress);
            if (nftIdentity.hasNFT) {
                hasNFT = true;
                creditScore = nftIdentity.creditScore || creditScore;
                trustScore = nftIdentity.trustScore || trustScore;
                tier = nftIdentity.tier || tier;
            }
        }

        return NextResponse.json({
            hasBackup: true,
            asn,
            agentId,
            orgId,
            walletAddress: walletAddress || null,
            backup: {
                cid,
                sizeBytes,
                messageCount: messageCount || 0,
                createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : null,
                lastBackup: lastBackup?.toDate ? lastBackup.toDate().toISOString() : null,
            },
            reputation: {
                hasNFT,
                creditScore,
                trustScore,
                tier,
            },
            message: hasNFT
                ? `✅ Backup ready! Agent can be restored with ${messageCount || 0} messages and ${tier} tier (credit: ${creditScore}).`
                : `⚠️ Backup exists but no NFT found. Agent may need on-chain registration.`,
        });
    } catch (error) {
        console.error("ASN memory status error:", error);
        return NextResponse.json(
            { error: "Failed to check status", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
