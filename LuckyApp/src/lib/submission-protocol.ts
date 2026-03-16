/**
 * Swarm Submission Protocol v1
 *
 * Core protocol for marketplace submissions: publisher profiles, trust tiers,
 * intake validation, security scanning, ranking scores, and pipeline management.
 *
 * Guiding principle: "Anyone can submit. Not everyone gets distribution."
 */

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    getDocs,
    query,
    collection,
    where,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { checkRateLimit } from "./rate-limit-firestore";
import { scanForSecrets, hasCriticalSecrets } from "./secret-scanner";
import type { MarketItemType, PermissionScope } from "./skills";

// ═══════════════════════════════════════════════════════════════
// Publisher Profile
// ═══════════════════════════════════════════════════════════════

const PUBLISHER_COLLECTION = "publisherProfiles";

export interface PublisherProfile {
    id: string;
    walletAddress: string;
    displayName: string;
    tier: 0 | 1 | 2 | 3;
    totalSubmissions: number;
    approvedCount: number;
    rejectedCount: number;
    avgRating: number;
    totalInstalls: number;
    lastSubmissionAt: Date | null;
    cooldownUntil: Date | null;
    banned: boolean;
    banReason?: string;
    bannedAt?: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}

/** Get or create a publisher profile (upsert). */
export async function getOrCreatePublisher(
    wallet: string,
    displayName?: string,
): Promise<PublisherProfile> {
    const ref = doc(db, PUBLISHER_COLLECTION, wallet);
    const snap = await getDoc(ref);

    if (snap.exists()) {
        const data = snap.data();
        return {
            id: snap.id,
            walletAddress: data.walletAddress,
            displayName: data.displayName || wallet.slice(0, 8) + "...",
            tier: data.tier ?? 0,
            totalSubmissions: data.totalSubmissions ?? 0,
            approvedCount: data.approvedCount ?? 0,
            rejectedCount: data.rejectedCount ?? 0,
            avgRating: data.avgRating ?? 0,
            totalInstalls: data.totalInstalls ?? 0,
            lastSubmissionAt: data.lastSubmissionAt instanceof Timestamp ? data.lastSubmissionAt.toDate() : null,
            cooldownUntil: data.cooldownUntil instanceof Timestamp ? data.cooldownUntil.toDate() : null,
            banned: data.banned ?? false,
            banReason: data.banReason,
            bannedAt: data.bannedAt instanceof Timestamp ? data.bannedAt.toDate() : null,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
        };
    }

    // Create new profile
    const profile: Omit<PublisherProfile, "id"> = {
        walletAddress: wallet,
        displayName: displayName || wallet.slice(0, 8) + "...",
        tier: 0,
        totalSubmissions: 0,
        approvedCount: 0,
        rejectedCount: 0,
        avgRating: 0,
        totalInstalls: 0,
        lastSubmissionAt: null,
        cooldownUntil: null,
        banned: false,
        createdAt: null,
        updatedAt: null,
    };

    await setDoc(ref, {
        ...profile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    return { id: wallet, ...profile };
}

/** Recalculate publisher stats from their items and auto-upgrade tier. */
export async function updatePublisherStats(wallet: string): Promise<PublisherProfile> {
    const profile = await getOrCreatePublisher(wallet);

    // Count community items
    const communitySnap = await getDocs(
        query(collection(db, "communityMarketItems"), where("submittedBy", "==", wallet)),
    );
    let approved = 0;
    let rejected = 0;
    let total = communitySnap.size;

    communitySnap.forEach((d) => {
        const s = d.data().status;
        if (s === "approved") approved++;
        if (s === "rejected") rejected++;
    });

    // Count agent packages
    const agentSnap = await getDocs(
        query(collection(db, "marketplaceAgents"), where("authorWallet", "==", wallet)),
    );
    total += agentSnap.size;
    let totalInstalls = 0;
    let ratingSum = 0;
    let ratingCount = 0;

    agentSnap.forEach((d) => {
        const data = d.data();
        if (data.status === "approved") approved++;
        if (data.status === "rejected") rejected++;
        totalInstalls += data.installCount || 0;
        if (data.avgRating && data.ratingCount) {
            ratingSum += data.avgRating * data.ratingCount;
            ratingCount += data.ratingCount;
        }
    });

    const avgRating = ratingCount > 0 ? ratingSum / ratingCount : 0;
    const newTier = computeTier({ ...profile, approvedCount: approved, avgRating, totalInstalls });

    const ref = doc(db, PUBLISHER_COLLECTION, wallet);
    await updateDoc(ref, {
        totalSubmissions: total,
        approvedCount: approved,
        rejectedCount: rejected,
        avgRating,
        totalInstalls,
        tier: newTier,
        updatedAt: serverTimestamp(),
    });

    return {
        ...profile,
        totalSubmissions: total,
        approvedCount: approved,
        rejectedCount: rejected,
        avgRating,
        totalInstalls,
        tier: newTier,
    };
}

// ═══════════════════════════════════════════════════════════════
// Trust Tiers
// ═══════════════════════════════════════════════════════════════

export const TIER_QUOTAS: Record<number, { maxPerWeek: number; cooldownMs: number }> = {
    0: { maxPerWeek: 2, cooldownMs: 4 * 60 * 60 * 1000 },    // 4hr
    1: { maxPerWeek: 5, cooldownMs: 4 * 60 * 60 * 1000 },    // 4hr
    2: { maxPerWeek: 20, cooldownMs: 1 * 60 * 60 * 1000 },   // 1hr
    3: { maxPerWeek: 999, cooldownMs: 0 },                     // Unlimited
};

export const TIER_NAMES: Record<number, string> = {
    0: "New Publisher",
    1: "Approved",
    2: "Trusted",
    3: "Strategic Partner",
};

export const TIER_COLORS: Record<number, string> = {
    0: "gray",
    1: "green",
    2: "blue",
    3: "amber",
};

/** Compute trust tier from publisher stats. Tier 3 is manual-only. */
export function computeTier(profile: Pick<PublisherProfile, "tier" | "approvedCount" | "avgRating" | "totalInstalls">): 0 | 1 | 2 | 3 {
    if (profile.tier === 3) return 3; // Manual grant, never auto-downgrade
    if (profile.approvedCount >= 5 && profile.avgRating >= 4.0 && profile.totalInstalls >= 100) return 2;
    if (profile.approvedCount >= 1) return 1;
    return 0;
}

/** Determine the starting pipeline stage based on publisher tier. */
export function getStartingStage(tier: number): SubmissionStage {
    switch (tier) {
        case 3: return "decision";       // Auto-approve
        case 2: return "product_review"; // Skip scan + sandbox
        case 1: return "security_scan";  // Skip sandbox only
        default: return "security_scan"; // Full pipeline
    }
}

/** Pipeline stage progression order. */
const STAGE_ORDER: SubmissionStage[] = [
    "intake",
    "security_scan",
    "sandbox",
    "product_review",
    "decision",
];

/** Get the next stage after the current one, or null if at end. */
export function getNextStage(current: SubmissionStage): SubmissionStage | null {
    const idx = STAGE_ORDER.indexOf(current);
    if (idx === -1 || idx >= STAGE_ORDER.length - 1) return null;
    return STAGE_ORDER[idx + 1];
}

// ═══════════════════════════════════════════════════════════════
// Submission Pipeline
// ═══════════════════════════════════════════════════════════════

export type SubmissionStage =
    | "intake"
    | "security_scan"
    | "sandbox"
    | "product_review"
    | "decision";

export type SubmissionDecision = "approved" | "rejected" | "changes_requested" | "suspended";

export interface ReviewEntry {
    stage: SubmissionStage;
    result: "passed" | "failed" | "skipped";
    reviewedBy: string;
    reviewedAt: string; // ISO string for Firestore compatibility
    comment?: string;
    findings?: string[];
}

// ═══════════════════════════════════════════════════════════════
// Intake Validation
// ═══════════════════════════════════════════════════════════════

export interface IntakeResult {
    passed: boolean;
    reasons: string[];
    publisher: PublisherProfile;
}

/** Run intake validation: ban check, cooldown, quota, duplicate detection. */
export async function runIntakeValidation(
    wallet: string,
    itemName: string,
    _itemDescription: string,
    _itemType: MarketItemType,
    displayName?: string,
): Promise<IntakeResult> {
    const reasons: string[] = [];
    const publisher = await getOrCreatePublisher(wallet, displayName);

    // 1. Ban check
    if (publisher.banned) {
        reasons.push(`Publisher banned: ${publisher.banReason || "policy violation"}`);
        return { passed: false, reasons, publisher };
    }

    // 2. Cooldown check
    if (publisher.cooldownUntil && Date.now() < publisher.cooldownUntil.getTime()) {
        const remaining = Math.ceil((publisher.cooldownUntil.getTime() - Date.now()) / 60000);
        reasons.push(`Cooldown active: ${remaining} minutes remaining`);
    }

    // 3. Weekly quota check
    const tierConfig = TIER_QUOTAS[publisher.tier] || TIER_QUOTAS[0];
    const quotaResult = await checkRateLimit(
        `submit:${wallet}`,
        { max: tierConfig.maxPerWeek, windowMs: 7 * 24 * 60 * 60 * 1000 },
    );
    if (!quotaResult.allowed) {
        reasons.push(`Weekly submission quota exceeded (${tierConfig.maxPerWeek}/week for ${TIER_NAMES[publisher.tier]} tier)`);
    }

    // 4. Duplicate name check (exact match, case-insensitive)
    const normalizedName = itemName.toLowerCase().trim().replace(/\s+/g, " ");
    const existingSnap = await getDocs(
        query(collection(db, "communityMarketItems"), where("status", "==", "approved")),
    );
    for (const d of existingSnap.docs) {
        const existing = d.data().name as string;
        if (existing && existing.toLowerCase().trim().replace(/\s+/g, " ") === normalizedName) {
            reasons.push(`An item with the name "${existing}" already exists`);
            break;
        }
    }

    return { passed: reasons.length === 0, reasons, publisher };
}

/** Record that a submission was made (update cooldown + timestamp). */
export async function recordSubmission(wallet: string): Promise<void> {
    const publisher = await getOrCreatePublisher(wallet);
    const tierConfig = TIER_QUOTAS[publisher.tier] || TIER_QUOTAS[0];

    const ref = doc(db, PUBLISHER_COLLECTION, wallet);
    await updateDoc(ref, {
        lastSubmissionAt: serverTimestamp(),
        cooldownUntil: tierConfig.cooldownMs > 0
            ? Timestamp.fromMillis(Date.now() + tierConfig.cooldownMs)
            : null,
        totalSubmissions: (publisher.totalSubmissions || 0) + 1,
        updatedAt: serverTimestamp(),
    });
}

// ═══════════════════════════════════════════════════════════════
// Security Scan
// ═══════════════════════════════════════════════════════════════

export interface SecurityScanResult {
    passed: boolean;
    findings: string[];
    severity: "none" | "low" | "medium" | "high" | "critical";
}

/** Run automated security scan on submission content. */
export function runSecurityScan(
    description: string,
    manifest?: { tools?: string[]; workflows?: string[]; agentSkills?: string[] },
    permissions?: PermissionScope[],
): SecurityScanResult {
    const findings: string[] = [];
    let maxSeverity: SecurityScanResult["severity"] = "none";

    // 1. Scan description for secrets
    if (hasCriticalSecrets(description)) {
        findings.push("Description contains critical secrets (API keys, private keys)");
        maxSeverity = "critical";
    } else {
        const descScan = scanForSecrets(description);
        if (!descScan.clean) {
            for (const s of descScan.secrets) {
                findings.push(`${s.type} detected in description (${s.severity})`);
                if (severityRank(s.severity) > severityRank(maxSeverity)) {
                    maxSeverity = s.severity;
                }
            }
        }
    }

    // 2. Scan manifest content
    if (manifest) {
        const allText = [
            ...(manifest.tools || []),
            ...(manifest.workflows || []),
            ...(manifest.agentSkills || []),
        ].join("\n");

        if (allText && hasCriticalSecrets(allText)) {
            findings.push("Manifest content contains critical secrets");
            maxSeverity = "critical";
        }
    }

    // 3. Permission audit
    if (permissions && permissions.length > 0) {
        const hasWallet = permissions.includes("wallet_access");
        const hasExternal = permissions.includes("external_api");
        const hasSensitive = permissions.includes("sensitive_data_access");

        if (hasWallet && hasExternal) {
            findings.push("High-risk permission combo: wallet_access + external_api (potential exfiltration vector)");
            if (severityRank("high") > severityRank(maxSeverity)) maxSeverity = "high";
        }
        if (hasSensitive) {
            findings.push("Requests sensitive_data_access — requires manual review");
            if (severityRank("medium") > severityRank(maxSeverity)) maxSeverity = "medium";
        }
    }

    return {
        passed: maxSeverity !== "critical",
        findings,
        severity: maxSeverity,
    };
}

function severityRank(s: string): number {
    const ranks: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
    return ranks[s] ?? 0;
}

// ═══════════════════════════════════════════════════════════════
// Ranking Score
// ═══════════════════════════════════════════════════════════════

/** Compute a normalized ranking score (0-100) for marketplace ordering. */
export function computeRankingScore(item: {
    installCount: number;
    avgRating: number;
    ratingCount: number;
    publishedAt: Date | null;
    publisherTier: number;
}): number {
    // Installs (0-30 points, log scale, cap at 1000)
    const installScore = Math.min(Math.log10(Math.max(item.installCount, 1)) / 3, 1) * 30;

    // Rating (0-25 points)
    const ratingScore = (item.avgRating / 5) * 25;

    // Freshness (0-20 points, decays over 180 days)
    const ageMs = item.publishedAt ? Date.now() - item.publishedAt.getTime() : 180 * 24 * 60 * 60 * 1000;
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    const freshnessScore = Math.max(0, 1 - ageDays / 180) * 20;

    // Tier boost (0-15 points)
    const tierScore = (item.publisherTier / 3) * 15;

    // Rating volume (0-10 points, log scale, cap at 100)
    const volumeScore = Math.min(Math.log10(Math.max(item.ratingCount, 1)) / 2, 1) * 10;

    return Math.round(installScore + ratingScore + freshnessScore + tierScore + volumeScore);
}
