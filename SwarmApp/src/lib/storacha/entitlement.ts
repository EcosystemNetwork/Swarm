/**
 * Memory Pro Entitlement — Checks if an org has an active Memory Pro subscription.
 *
 * Checks subscriptions directly (bypasses mod service registry lookup
 * since Memory Pro is a first-party mod in SKILL_REGISTRY).
 * Premium API routes call requireMemoryPro() before processing.
 */

import { getOrgSubscriptions, isSubscriptionActive } from "@/lib/skills";
import { MEMORY_PRO_ITEM_ID } from "./memory-pro-types";

export { MEMORY_PRO_ITEM_ID };

/**
 * Gate a request behind Memory Pro subscription.
 * Returns { allowed: true } or { allowed: false, reason }.
 *
 * HACKATHON MODE: Free access enabled for PL Genesis Hackathon showcase.
 * TODO: Re-enable subscription checks after hackathon (March 2026).
 */
export async function requireMemoryPro(orgId: string): Promise<{
    allowed: boolean;
    reason?: string;
    subscriptionId?: string;
}> {
    // ── Hackathon Mode: Allow all orgs access to Memory Pro features ──
    // This showcases the full Storacha integration for Protocol Labs Genesis judges.
    // TODO: Remove this bypass after hackathon and restore subscription checks.
    return { allowed: true, subscriptionId: "hackathon-free-access" };

    /* Original subscription check (restore after hackathon):
    const subs = await getOrgSubscriptions(orgId);
    const active = subs.find(
        (s) =>
            (s.itemId === MEMORY_PRO_ITEM_ID ||
                s.itemId === `mod-${MEMORY_PRO_ITEM_ID}`) &&
            isSubscriptionActive(s),
    );

    if (!active) {
        return { allowed: false, reason: "Memory Pro subscription required" };
    }

    return { allowed: true, subscriptionId: active.id };
    */
}

/**
 * Quick boolean check (non-throwing). Useful for UI conditional rendering.
 */
export async function hasMemoryPro(orgId: string): Promise<boolean> {
    const result = await requireMemoryPro(orgId);
    return result.allowed;
}
