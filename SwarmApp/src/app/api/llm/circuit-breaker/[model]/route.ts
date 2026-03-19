/**
 * PATCH /api/llm/circuit-breaker/:model
 *
 * Manually reset circuit breaker for a model
 *
 * Returns: { ok: true, model: string }
 */

import { NextRequest } from "next/server";
import { resetCircuitBreaker, type ModelName } from "@/lib/model-router";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ model: string }> }
) {
  const { model: modelParam } = await params;
  const model = modelParam as ModelName;

  if (!model) {
    return Response.json({ error: "Model name is required" }, { status: 400 });
  }

  try {
    await resetCircuitBreaker(model);

    return Response.json({
      ok: true,
      model,
      message: `Circuit breaker reset for ${model}`,
    });
  } catch (err) {
    console.error(`Error resetting circuit breaker for ${model}:`, err);
    return Response.json(
      { error: "Failed to reset circuit breaker" },
      { status: 500 }
    );
  }
}
