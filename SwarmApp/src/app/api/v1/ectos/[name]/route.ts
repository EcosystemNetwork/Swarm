/**
 * GET    /api/v1/ectos/:name — Get ecto details
 * DELETE /api/v1/ectos/:name — Remove ecto permanently
 *
 * Proxies to the Ecto API server.
 */

import { NextRequest, NextResponse } from "next/server";

const ECTO_API = process.env.ECTO_API_URL || "http://localhost:8008";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const { name } = await params;
    try {
        const resp = await fetch(`${ECTO_API}/api/ectos/${name}`);
        const data = await resp.json();
        return NextResponse.json(data, { status: resp.status });
    } catch (err: any) {
        return NextResponse.json({ error: "Ecto API unreachable" }, { status: 502 });
    }
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const { name } = await params;
    try {
        const resp = await fetch(`${ECTO_API}/api/ectos/${name}`, { method: "DELETE" });
        const data = await resp.json();
        return NextResponse.json(data, { status: resp.status });
    } catch (err: any) {
        return NextResponse.json({ error: "Ecto API unreachable" }, { status: 502 });
    }
}
