/**
 * POST /api/v1/solana/wallet/generate
 *
 * Generate a deterministic Solana wallet for an agent.
 * Derives a keypair from SOLANA_PLATFORM_KEY + agentId, stores the
 * public key on the agent document, and returns the address.
 *
 * Body: { agentId, orgId }
 * Returns: { agentId, solanaAddress }
 */
import { NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/auth-guard";
import { getAgent, updateAgent, type Agent } from "@/lib/firestore";
import { deriveAgentKeypair } from "@/lib/solana-keys";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agentId, orgId } = body as { agentId?: string; orgId?: string };

  if (!agentId || !orgId) {
    return Response.json(
      { error: "agentId and orgId are required" },
      { status: 400 },
    );
  }

  const auth = await requireOrgMember(request, orgId);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status || 403 });
  }

  try {
    const agent = await getAgent(agentId);
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }
    if (agent.orgId !== orgId) {
      return Response.json(
        { error: "Agent does not belong to this organization" },
        { status: 403 },
      );
    }

    // Return existing address if already generated
    if (agent.solanaAddress) {
      return Response.json({ agentId, solanaAddress: agent.solanaAddress });
    }

    // Derive deterministic keypair and store public key
    const keypair = deriveAgentKeypair(agentId);
    const solanaAddress = keypair.publicKey.toBase58();

    await updateAgent(agentId, { solanaAddress } as Partial<Agent>);

    return Response.json({ agentId, solanaAddress });
  } catch (err) {
    console.error("Wallet generation error:", err);
    const message = err instanceof Error ? err.message : "Wallet generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
