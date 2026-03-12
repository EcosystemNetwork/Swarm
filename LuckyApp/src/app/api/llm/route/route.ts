/**
 * POST /api/llm/route
 *
 * Intelligent LLM model routing with fallbacks and cost optimization
 *
 * Body: {
 *   orgId: string
 *   agentId: string
 *   preferredModel: ModelName
 *   estimatedTokensIn: number
 *   estimatedTokensOut: number
 *   strategy?: RoutingStrategy
 * }
 *
 * Returns: {
 *   selectedModel: ModelName
 *   reason: RoutingReason
 *   costSavings: number
 *   fallbackChain: ModelName[]
 * }
 */

import { NextRequest } from "next/server";
import {
  routeRequest,
  type RouteRequest,
  type RoutingStrategy,
} from "@/lib/model-router";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orgId = body.orgId as string | undefined;
  const agentId = body.agentId as string | undefined;
  const preferredModel = body.preferredModel as string | undefined;
  const estimatedTokensIn = body.estimatedTokensIn as number | undefined;
  const estimatedTokensOut = body.estimatedTokensOut as number | undefined;
  const strategy = body.strategy as RoutingStrategy | undefined;

  if (!orgId || !agentId || !preferredModel || !estimatedTokensIn || !estimatedTokensOut) {
    return Response.json(
      { error: "orgId, agentId, preferredModel, estimatedTokensIn, and estimatedTokensOut are required" },
      { status: 400 }
    );
  }

  try {
    const routeReq: RouteRequest = {
      orgId,
      agentId,
      preferredModel: preferredModel as any,
      estimatedTokensIn,
      estimatedTokensOut,
    };

    const result = await routeRequest(routeReq, strategy);

    return Response.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    console.error("Model routing error:", err);
    return Response.json(
      { error: "Failed to route request" },
      { status: 500 }
    );
  }
}
