/**
 * Flow Agent Wallets
 *
 * Generates ECDSA P-256 keypairs for Swarm agents on the Flow blockchain.
 * Flow uses ECDSA_P256 + SHA3-256 for account-level key management.
 * The address is derived as a deterministic hash until the account is created on-chain.
 */

import crypto from "crypto";
import {
    collection,
    doc,
    addDoc,
    updateDoc,
    getDocs,
    query,
    where,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { encryptValue, decryptValue, maskValue } from "./secrets";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface FlowAgentWallet {
    id: string;
    orgId: string;
    agentId: string | null;
    label: string;
    /** Flow address — 0x prefixed 16-hex-char address */
    address: string;
    /** hex-encoded P-256 public key (uncompressed, 64 bytes without 04 prefix) */
    publicKey: string;
    /** masked preview of private key for display */
    privateKeyMasked: string;
    network: "mainnet" | "testnet";
    status: "active" | "frozen" | "retired";
    /** Whether this address has been created on-chain */
    onChainCreated: boolean;
    createdBy: string;
    createdAt: Date | null;
}

// ═══════════════════════════════════════════════════════════════
// Key generation — Flow uses ECDSA_P256 (secp256r1)
// ═══════════════════════════════════════════════════════════════

interface GeneratedKeypair {
    publicKeyHex: string;
    privateKeyHex: string;
    address: string;
}

export function generateFlowKeypair(): GeneratedKeypair {
    const { publicKey: pubDer, privateKey: privDer } = crypto.generateKeyPairSync("ec", {
        namedCurve: "prime256v1", // P-256
        publicKeyEncoding: { type: "spki", format: "der" },
        privateKeyEncoding: { type: "pkcs8", format: "der" },
    });

    // Extract raw public key (uncompressed, 65 bytes starting with 0x04)
    // SPKI DER for P-256: last 65 bytes
    const rawPublicKey = pubDer.slice(-65);
    // Remove the 0x04 prefix — Flow expects 64-byte hex public key
    const publicKeyHex = rawPublicKey.slice(1).toString("hex");

    // Extract raw 32-byte private key from PKCS8 DER
    // For EC keys the private key is embedded after the OID — locate it by searching for the key data
    const privKeyObj = crypto.createPrivateKey({ key: privDer, format: "der", type: "pkcs8" });
    const jwk = privKeyObj.export({ format: "jwk" });
    const privateKeyHex = Buffer.from(jwk.d!, "base64url").toString("hex").padStart(64, "0");

    // Flow address = first 16 hex chars of SHA3-256(public key bytes)
    // This is a placeholder address until the account is created on-chain via a transaction
    const addrHash = crypto
        .createHash("sha3-256")
        .update(rawPublicKey.slice(1)) // hash the 64-byte uncompressed key (without 04 prefix)
        .digest("hex");
    const address = `0x${addrHash.slice(0, 16)}`;

    return { publicKeyHex, privateKeyHex, address };
}

// ═══════════════════════════════════════════════════════════════
// Firestore CRUD
// ═══════════════════════════════════════════════════════════════

export async function createFlowAgentWallet(
    orgId: string,
    createdBy: string,
    opts: { label: string; agentId?: string; network?: "mainnet" | "testnet" },
): Promise<{ wallet: FlowAgentWallet; privateKeyHex: string }> {
    const masterSecret = process.env.SECRETS_MASTER_KEY || process.env.NEXTAUTH_SECRET || "dev-fallback";
    const { publicKeyHex, privateKeyHex, address } = generateFlowKeypair();

    const { encryptedValue, iv } = encryptValue(privateKeyHex, orgId, masterSecret);

    const ref = await addDoc(collection(db, "flowAgentWallets"), {
        orgId,
        agentId: opts.agentId || null,
        label: opts.label,
        address,
        publicKey: publicKeyHex,
        encryptedPrivateKey: encryptedValue,
        privateKeyIv: iv,
        privateKeyMasked: maskValue(privateKeyHex),
        network: opts.network || "testnet",
        status: "active",
        onChainCreated: false,
        createdBy,
        createdAt: serverTimestamp(),
    });

    const wallet: FlowAgentWallet = {
        id: ref.id,
        orgId,
        agentId: opts.agentId || null,
        label: opts.label,
        address,
        publicKey: publicKeyHex,
        privateKeyMasked: maskValue(privateKeyHex),
        network: opts.network || "testnet",
        status: "active",
        onChainCreated: false,
        createdBy,
        createdAt: new Date(),
    };

    return { wallet, privateKeyHex };
}

export async function getFlowAgentWallets(orgId: string): Promise<FlowAgentWallet[]> {
    const q = query(collection(db, "flowAgentWallets"), where("orgId", "==", orgId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToWallet(d.id, d.data())).sort(
        (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
    );
}

export async function revealFlowAgentWalletKey(
    walletId: string,
    orgId: string,
): Promise<string | null> {
    const masterSecret = process.env.SECRETS_MASTER_KEY || process.env.NEXTAUTH_SECRET || "dev-fallback";
    const { getDoc } = await import("firebase/firestore");
    const d = await getDoc(doc(db, "flowAgentWallets", walletId));
    if (!d.exists()) return null;
    const data = d.data();
    if (data.orgId !== orgId) return null;
    return decryptValue(data.encryptedPrivateKey, data.privateKeyIv, orgId, masterSecret);
}

export async function updateFlowAgentWalletStatus(
    walletId: string,
    status: "active" | "frozen" | "retired",
): Promise<void> {
    await updateDoc(doc(db, "flowAgentWallets", walletId), { status });
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function docToWallet(id: string, d: Record<string, unknown>): FlowAgentWallet {
    return {
        id,
        orgId: d.orgId as string,
        agentId: (d.agentId as string) || null,
        label: (d.label as string) || "",
        address: (d.address as string) || "",
        publicKey: (d.publicKey as string) || "",
        privateKeyMasked: (d.privateKeyMasked as string) || "••••••••",
        network: (d.network as "mainnet" | "testnet") || "testnet",
        status: (d.status as FlowAgentWallet["status"]) || "active",
        onChainCreated: (d.onChainCreated as boolean) || false,
        createdBy: (d.createdBy as string) || "",
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
    };
}
