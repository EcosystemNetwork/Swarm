/**
 * TON Agent Wallets
 *
 * Generates Ed25519 keypairs for Swarm agents, derives a TON raw address,
 * and stores the private key encrypted in the secrets vault.
 *
 * In production, install @ton/ton and replace deriveAddress() with:
 *   WalletContractV4.create({ workchain: 0, publicKey: rawPubkey }).address.toRawString()
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

export interface TonAgentWallet {
    id: string;
    orgId: string;
    agentId: string | null;
    label: string;
    /** Raw TON address — 0:<32-byte-hash-hex> */
    address: string;
    /** hex-encoded Ed25519 public key (32 bytes) */
    publicKey: string;
    /** masked preview of private key for display */
    privateKeyMasked: string;
    network: "mainnet" | "testnet";
    status: "active" | "frozen" | "retired";
    createdBy: string;
    createdAt: Date | null;
}

// ═══════════════════════════════════════════════════════════════
// Key generation
// ═══════════════════════════════════════════════════════════════

interface GeneratedKeypair {
    publicKeyHex: string;
    privateKeyHex: string;
    address: string;
}

export function generateTonKeypair(): GeneratedKeypair {
    const { publicKey: pubDer, privateKey: privDer } = crypto.generateKeyPairSync("ed25519", {
        publicKeyEncoding: { type: "spki", format: "der" },
        privateKeyEncoding: { type: "pkcs8", format: "der" },
    });

    // Raw 32-byte public key is the last 32 bytes of the SPKI DER blob
    const rawPublicKey = pubDer.slice(-32);
    // Raw 32-byte private key (seed) is bytes 16–48 of PKCS8 DER blob
    const rawPrivateKey = privDer.slice(16, 48);

    const publicKeyHex = rawPublicKey.toString("hex");
    const privateKeyHex = rawPrivateKey.toString("hex");

    // TON address = workchain 0 + sha256 of an initial contract state
    // Simplified derivation (full impl requires wallet contract code hash + initial data cell)
    const addrHash = crypto
        .createHash("sha256")
        .update(Buffer.concat([Buffer.from("ton-wallet-v4:"), rawPublicKey]))
        .digest("hex");
    const address = `0:${addrHash}`;

    return { publicKeyHex, privateKeyHex, address };
}

// ═══════════════════════════════════════════════════════════════
// Firestore CRUD
// ═══════════════════════════════════════════════════════════════

export async function createAgentWallet(
    orgId: string,
    createdBy: string,
    opts: { label: string; agentId?: string; network?: "mainnet" | "testnet" },
): Promise<{ wallet: TonAgentWallet; privateKeyHex: string }> {
    const masterSecret = process.env.SECRETS_MASTER_KEY || process.env.NEXTAUTH_SECRET || "dev-fallback";
    const { publicKeyHex, privateKeyHex, address } = generateTonKeypair();

    // Encrypt private key using org-scoped AES-256-GCM (same as secrets vault)
    const { encryptedValue, iv } = encryptValue(privateKeyHex, orgId, masterSecret);

    const ref = await addDoc(collection(db, "tonAgentWallets"), {
        orgId,
        agentId: opts.agentId || null,
        label: opts.label,
        address,
        publicKey: publicKeyHex,
        encryptedPrivateKey: encryptedValue,
        privateKeyIv: iv,
        privateKeyMasked: maskValue(privateKeyHex),
        network: opts.network || "mainnet",
        status: "active",
        createdBy,
        createdAt: serverTimestamp(),
    });

    const wallet: TonAgentWallet = {
        id: ref.id,
        orgId,
        agentId: opts.agentId || null,
        label: opts.label,
        address,
        publicKey: publicKeyHex,
        privateKeyMasked: maskValue(privateKeyHex),
        network: opts.network || "mainnet",
        status: "active",
        createdBy,
        createdAt: new Date(),
    };

    return { wallet, privateKeyHex };
}

export async function getAgentWallets(orgId: string): Promise<TonAgentWallet[]> {
    const q = query(collection(db, "tonAgentWallets"), where("orgId", "==", orgId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToWallet(d.id, d.data())).sort(
        (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
    );
}

export async function revealAgentWalletKey(
    walletId: string,
    orgId: string,
): Promise<string | null> {
    const masterSecret = process.env.SECRETS_MASTER_KEY || process.env.NEXTAUTH_SECRET || "dev-fallback";
    const { getDoc } = await import("firebase/firestore");
    const d = await getDoc(doc(db, "tonAgentWallets", walletId));
    if (!d.exists()) return null;
    const data = d.data();
    if (data.orgId !== orgId) return null;
    return decryptValue(data.encryptedPrivateKey, data.privateKeyIv, orgId, masterSecret);
}

export async function updateAgentWalletStatus(
    walletId: string,
    status: "active" | "frozen" | "retired",
): Promise<void> {
    await updateDoc(doc(db, "tonAgentWallets", walletId), { status });
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function docToWallet(id: string, d: Record<string, unknown>): TonAgentWallet {
    return {
        id,
        orgId: d.orgId as string,
        agentId: (d.agentId as string) || null,
        label: (d.label as string) || "",
        address: (d.address as string) || "",
        publicKey: (d.publicKey as string) || "",
        privateKeyMasked: (d.privateKeyMasked as string) || "••••••••",
        network: (d.network as "mainnet" | "testnet") || "mainnet",
        status: (d.status as TonAgentWallet["status"]) || "active",
        createdBy: (d.createdBy as string) || "",
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
    };
}
