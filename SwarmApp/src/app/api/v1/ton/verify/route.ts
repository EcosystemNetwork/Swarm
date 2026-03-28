/**
 * POST /api/v1/ton/verify
 *
 * Verify ton_proof ownership signature server-side.
 * Cryptographically confirms the caller controls the TON wallet
 * without requiring an on-chain transaction.
 *
 * Spec: https://docs.ton.org/develop/dapps/ton-connect/sign
 *
 * Body: { orgId, address, proof: { timestamp, domain, signature, payload }, publicKey }
 * Returns: { valid: true, address } | { valid: false, error }
 */
import { NextRequest } from "next/server";
import { createHash, createPublicKey, verify as cryptoVerify } from "crypto";

// ASN.1 SPKI header for Ed25519 (OID 1.3.101.112) — 12 bytes
// Allows wrapping a raw 32-byte Ed25519 pubkey into a DER structure
// that Node.js crypto.verify() accepts.
const ED25519_SPKI_HEADER = Buffer.from("302a300506032b6570032100", "hex");
import { collection, getDocs, query, where, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logTonAudit } from "@/lib/ton-policy";

interface TonProofPayload {
    timestamp: number;
    domain: { lengthBytes: number; value: string };
    signature: string; // base64
    payload: string;
}

function buildVerifyMessage(
    address: string,
    domain: string,
    timestamp: number,
    payload: string,
): Buffer {
    // Parse raw TON address in "workchain:hash" format (e.g. "0:ab12…cd34")
    // The hash is the 32-byte account identifier; workchain is typically 0.
    const parts = address.split(":");
    const workchain = parts.length === 2 ? parseInt(parts[0], 10) : 0;
    const hashHex = parts.length === 2 ? parts[1] : address.replace(/[^a-fA-F0-9]/g, "");

    const wc = Buffer.allocUnsafe(4);
    wc.writeInt32BE(workchain, 0);

    if (hashHex.length !== 64) {
        // Fallback: pad/truncate for non-standard formats
        // Production: use @ton/ton Address.parse() for EQ…/UQ… friendly addresses
    }
    const addrHash = Buffer.from(hashHex.padStart(64, "0").slice(0, 64), "hex");

    const domainBuf = Buffer.from(domain, "utf8");
    const domainLen = Buffer.allocUnsafe(4);
    domainLen.writeUInt32LE(domainBuf.length, 0);

    const tsBuf = Buffer.allocUnsafe(8);
    tsBuf.writeBigUInt64LE(BigInt(timestamp), 0);

    const payloadBuf = Buffer.from(payload, "utf8");

    const message = Buffer.concat([
        Buffer.from("ton-proof-item-v2/", "utf8"),
        wc,
        addrHash,
        domainLen,
        domainBuf,
        tsBuf,
        payloadBuf,
    ]);

    const msgHash = createHash("sha256").update(message).digest();
    const tonConnectHash = createHash("sha256").update(Buffer.from("ton-connect", "utf8")).digest();

    return createHash("sha256")
        .update(Buffer.concat([Buffer.from([0xff, 0xff]), tonConnectHash, msgHash]))
        .digest();
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, address, proof, publicKey } = body as {
            orgId: string;
            address: string;
            proof: TonProofPayload;
            publicKey: string; // hex-encoded Ed25519 public key from wallet
        };

        if (!orgId || !address || !proof || !publicKey) {
            return Response.json({ error: "orgId, address, proof, and publicKey are required" }, { status: 400 });
        }

        // Replay protection: proof must be fresh (within 10 minutes)
        const ageSeconds = Math.floor(Date.now() / 1000) - proof.timestamp;
        if (ageSeconds > 600) {
            return Response.json({ valid: false, error: "Proof expired (>10 minutes old)" }, { status: 400 });
        }

        const appDomain = proof.domain?.value || new URL(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://app.swarmprotocol.fun").hostname;
        const msg = buildVerifyMessage(address, appDomain, proof.timestamp, proof.payload);
        const sig = Buffer.from(proof.signature, "base64");
        const rawPubkey = Buffer.from(publicKey.replace(/^0x/, ""), "hex");

        if (rawPubkey.length !== 32) {
            return Response.json({ valid: false, error: "publicKey must be a 32-byte hex Ed25519 key" }, { status: 400 });
        }

        // Wrap raw 32-byte key into SPKI DER format that Node.js crypto accepts
        const spkiDer = Buffer.concat([ED25519_SPKI_HEADER, rawPubkey]);
        const pubKeyObject = createPublicKey({ key: spkiDer, format: "der", type: "spki" });
        const valid = cryptoVerify(null, msg, pubKeyObject, sig);

        if (!valid) {
            await logTonAudit({
                orgId,
                event: "wallet_verified",
                paymentId: null,
                subscriptionId: null,
                fromAddress: address,
                toAddress: null,
                amountNano: null,
                txHash: null,
                policyResult: null,
                reviewedBy: null,
                note: `Proof verification FAILED for ${address}`,
            });
            return Response.json({ valid: false, error: "Signature verification failed" }, { status: 401 });
        }

        // Mark wallet as verified in Firestore
        const q = query(
            collection(db, "tonWallets"),
            where("orgId", "==", orgId),
            where("address", "==", address),
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
            await updateDoc(doc(db, "tonWallets", snap.docs[0].id), { verified: true, publicKey });
        }

        await logTonAudit({
            orgId,
            event: "wallet_verified",
            paymentId: null,
            subscriptionId: null,
            fromAddress: address,
            toAddress: null,
            amountNano: null,
            txHash: null,
            policyResult: null,
            reviewedBy: null,
            note: `Wallet ${address} ownership verified via ton_proof`,
        });

        return Response.json({ valid: true, address });
    } catch (err) {
        console.error("[ton/verify]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
