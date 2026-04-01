/**
 * GET   /api/v1/flow/agent-wallets  — List agent wallets for an org
 * POST  /api/v1/flow/agent-wallets  — Generate a new agent wallet
 * PATCH /api/v1/flow/agent-wallets  — Update wallet status
 */
import { NextRequest } from "next/server";
import {
    createFlowAgentWallet, getFlowAgentWallets, updateFlowAgentWalletStatus,
} from "@/lib/flow-agent-wallet";
import { logFlowAudit } from "@/lib/flow-policy";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const wallets = await getFlowAgentWallets(orgId);
    return Response.json({ count: wallets.length, wallets });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, label, agentId, network, createdBy } = body as {
            orgId: string; label: string; agentId?: string;
            network?: "mainnet" | "testnet"; createdBy: string;
        };

        if (!orgId || !label || !createdBy) {
            return Response.json({ error: "orgId, label, and createdBy are required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        const { wallet, privateKeyHex } = await createFlowAgentWallet(orgId, createdBy, {
            label, agentId, network,
        });

        await logFlowAudit({
            orgId, event: "wallet_connected", paymentId: null, subscriptionId: null,
            fromAddress: wallet.address, toAddress: null, amount: null, txHash: null,
            policyResult: null, reviewedBy: createdBy,
            note: `Flow agent wallet generated: ${label} (${wallet.address})`,
        });

        return Response.json({
            wallet, privateKeyHex,
            warning: "Save this private key — it cannot be retrieved again from this API",
        }, { status: 201 });
    } catch (err) {
        console.error("[flow/agent-wallets POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, orgId, status, updatedBy } = body as {
            id: string; orgId: string; status: "active" | "frozen" | "retired"; updatedBy: string;
        };

        if (!id || !orgId || !status) {
            return Response.json({ error: "id, orgId, and status are required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        await updateFlowAgentWalletStatus(id, status);

        await logFlowAudit({
            orgId, event: "wallet_status_changed", paymentId: null, subscriptionId: null,
            fromAddress: null, toAddress: null, amount: null, txHash: null,
            policyResult: null, reviewedBy: updatedBy,
            note: `Flow agent wallet ${id} status changed to ${status}`,
        });

        return Response.json({ id, status });
    } catch (err) {
        console.error("[flow/agent-wallets PATCH]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
