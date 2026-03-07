/**
 * Market — Types + Registry
 *
 * Browse, install, and manage agent mods, plugins, and skills.
 * Items are stored in Firestore per-org, with a static registry
 * of available items from the marketplace.
 */

import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    getDocs,
    query,
    where,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { CHAINLINK_MANIFEST } from "./chainlink";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type MarketItemType = "mod" | "plugin" | "skill";
export type MarketItemSource = "verified" | "community";
export type PricingModel = "free" | "subscription";
export type SubscriptionPlan = "monthly" | "yearly" | "lifetime";

export interface PricingTier {
    plan: SubscriptionPlan;
    price: number;
    currency: string; // "USD" | "HBAR"
}

export interface MarketPricing {
    model: PricingModel;
    tiers?: PricingTier[];
}

// ── Mod Manifest types (reusable for all vendor mods) ──

export interface ModTool {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    status: "active" | "coming_soon";
    usageExample?: string;
}

export interface ModWorkflow {
    id: string;
    name: string;
    description: string;
    icon: string;
    tags: string[];
    steps: string[];
    estimatedTime?: string;
}

export interface ModExample {
    id: string;
    name: string;
    description: string;
    icon: string;
    tags: string[];
    codeSnippet?: string;
    language?: string;
}

export interface ModAgentSkill {
    id: string;
    name: string;
    description: string;
    type: "skill";
    invocation: string;
    exampleInput?: string;
    exampleOutput?: string;
}

export interface ModManifest {
    tools: ModTool[];
    workflows: ModWorkflow[];
    examples: ModExample[];
    agentSkills: ModAgentSkill[];
}

export interface Skill {
    id: string;
    name: string;
    description: string;
    type: MarketItemType;
    source: MarketItemSource;
    category: string;
    icon: string;
    version: string;
    author: string;
    /** What env vars / API keys this skill needs */
    requiredKeys?: string[];
    /** Tags for search */
    tags: string[];
    /** Pricing model */
    pricing: MarketPricing;
    /** Is this installed for the org? */
    installed?: boolean;
    /** Is it enabled? */
    enabled?: boolean;
    /** Install date */
    installedAt?: Date | null;
    /** If present, this item adds a sidebar tab when installed */
    sidebarConfig?: {
        sectionId: string;
        label: string;
        href: string;
        iconName: string;
    };
    /** Mod manifest — tools, workflows, examples, agent skills */
    modManifest?: ModManifest;
}

export interface SkillBundle {
    id: string;
    name: string;
    description: string;
    icon: string;
    skillIds: string[];
}

/** An item the org has acquired/owns in their inventory */
export interface OwnedItem {
    id: string;             // Firestore doc ID
    orgId: string;
    skillId: string;        // reference to marketplace item
    enabled: boolean;
    config?: Record<string, string>;  // API keys, settings
    installedAt: Date | null;
    installedBy: string;
}

/** @deprecated Use OwnedItem instead */
export type InstalledSkill = OwnedItem;

/** A skill/plugin installed on a specific agent */
export interface AgentSkill {
    id: string;             // Firestore doc ID
    agentId: string;
    skillId: string;        // reference to marketplace item
    orgId: string;
    installedAt: Date | null;
    installedBy: string;
}

// ═══════════════════════════════════════════════════════════════
// Marketplace Registry (static — would come from API in prod)
// ═══════════════════════════════════════════════════════════════

