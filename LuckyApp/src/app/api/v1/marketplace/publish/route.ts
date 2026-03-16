/**
 * POST /api/v1/marketplace/publish
 *
 * Unified publish endpoint for all marketplace item types.
 * Agents, humans, or companies can publish skills, plugins, skins, mods, and personas.
 *
 * Auth: x-wallet-address header (wallet-based) or platform admin secret (auto-approves).
 */
import { NextRequest } from "next/server";
import { getWalletAddress, requirePlatformAdmin } from "@/lib/auth-guard";
import {
    submitMarketItem,
    publishAgentPackage,
    type MarketItemType,
    type MarketPricing,
    type AgentDistribution,
} from "@/lib/skills";

const VALID_TYPES: MarketItemType[] = ["mod", "plugin", "skill", "skin", "agent"];

export async function POST(req: NextRequest) {
    // Auth — wallet or platform admin
    const wallet = getWalletAddress(req);
    const admin = requirePlatformAdmin(req);
    if (!wallet && !admin.ok) {
        return Response.json(
            { error: "Authentication required. Provide x-wallet-address header or platform admin secret." },
            { status: 401 },
        );
    }
    const publisherWallet = wallet || "platform-admin";

    // Parse body
    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Validate required fields
    const name = (body.name as string)?.trim().slice(0, 100);
    const type = body.type as string;
    const category = (body.category as string)?.trim().slice(0, 50);
    const icon = (body.icon as string)?.trim().slice(0, 10);
    const description = (body.description as string)?.trim().slice(0, 2000);

    if (!name || !type || !category || !icon || !description) {
        return Response.json(
            { error: "Required fields: name, type, category, icon, description" },
            { status: 400 },
        );
    }

    if (!VALID_TYPES.includes(type as MarketItemType)) {
        return Response.json(
            { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
            { status: 400 },
        );
    }

    const version = ((body.version as string) || "1.0.0").trim().slice(0, 20);
    const tags = Array.isArray(body.tags)
        ? (body.tags as string[]).map(t => String(t).trim().slice(0, 50)).filter(Boolean).slice(0, 20)
        : [];
    const requiredKeys = Array.isArray(body.requiredKeys)
        ? (body.requiredKeys as string[]).map(k => String(k).trim()).filter(Boolean)
        : undefined;
    const publisherName = ((body.publisherName as string) || publisherWallet.slice(0, 8) + "...").trim();

    try {
        let id: string;
        let status: string;

        if (type === "agent") {
            // Agent/Persona publishing — uses publishAgentPackage()
            const identity = body.identity as Record<string, unknown> | undefined;
            const agentPricing = body.agentPricing as Record<string, unknown> | undefined;
            const distributions = Array.isArray(body.distributions)
                ? (body.distributions as string[]).filter(d => ["config", "rental", "hire"].includes(d)) as AgentDistribution[]
                : ["config" as AgentDistribution];

            id = await publishAgentPackage({
                slug: name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
                name,
                version,
                description,
                longDescription: (body.longDescription as string)?.trim().slice(0, 5000) || undefined,
                author: publisherName,
                authorWallet: publisherWallet,
                icon,
                category: category.toLowerCase().replace(/\s+/g, "-") as "general",
                tags,
                distributions,
                pricing: {
                    configPurchase: agentPricing?.configPurchase as number | undefined,
                    rentalMonthly: agentPricing?.rentalMonthly as number | undefined,
                    rentalUsage: agentPricing?.rentalUsage as number | undefined,
                    rentalPerformance: agentPricing?.rentalPerformance as number | undefined,
                    hirePerTask: agentPricing?.hirePerTask as number | undefined,
                    currency: ((agentPricing?.currency as string) === "HBAR" ? "HBAR" : "USD"),
                },
                identity: {
                    agentType: (identity?.agentType as string) || "General",
                    persona: (identity?.persona as string) || description,
                    personality: Array.isArray(identity?.personality) ? identity.personality as string[] : undefined,
                    rules: Array.isArray(identity?.rules) ? identity.rules as string[] : undefined,
                    systemPrompt: (identity?.systemPrompt as string) || undefined,
                },
                requiredSkills: Array.isArray(body.requiredSkills) ? body.requiredSkills as string[] : [],
                requiredMods: Array.isArray(body.requiredMods) ? body.requiredMods as string[] : undefined,
                requiredKeys,
                soulTemplate: body.soulTemplate as import("@/lib/soul").SOULConfig | undefined,
                workflows: Array.isArray(body.workflows) ? body.workflows as [] : undefined,
                policy: body.policy as undefined,
                memory: body.memory as undefined,
                source: admin.ok ? "verified" : "community",
                creatorRevShare: 0.85,
            });
            status = "review";
        } else {
            // Standard item — mod, plugin, skill, skin
            const pricing: MarketPricing = (body.pricing as MarketPricing) || { model: "free" as const };

            id = await submitMarketItem({
                name,
                type: type as MarketItemType,
                category,
                icon,
                description,
                longDescription: (body.longDescription as string)?.trim().slice(0, 5000) || undefined,
                version,
                tags,
                requiredKeys,
                pricing,
                submittedBy: publisherWallet,
                submittedByName: publisherName,
                skinConfig: body.skinConfig as { colors?: Record<string, string>; features?: string[] } | undefined,
                modManifest: body.modManifest as { tools?: string[]; workflows?: string[]; agentSkills?: string[] } | undefined,
            });
            status = "pending";
        }

        return Response.json({
            published: true,
            id,
            type,
            status,
            name,
        });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to publish" },
            { status: 500 },
        );
    }
}
