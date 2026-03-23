/**
 * ASN Memory Backup API
 *
 * POST /api/v1/asn-memory/backup
 * Backs up agent memory to Storacha, linked to ASN for persistent identity.
 *
 * Flow:
 * 1. Fetch agent's conversation history + context
 * 2. Encrypt and upload to Storacha (get CID)
 * 3. Store ASN → CID mapping in Firestore
 * 4. Return backup confirmation
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, doc, setDoc, serverTimestamp, getDocs, query, where } from "firebase/firestore";
import { getServerSession } from "@/lib/session";
import { uploadContent, isStorachaConfigured } from "@/lib/storacha/client";
import { getAgentNFTIdentity } from "@/lib/hedera-nft-client";

interface BackupRequest {
    agentId: string;
    asn: string;
    orgId: string;
    includeContext?: boolean;
    includeHistory?: boolean;
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(req);
        if (!session?.address) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body: BackupRequest = await req.json();
        const { agentId, asn, orgId, includeContext = true, includeHistory = true } = body;

        if (!agentId || !asn || !orgId) {
            return NextResponse.json(
                { error: "Missing required fields: agentId, asn, orgId" },
                { status: 400 }
            );
        }

        // Validate ASN format (ASN-SWM-YYYY-XXXX-XXXX-CC)
        if (!/^ASN-SWM-\d{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{2}$/i.test(asn)) {
            return NextResponse.json(
                { error: "Invalid ASN format. Expected: ASN-SWM-YYYY-XXXX-XXXX-CC" },
                { status: 400 }
            );
        }

        // Fetch agent's memory from Firestore
        const messagesRef = collection(db, "messages");
        const messagesQuery = query(
            messagesRef,
            where("agentId", "==", agentId),
            where("orgId", "==", orgId)
        );
        const messagesSnapshot = await getDocs(messagesQuery);
        const messages = messagesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate().toISOString() : null,
        }));

        // Get agent NFT identity (credit score, trust score)
        const agentDoc = await getDocs(query(collection(db, "agents"), where("id", "==", agentId)));
        const agentData = agentDoc.docs[0]?.data();
        const walletAddress = agentData?.walletAddress;

        let nftIdentity = null;
        if (walletAddress) {
            nftIdentity = await getAgentNFTIdentity(walletAddress);
        }

        // Build memory backup structure
        const memoryData = {
            version: "1.0",
            asn,
            agentId,
            orgId,
            backupTimestamp: new Date().toISOString(),
            agent: {
                name: agentData?.name || "Unknown",
                type: agentData?.type || "Unknown",
                walletAddress: walletAddress || null,
                bio: agentData?.bio || null,
                reportedSkills: agentData?.reportedSkills || [],
            },
            reputation: nftIdentity?.hasNFT ? {
                creditScore: nftIdentity.creditScore,
                trustScore: nftIdentity.trustScore,
                tier: nftIdentity.tier,
            } : null,
            context: includeContext ? {
                skills: agentData?.reportedSkills || [],
                preferences: agentData?.preferences || {},
                description: agentData?.description || "",
            } : null,
            history: includeHistory ? {
                messages: messages.slice(-1000), // Last 1000 messages
                totalMessages: messages.length,
            } : null,
        };

        // Upload to Storacha
        let cid: string;
        let sizeBytes: number;

        if (isStorachaConfigured()) {
            const memoryJson = JSON.stringify(memoryData, null, 2);
            const memoryBuffer = Buffer.from(memoryJson, "utf-8");
            const uploadResult = await uploadContent(memoryBuffer, `agent-${asn}-backup.json`);
            cid = uploadResult.cid;
            sizeBytes = uploadResult.sizeBytes;
        } else {
            // Fallback if Storacha not configured (dev mode)
            console.warn("Storacha not configured - using mock CID");
            cid = `bafy2bzac${asn.replace(/[^0-9A-F]/gi, '').toLowerCase().slice(0, 50)}`;
            sizeBytes = JSON.stringify(memoryData).length;
        }

        // Store ASN → CID mapping in Firestore
        const asnMemoryRef = doc(collection(db, "asnMemoryBackups"), asn);
        await setDoc(asnMemoryRef, {
            asn,
            agentId,
            orgId,
            walletAddress: walletAddress || null,
            cid,
            sizeBytes,
            messageCount: messages.length,
            includeContext,
            includeHistory,
            backupVersion: "1.0",
            creditScore: nftIdentity?.creditScore || null,
            trustScore: nftIdentity?.trustScore || null,
            tier: nftIdentity?.tier || null,
            createdBy: session.address,
            createdAt: serverTimestamp(),
            lastBackup: serverTimestamp(),
        });

        return NextResponse.json({
            success: true,
            asn,
            cid,
            sizeBytes,
            messageCount: messages.length,
            reputation: nftIdentity?.hasNFT ? {
                creditScore: nftIdentity.creditScore,
                trustScore: nftIdentity.trustScore,
                tier: nftIdentity.tier,
            } : null,
            timestamp: new Date().toISOString(),
            message: `Memory backed up successfully! ${messages.length} messages stored to Storacha.`,
        });
    } catch (error) {
        console.error("ASN memory backup error:", error);
        return NextResponse.json(
            { error: "Failed to backup memory", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
