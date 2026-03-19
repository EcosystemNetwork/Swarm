/**
 * GET /api/v1/marketplace/items
 *
 * Public browse endpoint for marketplace items.
 * Merges verified registry (Firestore-backed) + community items + marketplace agents.
 *
 * Query params:
 * - type: "mod" | "plugin" | "skill" | "skin" | "agent"
 * - category: string
 * - source: "verified" | "community"
 * - sort: "name" | "rating" | "installs" | "trending" (default: "name")
 * - q: search query
 * - limit: number (default: 50, max: 100)
 * - offset: number (default: 0)
 * - featured: "true" — only return featured items
 */
import { NextRequest } from "next/server";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getVerifiedItems } from "@/lib/verified-registry";
import { computeRankingScore } from "@/lib/submission-protocol";

interface BrowseItem {
    id: string;
    name: string;
    type: string;
    category: string;
    icon: string;
    description: string;
    version: string;
    source: "verified" | "community";
    author: string;
    tags: string[];
    pricing: { model: string; tiers?: unknown[] };
    installCount: number;
    avgRating: number;
    ratingCount: number;
    featured: boolean;
}

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const typeFilter = url.searchParams.get("type");
    const categoryFilter = url.searchParams.get("category");
    const sourceFilter = url.searchParams.get("source");
    const sort = url.searchParams.get("sort") || "name";
    const searchQuery = url.searchParams.get("q")?.toLowerCase();
    const featuredOnly = url.searchParams.get("featured") === "true";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 100);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

    try {
        const items: BrowseItem[] = [];

        // 1. Verified items (Firestore-backed, SKILL_REGISTRY fallback)
        if (sourceFilter !== "community") {
            const verified = await getVerifiedItems({
                type: typeFilter,
                category: categoryFilter,
                featured: featuredOnly || undefined,
            });
            for (const v of verified) {
                items.push({
                    id: v.id,
                    name: v.name,
                    type: v.type,
                    category: v.category,
                    icon: v.icon,
                    description: v.description,
                    version: v.version,
                    source: "verified",
                    author: v.author,
                    tags: v.tags,
                    pricing: v.pricing,
                    installCount: v.installCount,
                    avgRating: v.avgRating,
                    ratingCount: v.ratingCount,
                    featured: v.featured,
                });
            }
        }

        // 2. Community items (approved only)
        if (sourceFilter !== "verified" && typeFilter !== "agent") {
            const constraints = [where("status", "==", "approved")];
            if (typeFilter) constraints.push(where("type", "==", typeFilter));
            if (featuredOnly) constraints.push(where("featured", "==", true));
            const snap = await getDocs(query(collection(db, "communityMarketItems"), ...constraints));
            for (const d of snap.docs) {
                const data = d.data();
                if (categoryFilter && data.category !== categoryFilter) continue;
                items.push({
                    id: d.id,
                    name: data.name || "Untitled",
                    type: data.type || "mod",
                    category: data.category || "general",
                    icon: data.icon || "",
                    description: data.description || "",
                    version: data.version || "1.0.0",
                    source: "community",
                    author: data.submittedByName || (data.submittedBy as string || "").slice(0, 8) + "...",
                    tags: data.tags || [],
                    pricing: data.pricing || { model: "free" },
                    installCount: data.installCount || 0,
                    avgRating: data.avgRating || 0,
                    ratingCount: data.ratingCount || 0,
                    featured: data.featured || false,
                });
            }
        }

        // 3. Marketplace agents (approved only)
        if (sourceFilter !== "verified" && (!typeFilter || typeFilter === "agent")) {
            const agentConstraints = [where("status", "==", "approved")];
            if (featuredOnly) agentConstraints.push(where("featured", "==", true));
            const agentSnap = await getDocs(
                query(collection(db, "marketplaceAgents"), ...agentConstraints),
            );
            for (const d of agentSnap.docs) {
                const data = d.data();
                if (categoryFilter && data.category !== categoryFilter) continue;
                items.push({
                    id: d.id,
                    name: data.name || "Untitled",
                    type: "agent",
                    category: data.category || "general",
                    icon: data.icon || "",
                    description: data.description || "",
                    version: data.version || "1.0.0",
                    source: data.source || "community",
                    author: data.author || "",
                    tags: data.tags || [],
                    pricing: { model: "agent" },
                    installCount: data.installCount || 0,
                    avgRating: data.avgRating || 0,
                    ratingCount: data.ratingCount || 0,
                    featured: data.featured || false,
                });
            }
        }

        // 4. Search filter
        let filtered = items;
        if (searchQuery) {
            filtered = items.filter(
                (i) =>
                    i.name.toLowerCase().includes(searchQuery) ||
                    i.description.toLowerCase().includes(searchQuery) ||
                    i.tags.some((t) => t.toLowerCase().includes(searchQuery)),
            );
        }

        // 5. Sort
        filtered.sort((a, b) => {
            switch (sort) {
                case "rating":
                    return b.avgRating - a.avgRating || b.ratingCount - a.ratingCount;
                case "installs":
                    return b.installCount - a.installCount;
                case "trending": {
                    const scoreA = computeRankingScore({
                        installCount: a.installCount, avgRating: a.avgRating,
                        ratingCount: a.ratingCount, publishedAt: null, publisherTier: 0,
                    });
                    const scoreB = computeRankingScore({
                        installCount: b.installCount, avgRating: b.avgRating,
                        ratingCount: b.ratingCount, publishedAt: null, publisherTier: 0,
                    });
                    return scoreB - scoreA;
                }
                default:
                    return a.name.localeCompare(b.name);
            }
        });

        // 6. Paginate
        const total = filtered.length;
        const paged = filtered.slice(offset, offset + limit);

        return Response.json({
            items: paged,
            total,
            limit,
            offset,
            hasMore: offset + limit < total,
        });
    } catch (err) {
        return Response.json(
            { error: err instanceof Error ? err.message : "Failed to fetch items" },
            { status: 500 },
        );
    }
}
