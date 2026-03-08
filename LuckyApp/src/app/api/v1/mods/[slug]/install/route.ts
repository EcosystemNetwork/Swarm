/**
 * POST /api/v1/mods/:slug/install
 *
 * Install a mod for an org.
 * Body: { orgId, installedBy, enabledCapabilities? }
 */
import { NextRequest } from "next/server";
import { getModBySlug, installMod } from "@/lib/skills";
import { requireOrgMember, forbidden } from "@/lib/auth-guard";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const mod = getModBySlug(slug);

    if (!mod) {
        return Response.json({ error: "Mod not found" }, { status: 404 });
    }

    try {
        const body = await req.json();
        const { orgId, installedBy, enabledCapabilities } = body;

        if (!orgId || !installedBy) {
            return Response.json(
                { error: "orgId and installedBy are required" },
                { status: 400 },
            );
        }

        // Auth: require org membership to install mods
        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return forbidden(auth.error);

        const installationId = await installMod(
            mod.id,
            orgId,
            installedBy,
            enabledCapabilities,
        );

        return Response.json({
            installed: true,
            installationId,
            modId: mod.id,
            slug: mod.slug,
            enabledCapabilities: enabledCapabilities ?? mod.capabilities,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Internal server error";
        const isDuplicate = message.includes("already installed");
        const isSubscription = message.includes("subscription required");
        const isInvalidCap = message.includes("Invalid capabilities");
        const status = isDuplicate ? 409 : isSubscription ? 402 : isInvalidCap ? 422 : 500;
        if (status === 500) console.error("mods/install error:", err);
        return Response.json({ error: message }, { status });
    }
}
