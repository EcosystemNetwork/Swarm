/**
 * POST /api/v1/ectos/:name/message — Send message to ecto (SSE streaming)
 *
 * Proxies the streaming response from the Ecto API as Server-Sent Events.
 */

import { NextRequest } from "next/server";

const ECTO_API = process.env.ECTO_API_URL || "http://localhost:8008";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const { name } = await params;
    const body = await req.json();

    if (!body.prompt) {
        return new Response(JSON.stringify({ error: "prompt required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const resp = await fetch(`${ECTO_API}/api/ectos/${name}/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const err = await resp.text();
            return new Response(err, { status: resp.status });
        }

        // Proxy the SSE stream
        return new Response(resp.body, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            },
        });
    } catch (err: any) {
        return new Response(
            JSON.stringify({ error: "Ecto API unreachable", details: err.message }),
            { status: 502, headers: { "Content-Type": "application/json" } }
        );
    }
}