export const SKILL_REGISTRY: Skill[] = [
    // ── Mods ──
    {
        id: "chainlink-cre",
        name: "Chainlink",
        description: "Developer tools to implement and automate CRE workflows.",
        type: "mod",
        source: "verified",
        category: "Web3",
        icon: "🔗",
        version: "1.0.0",
        author: "Swarm Core",
        tags: ["chainlink", "oracle", "automation", "cre", "web3"],
        pricing: { model: "free" },
        sidebarConfig: {
            sectionId: "intelligence",
            label: "Chainlink",
            href: "/chainlink",
            iconName: "Link",
        },
        modManifest: CHAINLINK_MANIFEST,
    },

    // ── Plugins ──
    {
        id: "github-tools",
        name: "GitHub Integration",
        description: "Interact with GitHub repos — create issues, PRs, read code, manage workflows.",
        type: "plugin",
        source: "verified",
        category: "Developer",
        icon: "🐙",
        version: "1.3.0",
        author: "Swarm Core",
        requiredKeys: ["GITHUB_TOKEN"],
        tags: ["github", "git", "code", "pr", "issues"],
        pricing: { model: "free" },
    },
    {
        id: "slack-notify",
        name: "Slack Notifications",
        description: "Send notifications and messages to Slack channels and users.",
        type: "plugin",
        source: "verified",
        category: "Communication",
        icon: "💬",
        version: "1.0.0",
        author: "Swarm Core",
        requiredKeys: ["SLACK_BOT_TOKEN"],
        tags: ["slack", "notifications", "messaging"],
        pricing: { model: "free" },
    },
    {
        id: "email-sender",
        name: "Email Sender",
        description: "Compose and send emails via SMTP or SendGrid. Supports templates and attachments.",
        type: "plugin",
        source: "verified",
        category: "Communication",
        icon: "📧",
        version: "1.0.0",
        author: "Swarm Core",
        requiredKeys: ["SENDGRID_API_KEY"],
        tags: ["email", "smtp", "sendgrid", "notifications"],
        pricing: { model: "free" },
    },
    {
        id: "calendar-sync",
        name: "Calendar Sync",
        description: "Read and create calendar events. Integrates with Google Calendar and Outlook.",
        type: "plugin",
        source: "verified",
        category: "Productivity",
        icon: "📅",
        version: "1.0.0",
        author: "Swarm Core",
        requiredKeys: ["GOOGLE_CALENDAR_KEY"],
        tags: ["calendar", "events", "scheduling"],
        pricing: { model: "free" },
    },
    {
        id: "blockchain-tools",
        name: "Blockchain Tools",
        description: "Interact with EVM chains — read balances, send transactions, query contracts.",
        type: "plugin",
        source: "verified",
        category: "Web3",
        icon: "⛓️",
        version: "1.0.0",
        author: "Swarm Core",
        tags: ["blockchain", "web3", "ethereum", "transactions"],
        pricing: { model: "free" },
    },

    // ── Skills ──
    {
        id: "web-search",
        name: "Web Search",
        description: "Search the web for real-time information. Uses Tavily or SerpAPI for comprehensive results.",
        type: "skill",
        source: "verified",
        category: "Research",
        icon: "🔍",
        version: "1.2.0",
        author: "Swarm Core",
        requiredKeys: ["TAVILY_API_KEY"],
        tags: ["search", "research", "web", "news"],
        pricing: { model: "free" },
    },
    {
        id: "code-interpreter",
        name: "Code Interpreter",
        description: "Execute Python and JavaScript code in a sandboxed environment. Great for data analysis, math, and scripting.",
        type: "skill",
        source: "verified",
        category: "Developer",
        icon: "💻",
        version: "2.0.1",
        author: "Swarm Core",
        tags: ["code", "python", "javascript", "analysis"],
        pricing: { model: "free" },
    },
    {
        id: "file-manager",
        name: "File Manager",
        description: "Read, write, and manage files. Supports text files, CSVs, JSON, and more.",
        type: "skill",
        source: "verified",
        category: "Developer",
        icon: "📁",
        version: "1.1.0",
        author: "Swarm Core",
        tags: ["files", "filesystem", "csv", "json"],
        pricing: { model: "free" },
    },
    {
        id: "image-gen",
        name: "Image Generator",
        description: "Generate images from text prompts using DALL-E 3 or Stable Diffusion.",
        type: "skill",
        source: "verified",
        category: "Creative",
        icon: "🎨",
        version: "1.0.0",
        author: "Swarm Core",
        requiredKeys: ["OPENAI_API_KEY"],
        tags: ["image", "art", "generation", "dalle"],
        pricing: { model: "free" },
    },
    {
        id: "pdf-reader",
        name: "PDF Reader",
        description: "Extract text, tables, and metadata from PDF documents.",
        type: "skill",
        source: "verified",
        category: "Research",
        icon: "📄",
        version: "1.1.0",
        author: "Swarm Core",
        tags: ["pdf", "documents", "text", "extraction"],
        pricing: { model: "free" },
    },
    {
        id: "data-viz",
        name: "Data Visualization",
        description: "Create charts, graphs, and dashboards from data using Chart.js and D3.",
        type: "skill",
        source: "verified",
        category: "Analytics",
        icon: "📊",
        version: "1.0.0",
        author: "Swarm Core",
        tags: ["charts", "graphs", "data", "visualization"],
        pricing: { model: "free" },
    },
    {
        id: "memory-store",
        name: "Long-Term Memory",
        description: "Persistent memory for agents. Store and retrieve facts, context, and conversation history across sessions.",
        type: "skill",
        source: "verified",
        category: "Core",
        icon: "🧠",
        version: "1.0.0",
        author: "Swarm Core",
        tags: ["memory", "storage", "context", "persistence"],
        pricing: { model: "free" },
    },
];

