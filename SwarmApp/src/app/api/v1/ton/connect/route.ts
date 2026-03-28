/**
 * POST /api/v1/ton/connect
 *
 * Save a verified TON wallet connection for an org or agent.
 * Called after the client receives a wallet address from TON Connect.
 * Does NOT verify ton_proof — call /api/v1/ton/verify for that.
 *
 * Body: { orgId, address, walletName?, network? }
 * Returns: { id, orgId, address, connectedAt }
 */
import { NextRequest } from "next/server";
import { collection, addDoc, getDocs, query, where, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logTonAudit } from "@/lib/ton-policy";
import { requireOrgMember } from "@/lib/auth-guard";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, address, walletName, network } = body as {
            orgId: string;
            address: string;
            walletName?: string;
            network?: string;
        };

        if (!orgId || !address) {
            return Response.json({ error: "orgId and address are required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        const wallet = address.trim();

        // Upsert — if wallet already registered for this org, return existing
        const q = query(
            collection(db, "tonWallets"),
            where("orgId", "==", orgId),
            where("address", "==", wallet),
        );
        const existing = await getDocs(q);
        if (!existing.empty) {
            const d = existing.docs[0];
            const data = d.data();
            return Response.json({
                id: d.id,
                orgId,
                address: wallet,
                verified: data.verified || false,
                connectedAt: data.connectedAt instanceof Timestamp ? data.connectedAt.toDate().toISOString() : null,
            });
        }

        const ref = await addDoc(collection(db, "tonWallets"), {
            orgId,
            address: wallet,
            walletName: walletName || null,
            network: network || "mainnet",
            verified: false,
            createdAt: serverTimestamp(),
        });

        await logTonAudit({
            orgId,
            event: "wallet_connected",
            paymentId: null,
            subscriptionId: null,
            fromAddress: wallet,
            toAddress: null,
            amountNano: null,
            txHash: null,
            policyResult: null,
            reviewedBy: null,
            note: `Wallet ${wallet} connected (${walletName || "unknown"})`,
        });

        return Response.json(
            { id: ref.id, orgId, address: wallet, verified: false, connectedAt: new Date().toISOString() },
            { status: 201 },
        );
    } catch (err) {
        console.error("[ton/connect]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const q = query(collection(db, "tonWallets"), where("orgId", "==", orgId));
    const snap = await getDocs(q);
    const wallets = snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            orgId: data.orgId,
            address: data.address,
            walletName: data.walletName || null,
            network: data.network || "mainnet",
            verified: data.verified || false,
            connectedAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : null,
        };
    });
    return Response.json({ wallets });
}
