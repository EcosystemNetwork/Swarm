/**
 * Skill Marketplace — Types + Registry
 *
 * Browse, install, and manage agent skills (tools/plugins).
 * Skills are stored in Firestore per-org, with a static registry
 * of available skills from the marketplace.
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

export interface Skill {
    id: string;
    name: string;
    description: string;
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
    skillId: string;        // reference to marketplace skill
    enabled: boolean;
    config?: Record<string, string>;  // API keys, settings
    installedAt: Date | null;
    installedBy: string;
}

// ═══════════════════════════════════════════════════════════════
// Marketplace Registry (static — would come from API in prod)
// ═══════════════════════════════════════════════════════════════

export const SKILL_REGISTRY: Skill[] = [
    {
        id: "web-search",
        name: "Web Search",
        description: "Search the web for real-time information. Uses Tavily or SerpAPI for comprehensive results.",
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
        category: "Creative",
        icon: "🎨",
        version: "1.0.0",
        author: "Swarm Core",
        requiredKeys: ["OPENAI_API_KEY"],
        tags: ["image", "art", "generation", "dalle"],
    },
    {
        id: "github-tools",
        name: "GitHub Integration",
        description: "Interact with GitHub repos — create issues, PRs, read code, manage workflows.",
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
        category: "Communication",
        icon: "💬",
        version: "1.0.0",
        author: "Swarm Core",
        requiredKeys: ["SLACK_BOT_TOKEN"],
        tags: ["slack", "notifications", "messaging"],
    },
    {
        id: "pdf-reader",
        name: "PDF Reader",
        description: "Extract text, tables, and metadata from PDF documents.",
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
        category: "Analytics",
        icon: "📊",
        version: "1.0.0",
        author: "Swarm Core",
        tags: ["charts", "graphs", "data", "visualization"],
    },
    {
        id: "email-sender",
        name: "Email Sender",
        description: "Compose and send emails via SMTP or SendGrid. Supports templates and attachments.",
        category: "Communication",
        icon: "📧",
        version: "1.0.0",
        author: "Swarm Core",
        requiredKeys: ["SENDGRID_API_KEY"],
        tags: ["email", "smtp", "sendgrid", "notifications"],
    },
    {
        id: "blockchain-tools",
        name: "Blockchain Tools",
        description: "Interact with EVM chains — read balances, send transactions, query contracts.",
        category: "Web3",
        icon: "⛓️",
        version: "1.0.0",
        author: "Swarm Core",
        tags: ["blockchain", "web3", "ethereum", "transactions"],
    },
    {
        id: "calendar-sync",
        name: "Calendar Sync",
        description: "Read and create calendar events. Integrates with Google Calendar and Outlook.",
        category: "Productivity",
        icon: "📅",
        version: "1.0.0",
        author: "Swarm Core",
        requiredKeys: ["GOOGLE_CALENDAR_KEY"],
        tags: ["calendar", "events", "scheduling"],
    },
    {
        id: "memory-store",
        name: "Long-Term Memory",
        description: "Persistent memory for agents. Store and retrieve facts, context, and conversation history across sessions.",
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
// Categories
// ═══════════════════════════════════════════════════════════════

export const SKILL_CATEGORIES = [
    "All",
    ...Array.from(new Set(SKILL_REGISTRY.map((s) => s.category))).sort(),
];

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
