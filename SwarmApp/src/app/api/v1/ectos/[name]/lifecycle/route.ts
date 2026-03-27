/**
 * POST /api/v1/ectos/:name/lifecycle
 *
 * Ecto lifecycle actions: kill, wake, save, compact, nudge.
 * Body: { action: "kill" | "wake" | "save" | "compact" | "nudge", ...params }
 */

import { NextRequest, NextResponse } from "next/server";

const ECTO_API = process.env.ECTO_API_URL || "http://localhost:8008";

const VALID_ACTIONS = ["kill", "wake", "save", "compact", "abort", "nudge", "steer"] as const;

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const { name } = await params;
    const body = await req.json();
    const { action, ...payload } = body;

    if (!action || !VALID_ACTIONS.includes(action)) {
        return NextResponse.json(
            { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` },
            { status: 400 }
        );
    }

    try {
        const resp = await fetch(`${ECTO_API}/api/ectos/${name}/${action}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const data = await resp.json();
        return NextResponse.json(data, { status: resp.status });
    } catch (err: any) {
        return NextResponse.json({ error: "Ecto API unreachable" }, { status: 502 });
    }
}
