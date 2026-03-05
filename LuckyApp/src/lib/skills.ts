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
    orderBy,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type MarketItemType = "mod" | "plugin" | "skill";
export type MarketItemSource = "verified" | "community";

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
    /** Is this installed for the org? */
    installed?: boolean;
    /** Is it enabled? */
    enabled?: boolean;
    /** Install date */
    installedAt?: Date | null;
}

export interface SkillBundle {
    id: string;
    name: string;
    description: string;
    icon: string;
    skillIds: string[];
}

export interface InstalledSkill {
    id: string;             // Firestore doc ID
    orgId: string;
    skillId: string;        // reference to marketplace item
    enabled: boolean;
    config?: Record<string, string>;  // API keys, settings
    installedAt: Date | null;
    installedBy: string;
}

// ═══════════════════════════════════════════════════════════════
// Marketplace Registry (static — would come from API in prod)
// ═══════════════════════════════════════════════════════════════

export const SKILL_REGISTRY: Skill[] = [
    // ── Mods ──
    {
        id: "professional-tone",
        name: "Professional Tone",
        description: "Enforce professional, formal communication style in all agent responses.",
        type: "mod",
        source: "verified",
        category: "Communication Style",
        icon: "👔",
        version: "1.0.0",
        author: "Swarm Core",
        tags: ["tone", "professional", "formal", "style"],
    },
    {
        id: "safety-guardrails",
        name: "Safety Guardrails",
        description: "Apply safety constraints — prevent agents from executing destructive actions without approval.",
        type: "mod",
        source: "verified",
        category: "Safety",
        icon: "🛡️",
        version: "1.0.0",
        author: "Swarm Core",
        tags: ["safety", "guardrails", "constraints", "approval"],
    },
    {
        id: "concise-mode",
        name: "Concise Mode",
        description: "Force agents to produce shorter, more direct responses. Ideal for high-throughput workflows.",
        type: "mod",
        source: "verified",
        category: "Communication Style",
        icon: "✂️",
        version: "1.0.0",
        author: "Swarm Core",
        tags: ["concise", "brief", "short", "style"],
    },
    {
        id: "chain-of-thought",
        name: "Chain of Thought",
        description: "Require agents to show their reasoning process step-by-step before giving a final answer.",
        type: "mod",
        source: "verified",
        category: "Reasoning",
        icon: "🧩",
        version: "1.0.0",
        author: "Swarm Core",
        tags: ["reasoning", "cot", "thinking", "transparency"],
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
// Firestore CRUD (installed skills per org)
// ═══════════════════════════════════════════════════════════════

const INSTALLED_COLLECTION = "installedSkills";

/** Install a skill for an org */
export async function installSkill(
    orgId: string,
    skillId: string,
    installedBy: string,
): Promise<string> {
    const ref = await addDoc(collection(db, INSTALLED_COLLECTION), {
        orgId,
        skillId,
        enabled: true,
        config: {},
        installedAt: serverTimestamp(),
        installedBy,
    });
    return ref.id;
}

/** Uninstall a skill */
export async function uninstallSkill(docId: string): Promise<void> {
    await deleteDoc(doc(db, INSTALLED_COLLECTION, docId));
}

/** Toggle a skill */
export async function toggleSkill(docId: string, enabled: boolean): Promise<void> {
    await updateDoc(doc(db, INSTALLED_COLLECTION, docId), { enabled });
}

/** Get installed skills for an org */
export async function getInstalledSkills(orgId: string): Promise<InstalledSkill[]> {
    const q = query(
        collection(db, INSTALLED_COLLECTION),
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

/** Install an entire bundle */
export async function installBundle(
    orgId: string,
    bundleId: string,
    installedBy: string,
    alreadyInstalled: string[],
): Promise<void> {
    const bundle = SKILL_BUNDLES.find((b) => b.id === bundleId);
    if (!bundle) throw new Error("Bundle not found");
    for (const skillId of bundle.skillIds) {
        if (!alreadyInstalled.includes(skillId)) {
            await installSkill(orgId, skillId, installedBy);
        }
    }
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
    submittedBy: string;
    submittedByName?: string;
    submittedAt: Date | null;
    status: "pending" | "approved" | "rejected";
}

/** Submit a new community market item */
export async function submitMarketItem(
    data: Omit<CommunityMarketItem, "id" | "submittedAt" | "status">,
): Promise<string> {
    const ref = await addDoc(collection(db, COMMUNITY_COLLECTION), {
        ...data,
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
            submittedAt: data.submittedAt instanceof Timestamp ? data.submittedAt.toDate() : null,
        } as CommunityMarketItem;
    });
}

/** Delete a community submission */
export async function deleteCommunityItem(docId: string): Promise<void> {
    await deleteDoc(doc(db, COMMUNITY_COLLECTION, docId));
}
