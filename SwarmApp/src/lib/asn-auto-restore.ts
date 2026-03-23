/**
 * ASN Auto-Restore Helper
 *
 * Server-side helper for automatically restoring agent memory during registration.
 * Checks if an ASN has a backup and returns restoration data without requiring auth.
 */

import { db } from "@/lib/firebase";
import { collection, doc, getDoc } from "firebase/firestore";
import { retrieveContent, isStorachaConfigured } from "@/lib/storacha/client";
import { getAgentNFTIdentity } from "@/lib/hedera-nft-client";

export interface AutoRestoreResult {
    restored: boolean;
    asn: string;
    backup?: {
        cid: string;
        sizeBytes: number;
        messageCount: number;
        lastBackup: string | null;
    };
    reputation?: {
        creditScore: number;
        trustScore: number;
        tier: "Bronze" | "Silver" | "Gold" | "Platinum";
        hasNFT: boolean;
    };
    memoryData?: any;
    message?: string;
}

/**
 * Check if ASN has a backup and restore it automatically.
 * Called during agent registration to provide seamless memory restoration.
 */
export async function checkAndRestoreASN(asn: string): Promise<AutoRestoreResult> {
    try {
        // Look up ASN backup in Firestore
        const asnMemoryRef = doc(collection(db, "asnMemoryBackups"), asn);
        const asnDoc = await getDoc(asnMemoryRef);

        if (!asnDoc.exists()) {
            return {
                restored: false,
                asn,
                message: "No backup found for this ASN",
            };
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
                console.error("Failed to download from Storacha during auto-restore:", error);
                return {
                    restored: false,
                    asn,
                    message: "Backup exists but download failed",
                };
            }
        } else {
            // Fallback if Storacha not configured (dev mode)
            console.warn("Storacha not configured - auto-restore returning metadata only");
            memoryData = null;
        }

        // Get current NFT identity (credit score may have changed since backup)
        let nftIdentity = null;
        if (walletAddress) {
            nftIdentity = await getAgentNFTIdentity(walletAddress);
        }

        const creditScore = nftIdentity?.creditScore || memoryData?.reputation?.creditScore || 680;
        const trustScore = nftIdentity?.trustScore || memoryData?.reputation?.trustScore || 50;
        const tier = nftIdentity?.tier || "Bronze";

        return {
            restored: true,
            asn,
            backup: {
                cid,
                sizeBytes,
                messageCount: messageCount || memoryData?.history?.totalMessages || 0,
                lastBackup: lastBackup?.toDate ? lastBackup.toDate().toISOString() : null,
            },
            reputation: {
                creditScore,
                trustScore,
                tier,
                hasNFT: nftIdentity?.hasNFT || false,
            },
            memoryData,
            message: `✅ Backup found! Agent will restore ${messageCount || 0} messages with ${tier} tier (credit: ${creditScore}).`,
        };
    } catch (error) {
        console.error("ASN auto-restore check error:", error);
        return {
            restored: false,
            asn,
            message: "Auto-restore check failed",
        };
    }
}
