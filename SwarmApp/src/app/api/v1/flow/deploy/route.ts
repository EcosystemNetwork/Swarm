/**
 * GET  /api/v1/flow/deploy  — List deployments for an org
 * POST /api/v1/flow/deploy  — Create a new deployment request
 */
import { NextRequest } from "next/server";
import {
    createFlowDeployment, getFlowDeployments, estimateFlowDeployCost,
    type FlowDeployType, type FlowDeployConfig,
} from "@/lib/flow-deploy";
import { logFlowAudit } from "@/lib/flow-policy";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const orgId = url.searchParams.get("orgId");
    const typeFilter = url.searchParams.get("type") as FlowDeployType | null;
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);

    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const cursor = url.searchParams.get("cursor") || undefined;
    const { deployments, nextCursor } = await getFlowDeployments(orgId, limit, cursor, typeFilter || undefined);
    return Response.json({ count: deployments.length, deployments, nextCursor });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            orgId, type, name, description, deployerAddress,
            network, config, createdBy, agentId,
        } = body as {
            orgId: string; type: FlowDeployType; name: string; description: string;
            deployerAddress: string; network?: "mainnet" | "testnet";
            config: FlowDeployConfig; createdBy: string; agentId?: string;
        };

        if (!orgId || !type || !name || !deployerAddress || !createdBy) {
            return Response.json({ error: "orgId, type, name, deployerAddress, and createdBy are required" }, { status: 400 });
        }

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        const deployment = await createFlowDeployment({
            orgId, type, status: "pending", name,
            description: description || "", deployerAddress,
            network: network || "testnet",
            contractAddress: null, txHash: null, sourceCode: null,
            config, estimatedCost: estimateFlowDeployCost(type),
            actualCost: null, createdBy, agentId: agentId || null,
            errorMessage: null,
        });

        await logFlowAudit({
            orgId, event: "deployment_created", paymentId: null, subscriptionId: null,
            fromAddress: deployerAddress, toAddress: null, amount: deployment.estimatedCost,
            txHash: null, policyResult: null, reviewedBy: createdBy,
            note: `Deployment created: ${name} (${type})`,
        });

        return Response.json({ deployment }, { status: 201 });
    } catch (err) {
        console.error("[flow/deploy POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
