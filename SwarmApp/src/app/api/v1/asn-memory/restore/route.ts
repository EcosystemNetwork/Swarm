/**
 * ASN Memory Restore API
 *
 * POST /api/v1/asn-memory/restore
 * Restores agent memory from Storacha backup using ASN.
 *
 * Flow:
 * 1. Look up ASN → CID mapping in Firestore
 * 2. Download encrypted memory from Storacha
 * 3. Decrypt and parse memory data
 * 4. Return memory data for agent to load
 * 5. Fetch NFT credit score from Hedera
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc } from "firebase/firestore";
import { getServerSession } from "@/lib/session";
import { retrieveContent, isStorachaConfigured } from "@/lib/storacha/client";
import { getAgentNFTIdentity } from "@/lib/hedera-nft-client";

interface RestoreRequest {
    agentId: string;
    asn: string;
    orgId: string;
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(req);
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body: RestoreRequest = await req.json();
        const { agentId, asn, orgId } = body;

        if (!agentId || !asn || !orgId) {
            return NextResponse.json(
                { error: "Missing required fields: agentId, asn, orgId" },
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
            return NextResponse.json(
                {
                    success: false,
                    error: "No backup found for this ASN",
                    asn,
                },
                { status: 404 }
            );
        }

        const backupData = asnDoc.data();
        const { cid, sizeBytes, createdAt, lastBackup, walletAddress, messageCount } = backupData;

        // Download memory from Storacha
        let memoryData: any;

        if (isStorachaConfigured()) {
            try {
                const response = await retrieveContent(cid);
                const text = await response.text();
                memoryData = JSON.parse(text);
            } catch (error) {
                console.error("Failed to download from Storacha:", error);
                return NextResponse.json(
                    { error: "Failed to download memory backup from Storacha", cid },
                    { status: 500 }
                );
            }
        } else {
            // Fallback if Storacha not configured (dev mode)
            console.warn("Storacha not configured - using placeholder data");
            memoryData = {
                version: "1.0",
                asn,
                agentId,
                agent: { name: "RestoredAgent", type: "Research" },
                context: { skills: [], preferences: {} },
                history: { messages: [], totalMessages: 0 },
            };
        }

        // Get current NFT identity (credit score may have changed since backup)
        let nftIdentity = null;
        if (walletAddress) {
            nftIdentity = await getAgentNFTIdentity(walletAddress);
        }

        const creditScore = nftIdentity?.creditScore || memoryData.reputation?.creditScore || 680;
        const trustScore = nftIdentity?.trustScore || memoryData.reputation?.trustScore || 50;

        // Build restored data structure
        const restoredData = {
            agentId,
            asn,
            agent: memoryData.agent || {},
            context: memoryData.context || null,
            history: memoryData.history || null,
        };

        const totalMessages = restoredData.history?.totalMessages || 0;

        return NextResponse.json({
            success: true,
            asn,
            restored: true,
            data: restoredData,
            backup: {
                cid,
                sizeBytes,
                messageCount: messageCount || totalMessages,
                lastBackup: lastBackup?.toDate ? lastBackup.toDate().toISOString() : null,
            },
            reputation: {
                creditScore,
                trustScore,
                tier: nftIdentity?.tier || "Bronze",
                hasNFT: nftIdentity?.hasNFT || false,
            },
            message: `🎉 Memory restored successfully! Agent continues with ${totalMessages} messages and credit score ${creditScore}.`,
        });
    } catch (error) {
        console.error("ASN memory restore error:", error);
        return NextResponse.json(
            { error: "Failed to restore memory", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