export const SKILL_BUNDLES: SkillBundle[] = [
    {
        id: "developer-bundle",
        name: "Developer Toolkit",
        description: "Essential tools for development workflows — code execution, GitHub, file management.",
        icon: "🛠️",
        skillIds: ["code-interpreter", "file-manager", "github-tools"],
    },
    {
        id: "research-bundle",
        name: "Research Suite",
        description: "Research and analysis tools — web search, PDF reader, data visualization.",
        icon: "🔬",
        skillIds: ["web-search", "pdf-reader", "data-viz"],
    },
    {
        id: "comms-bundle",
        name: "Communications Pack",
        description: "Keep your team informed — Slack notifications, email, and calendar sync.",
        icon: "📡",
        skillIds: ["slack-notify", "email-sender", "calendar-sync"],
    },
];

// ═══════════════════════════════════════════════════════════════
// Categories (per type)
// ═══════════════════════════════════════════════════════════════

export const SKILL_CATEGORIES = [
    "All",
    ...Array.from(new Set(SKILL_REGISTRY.map((s) => s.category))).sort(),
];

function categoriesForType(type: MarketItemType): string[] {
    return [
        "All",
        ...Array.from(new Set(SKILL_REGISTRY.filter((s) => s.type === type).map((s) => s.category))).sort(),
    ];
}

export const MOD_CATEGORIES = categoriesForType("mod");
export const PLUGIN_CATEGORIES = categoriesForType("plugin");
export const SKILL_ONLY_CATEGORIES = categoriesForType("skill");

// ═══════════════════════════════════════════════════════════════
// Firestore CRUD — Org Inventory (items the org owns)
// ═══════════════════════════════════════════════════════════════

const INVENTORY_COLLECTION = "installedSkills"; // keeping collection name for backward compat

/** Add an item to the org's inventory */
export async function acquireItem(
    orgId: string,
    skillId: string,
    acquiredBy: string,
): Promise<string> {
    const ref = await addDoc(collection(db, INVENTORY_COLLECTION), {
        orgId,
        skillId,
        enabled: true,
        config: {},
        installedAt: serverTimestamp(),
        installedBy: acquiredBy,
    });
    return ref.id;
}

/** Remove an item from the org's inventory */
export async function removeFromInventory(docId: string): Promise<void> {
    await deleteDoc(doc(db, INVENTORY_COLLECTION, docId));
}

/** Toggle an inventory item on/off */
export async function toggleInventoryItem(docId: string, enabled: boolean): Promise<void> {
    await updateDoc(doc(db, INVENTORY_COLLECTION, docId), { enabled });
}

/** Get all owned items for an org (inventory) */
export async function getOwnedItems(orgId: string): Promise<OwnedItem[]> {
    const q = query(
        collection(db, INVENTORY_COLLECTION),
        where("orgId", "==", orgId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            orgId: data.orgId,
            skillId: data.skillId,
            enabled: data.enabled ?? true,
            config: data.config,
            installedAt: data.installedAt instanceof Timestamp ? data.installedAt.toDate() : null,
            installedBy: data.installedBy,
        };
    });
}

/** Acquire an entire bundle into org inventory */
export async function acquireBundle(
    orgId: string,
    bundleId: string,
    acquiredBy: string,
    alreadyOwned: string[],
): Promise<void> {
    const bundle = SKILL_BUNDLES.find((b) => b.id === bundleId);
    if (!bundle) throw new Error("Bundle not found");
    for (const skillId of bundle.skillIds) {
        if (!alreadyOwned.includes(skillId)) {
            await acquireItem(orgId, skillId, acquiredBy);
        }
    }
}

// Backward-compat aliases
/** @deprecated Use acquireItem */
export const installSkill = acquireItem;
/** @deprecated Use removeFromInventory */
export const uninstallSkill = removeFromInventory;
/** @deprecated Use toggleInventoryItem */
export const toggleSkill = toggleInventoryItem;
/** @deprecated Use getOwnedItems */
export const getInstalledSkills = getOwnedItems;
/** @deprecated Use acquireBundle */
export const installBundle = acquireBundle;

// ═══════════════════════════════════════════════════════════════
// Firestore CRUD — Agent-Level Skills (per agent)
// ═══════════════════════════════════════════════════════════════

const AGENT_SKILLS_COLLECTION = "agentSkills";

/** Install a skill/plugin on a specific agent */
export async function installSkillOnAgent(
    agentId: string,
    skillId: string,
    orgId: string,
    installedBy: string,
): Promise<string> {
    const ref = await addDoc(collection(db, AGENT_SKILLS_COLLECTION), {
        agentId,
        skillId,
        orgId,
        installedAt: serverTimestamp(),
        installedBy,
    });
    return ref.id;
}

/** Remove a skill/plugin from a specific agent */
export async function removeSkillFromAgent(docId: string): Promise<void> {
    await deleteDoc(doc(db, AGENT_SKILLS_COLLECTION, docId));
}

