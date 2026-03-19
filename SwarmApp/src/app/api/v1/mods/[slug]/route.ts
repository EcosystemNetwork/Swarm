/**
 * GET /api/v1/mods/:slug
 *
 * Get a single mod by slug, including its capabilities.
 */
import { NextRequest } from "next/server";
import { getModBySlug, getModCapabilities } from "@/lib/skills";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const mod = getModBySlug(slug);

    if (!mod) {
        return Response.json({ error: "Mod not found" }, { status: 404 });
    }

    const capabilities = getModCapabilities(mod.id);

    return Response.json({ mod, capabilities });
}
