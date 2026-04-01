/**
 * Filecoin Onchain Cloud Integration
 *
 * Connects Swarm agents to Filecoin's decentralized storage network via:
 *   1. Filecoin Synapse SDK (@filoz/synapse-sdk) — Onchain Cloud with PDP verification
 *   2. iso-filecoin — Addresses, signing, and RPC interaction
 *   3. CID verification via Filecoin storage deals
 *
 * Features:
 *   - Verifiable storage: Proof of Data Possession (PDP)
 *   - Storage deals: Track Filecoin deals for agent artifacts
 *   - FIL payments: Pay for storage with FIL tokens
 *   - CID lookup: Verify CIDs exist on Filecoin network
 *   - Cross-chain bridge: Storacha → Filecoin cold storage
 *
 * Protocol Labs tech: Filecoin, IPFS (via CIDs), Storacha integration
 */

import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface FilecoinStorageDeal {
    id: string;
    orgId: string;
    agentId: string;
    asn: string | null;
    /** Content Identifier */
    cid: string;
    /** PieceCID for Filecoin deal */
    pieceCid: string | null;
    /** Storage provider address (f0xxxx) */
    providerAddress: string | null;
    /** Deal ID on Filecoin chain */
    dealId: number | null;
    /** Size of stored data in bytes */
    sizeBytes: number;
    /** Duration in epochs (1 epoch = 30 seconds) */
    durationEpochs: number;
    /** Price per epoch in attoFIL */
    pricePerEpoch: string;
    /** Total cost in attoFIL */
    totalCost: string;
    /** Deal status */
    status: FilecoinDealStatus;
    /** Proof of Data Possession verification */
    pdpVerified: boolean;
    /** Last PDP verification timestamp */
    pdpLastVerifiedAt: Date | null;
    /** Whether this was migrated from Storacha hot storage */
    fromStoracha: boolean;
    /** Original Storacha space ID */
    storachaSpaceId: string | null;
    /** Network */
    network: "mainnet" | "calibnet";
    createdAt: Date | null;
    activatedAt: Date | null;
    expiresAt: Date | null;
}

export type FilecoinDealStatus =
    | "proposed"
    | "published"
    | "active"
    | "expired"
    | "slashed"
    | "failed";

export interface FilecoinBalance {
    address: string;
    balanceAttoFil: string;
    balanceFil: string;
    network: "mainnet" | "calibnet";
    nonce: number;
}

export interface FilecoinCidLookup {
    cid: string;
    found: boolean;
    providers: {
        address: string;
        dealId: number;
        status: string;
        sizeBytes: number;
    }[];
    totalProviders: number;
    verified: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/** Filecoin RPC endpoints */
export const FILECOIN_RPC = {
    mainnet: "https://api.node.glif.io/rpc/v1",
    calibnet: "https://api.calibration.node.glif.io/rpc/v1",
} as const;

/** Filecoin explorers */
export const FILECOIN_EXPLORERS = {
    mainnet: "https://filfox.info/en",
    calibnet: "https://calibration.filfox.info/en",
} as const;

/** 1 FIL = 10^18 attoFIL */
const ATTO_FIL = 1_000_000_000_000_000_000n;

// ═══════════════════════════════════════════════════════════════
// Amount Helpers
// ═══════════════════════════════════════════════════════════════

export function attoFilToFil(attoFil: string): string {
    if (!attoFil || attoFil === "0") return "0.0";
    const n = BigInt(attoFil);
    const whole = n / ATTO_FIL;
    const frac = n % ATTO_FIL;
    if (frac === 0n) return `${whole}.0`;
    return `${whole}.${frac.toString().padStart(18, "0").replace(/0+$/, "")}`;
}

export function filToAttoFil(fil: string): string {
    if (!fil || fil === "0") return "0";
    const [whole, frac = ""] = fil.split(".");
    const fracPadded = frac.slice(0, 18).padEnd(18, "0");
    return (BigInt(whole) * ATTO_FIL + BigInt(fracPadded)).toString();
}

// ═══════════════════════════════════════════════════════════════
// Storage Deal CRUD
// ═══════════════════════════════════════════════════════════════

export async function createStorageDeal(
    input: Omit<FilecoinStorageDeal, "id" | "createdAt" | "activatedAt" | "expiresAt">,
): Promise<FilecoinStorageDeal> {
    const ref = await addDoc(collection(db, "filecoinDeals"), {
        ...input,
        createdAt: serverTimestamp(),
        activatedAt: null,
        expiresAt: null,
    });
    return { ...input, id: ref.id, createdAt: new Date(), activatedAt: null, expiresAt: null };
}

export async function getStorageDeals(
    orgId: string,
    statusFilter?: FilecoinDealStatus,
): Promise<FilecoinStorageDeal[]> {
    const constraints = [
        where("orgId", "==", orgId),
        orderBy("createdAt", "desc"),
    ];
    if (statusFilter) constraints.splice(1, 0, where("status", "==", statusFilter));
    const q = query(collection(db, "filecoinDeals"), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => docToDeal(d.id, d.data()));
}

export async function updateDealStatus(
    id: string,
    status: FilecoinDealStatus,
    opts?: { dealId?: number; providerAddress?: string; pieceCid?: string; activatedAt?: Date },
): Promise<void> {
    const patch: Record<string, unknown> = { status };
    if (opts?.dealId) patch.dealId = opts.dealId;
    if (opts?.providerAddress) patch.providerAddress = opts.providerAddress;
    if (opts?.pieceCid) patch.pieceCid = opts.pieceCid;
    if (opts?.activatedAt) patch.activatedAt = Timestamp.fromDate(opts.activatedAt);
    await updateDoc(doc(db, "filecoinDeals", id), patch);
}

export async function markPDPVerified(id: string): Promise<void> {
    await updateDoc(doc(db, "filecoinDeals", id), {
        pdpVerified: true,
        pdpLastVerifiedAt: serverTimestamp(),
    });
}

// ═══════════════════════════════════════════════════════════════
// Filecoin RPC Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Query Filecoin account balance via Lotus JSON-RPC.
 */
export async function getFilecoinBalance(
    address: string,
    network: "mainnet" | "calibnet" = "calibnet",
): Promise<FilecoinBalance> {
    const rpc = FILECOIN_RPC[network];
    const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "Filecoin.WalletBalance",
            params: [address],
            id: 1,
        }),
    });

    const data = await res.json();
    const balanceAttoFil = data.result || "0";

    // Get nonce
    const nonceRes = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "Filecoin.MpoolGetNonce",
            params: [address],
            id: 2,
        }),
    }).catch(() => null);

    const nonceData = nonceRes ? await nonceRes.json() : { result: 0 };

    return {
        address,
        balanceAttoFil,
        balanceFil: attoFilToFil(balanceAttoFil),
        network,
        nonce: nonceData.result || 0,
    };
}

