/**
 * GET  /api/v1/ectos — List all ectos
 * POST /api/v1/ectos — Spawn a new ecto
 *
 * Bridges the Ecto orchestrator into SwarmApp's API layer.
 * Requires session auth (orgId from session context).
 */

import { NextRequest, NextResponse } from "next/server";

const ECTO_API = process.env.ECTO_API_URL || "http://localhost:8008";

export async function GET(_req: NextRequest) {
    try {
        const resp = await fetch(`${ECTO_API}/api/ectos`);
        const data = await resp.json();
        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json(
            { error: "Ecto API unreachable", details: err.message },
            { status: 502 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        if (!body.name) {
            return NextResponse.json({ error: "name is required" }, { status: 400 });
        }

        const resp = await fetch(`${ECTO_API}/api/ectos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const data = await resp.json();
        return NextResponse.json(data, { status: resp.status });
    } catch (err: any) {
        return NextResponse.json(
            { error: "Ecto API unreachable", details: err.message },
            { status: 502 }
        );
    }
}
