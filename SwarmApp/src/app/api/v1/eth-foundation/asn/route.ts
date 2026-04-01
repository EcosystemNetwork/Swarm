/**
 * GET  /api/v1/eth-foundation/asn  — Get ETH ASN records for an org
 * POST /api/v1/eth-foundation/asn  — Create/link ETH ASN record, register ERC-8004 identity
 */
import { NextRequest } from "next/server";
import {
    ensureEthASNRecord,
    getEthASNRecordsByOrg,
    getEthASNRecord,
    linkEthWallet,
    markEthOnChainRegistered,
    registerERC8004Identity,
    updateERC8004Reputation,
    addERC8004Validation,
    updateManifestCid,
} from "@/lib/eth-asn";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    const asn = req.nextUrl.searchParams.get("asn");

    if (!orgId && !asn) return Response.json({ error: "orgId or asn required" }, { status: 400 });

    if (asn) {
        const record = await getEthASNRecord(asn);
        if (!record) return Response.json({ error: "ASN not found" }, { status: 404 });
        return Response.json({ record });
    }

    const records = await getEthASNRecordsByOrg(orgId!);
    return Response.json({ count: records.length, records });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, action } = body;

        if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

        // Link an Ethereum wallet to ASN
        if (action === "link_wallet") {
            const { asn, address, network, isPrimary, ensName } = body;
            if (!asn || !address) return Response.json({ error: "asn and address required" }, { status: 400 });
            await linkEthWallet(asn, address, network || "sepolia", isPrimary, ensName || null);
            return Response.json({ status: "linked" });
        }

        // Mark ASN as on-chain registered
        if (action === "register_onchain") {
            const { asn, txHash } = body;
            if (!asn || !txHash) return Response.json({ error: "asn and txHash required" }, { status: 400 });
            await markEthOnChainRegistered(asn, txHash);
            return Response.json({ status: "registered" });
        }

        // Register ERC-8004 agent identity
        if (action === "register_erc8004") {
            const { asn, tokenId, operatorAddress, metadataURI, registrationTxHash, registrationBlock, chainId } = body;
            if (!asn || !tokenId || !operatorAddress || !registrationTxHash) {
                return Response.json({ error: "asn, tokenId, operatorAddress, and registrationTxHash required" }, { status: 400 });
            }
            await registerERC8004Identity(asn, {
                tokenId,
                operatorAddress,
                metadataURI: metadataURI || "",
                registrationTxHash,
                registrationBlock: registrationBlock || 0,
                chainId: chainId || 11155111, // Sepolia default
                registeredAt: new Date(),
            });
            return Response.json({ status: "erc8004_registered" });
        }

        // Update ERC-8004 reputation
        if (action === "update_reputation") {
            const { asn, score, taskCount, successCount, disputeCount, lastUpdateTxHash } = body;
            if (!asn) return Response.json({ error: "asn required" }, { status: 400 });
            await updateERC8004Reputation(asn, {
                score: score ?? 0,
                taskCount: taskCount ?? 0,
                successCount: successCount ?? 0,
                disputeCount: disputeCount ?? 0,
                lastUpdateTxHash: lastUpdateTxHash || null,
                lastUpdatedAt: new Date(),
            });
            return Response.json({ status: "reputation_updated" });
        }

        // Add ERC-8004 validation attestation
        if (action === "add_validation") {
            const { asn, validator, capabilityHash, capabilityName, txHash, expiresAt } = body;
            if (!asn || !validator || !capabilityHash) {
                return Response.json({ error: "asn, validator, and capabilityHash required" }, { status: 400 });
            }
            await addERC8004Validation(asn, {
                validator,
                capabilityHash,
                capabilityName: capabilityName || "",
                txHash: txHash || "",
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                attestedAt: new Date(),
            });
            return Response.json({ status: "validation_added" });
        }

        // Update agent manifest CID
        if (action === "update_manifest") {
            const { asn, cid } = body;
            if (!asn || !cid) return Response.json({ error: "asn and cid required" }, { status: 400 });
            await updateManifestCid(asn, cid);
            return Response.json({ status: "manifest_updated" });
        }

        // Default: ensure record exists
        const { agentId, asn } = body;
        if (!agentId || !asn) return Response.json({ error: "agentId and asn required" }, { status: 400 });

        const record = await ensureEthASNRecord(asn, orgId, agentId);
        return Response.json({ record }, { status: 201 });
    } catch (err) {
        console.error("[eth-foundation/asn POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