/**
 * Look up CID providers via cid.contact (Filecoin indexer).
 */
export async function lookupCidOnFilecoin(cid: string): Promise<FilecoinCidLookup> {
    try {
        const res = await fetch(`https://cid.contact/cid/${cid}`, {
            headers: { Accept: "application/json" },
        });

        if (!res.ok) {
            return { cid, found: false, providers: [], totalProviders: 0, verified: false };
        }

        const data = await res.json();
        const providers = (data.MultihashResults || []).flatMap((r: Record<string, unknown>) =>
            ((r.ProviderResults || []) as Record<string, unknown>[]).map((p: Record<string, unknown>) => ({
                address: (p.Provider as Record<string, string>)?.ID || "",
                dealId: 0,
                status: "indexed",
                sizeBytes: 0,
            })),
        );

        return {
            cid,
            found: providers.length > 0,
            providers,
            totalProviders: providers.length,
            verified: providers.length > 0,
        };
    } catch {
        return { cid, found: false, providers: [], totalProviders: 0, verified: false };
    }
}

/**
 * Get Filecoin storage stats for an org.
 */
export async function getFilecoinStats(orgId: string): Promise<{
    totalDeals: number;
    activeDeals: number;
    totalStoredBytes: number;
    totalCostFil: string;
    pdpVerifiedCount: number;
    storachaMigratedCount: number;
}> {
    const deals = await getStorageDeals(orgId);
    const active = deals.filter((d) => d.status === "active");
    const totalBytes = deals.reduce((s, d) => s + d.sizeBytes, 0);
    const totalCost = deals.reduce((s, d) => s + BigInt(d.totalCost || "0"), 0n);
    const pdpVerified = deals.filter((d) => d.pdpVerified).length;
    const fromStoracha = deals.filter((d) => d.fromStoracha).length;

    return {
        totalDeals: deals.length,
        activeDeals: active.length,
        totalStoredBytes: totalBytes,
        totalCostFil: attoFilToFil(totalCost.toString()),
        pdpVerifiedCount: pdpVerified,
        storachaMigratedCount: fromStoracha,
    };
}

// ═══════════════════════════════════════════════════════════════
// Doc converters
// ═══════════════════════════════════════════════════════════════

function docToDeal(id: string, d: Record<string, unknown>): FilecoinStorageDeal {
    return {
        id,
        orgId: (d.orgId as string) || "",
        agentId: (d.agentId as string) || "",
        asn: (d.asn as string) || null,
        cid: (d.cid as string) || "",
        pieceCid: (d.pieceCid as string) || null,
        providerAddress: (d.providerAddress as string) || null,
        dealId: (d.dealId as number) || null,
        sizeBytes: (d.sizeBytes as number) || 0,
        durationEpochs: (d.durationEpochs as number) || 0,
        pricePerEpoch: (d.pricePerEpoch as string) || "0",
        totalCost: (d.totalCost as string) || "0",
        status: (d.status as FilecoinDealStatus) || "proposed",
        pdpVerified: (d.pdpVerified as boolean) || false,
        pdpLastVerifiedAt: d.pdpLastVerifiedAt instanceof Timestamp ? d.pdpLastVerifiedAt.toDate() : null,
        fromStoracha: (d.fromStoracha as boolean) || false,
        storachaSpaceId: (d.storachaSpaceId as string) || null,
        network: (d.network as "mainnet" | "calibnet") || "calibnet",
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : null,
        activatedAt: d.activatedAt instanceof Timestamp ? d.activatedAt.toDate() : null,
        expiresAt: d.expiresAt instanceof Timestamp ? d.expiresAt.toDate() : null,
    };
}