/** Get all skills installed on a specific agent */
export async function getAgentSkills(agentId: string): Promise<AgentSkill[]> {
    const q = query(
        collection(db, AGENT_SKILLS_COLLECTION),
        where("agentId", "==", agentId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            agentId: data.agentId,
            skillId: data.skillId,
            orgId: data.orgId,
            installedAt: data.installedAt instanceof Timestamp ? data.installedAt.toDate() : null,
            installedBy: data.installedBy,
        };
    });
}

// ═══════════════════════════════════════════════════════════════
// Community Submissions
// ═══════════════════════════════════════════════════════════════

const COMMUNITY_COLLECTION = "communityMarketItems";

export interface CommunityMarketItem {
    id: string;
    name: string;
    description: string;
    type: MarketItemType;
    category: string;
    icon: string;
    version: string;
    tags: string[];
    requiredKeys?: string[];
    pricing: MarketPricing;
    submittedBy: string;
    submittedByName?: string;
    submittedAt: Date | null;
    status: "pending" | "approved" | "rejected";
}

// ═══════════════════════════════════════════════════════════════
// Subscriptions
// ═══════════════════════════════════════════════════════════════

const SUBSCRIPTION_COLLECTION = "marketSubscriptions";

export interface MarketSubscription {
    id: string;
    orgId: string;
    itemId: string;        // community item doc ID
    plan: SubscriptionPlan;
    status: "active" | "expired" | "cancelled";
    subscribedBy: string;  // wallet address
    startDate: Date | null;
    endDate: Date | null;   // null = lifetime
}

/** Subscribe an org to a market item */
export async function subscribeToItem(
    orgId: string,
    itemId: string,
    plan: SubscriptionPlan,
    subscribedBy: string,
): Promise<string> {
    // Calculate end date based on plan
    const now = new Date();
    let endDate: Date | null = null;
    if (plan === "monthly") {
        endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 1);
    } else if (plan === "yearly") {
        endDate = new Date(now);
        endDate.setFullYear(endDate.getFullYear() + 1);
    }
    // lifetime = null endDate (never expires)

    const ref = await addDoc(collection(db, SUBSCRIPTION_COLLECTION), {
        orgId,
        itemId,
        plan,
        status: "active",
        subscribedBy,
        startDate: serverTimestamp(),
        endDate: endDate ? Timestamp.fromDate(endDate) : null,
    });
    return ref.id;
}

/** Cancel a subscription */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
    await updateDoc(doc(db, SUBSCRIPTION_COLLECTION, subscriptionId), {
        status: "cancelled",
    });
}

/** Get all active subscriptions for an org */
export async function getOrgSubscriptions(orgId: string): Promise<MarketSubscription[]> {
    const q = query(
        collection(db, SUBSCRIPTION_COLLECTION),
        where("orgId", "==", orgId),
        where("status", "==", "active"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            orgId: data.orgId,
            itemId: data.itemId,
            plan: data.plan,
            status: data.status,
            subscribedBy: data.subscribedBy,
            startDate: data.startDate instanceof Timestamp ? data.startDate.toDate() : null,
            endDate: data.endDate instanceof Timestamp ? data.endDate.toDate() : null,
        };
    });
}

/** Submit a new community market item */
export async function submitMarketItem(
    data: Omit<CommunityMarketItem, "id" | "submittedAt" | "status">,
): Promise<string> {
    const ref = await addDoc(collection(db, COMMUNITY_COLLECTION), {
        ...data,
        pricing: data.pricing ?? { model: "free" },
        status: "pending",
        submittedAt: serverTimestamp(),
    });
    return ref.id;
}

/** Get all approved community items */
export async function getCommunityItems(): Promise<CommunityMarketItem[]> {
    const q = query(
        collection(db, COMMUNITY_COLLECTION),
        where("status", "==", "approved"),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            ...data,
            pricing: data.pricing ?? { model: "free" },
            submittedAt: data.submittedAt instanceof Timestamp ? data.submittedAt.toDate() : null,
        } as CommunityMarketItem;
    });
}

/** Get submissions by a specific user */
export async function getUserSubmissions(walletAddress: string): Promise<CommunityMarketItem[]> {
    const q = query(
        collection(db, COMMUNITY_COLLECTION),
        where("submittedBy", "==", walletAddress),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            ...data,
            pricing: data.pricing ?? { model: "free" },
            submittedAt: data.submittedAt instanceof Timestamp ? data.submittedAt.toDate() : null,
        } as CommunityMarketItem;
    });
}

/** Delete a community submission */
export async function deleteCommunityItem(docId: string): Promise<void> {
    await deleteDoc(doc(db, COMMUNITY_COLLECTION, docId));
}
