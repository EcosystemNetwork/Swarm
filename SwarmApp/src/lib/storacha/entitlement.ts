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
 */
export async function requireMemoryPro(orgId: string): Promise<{
    allowed: boolean;
    reason?: string;
    subscriptionId?: string;
}> {
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
}

/**
 * Quick boolean check (non-throwing). Useful for UI conditional rendering.
 */
export async function hasMemoryPro(orgId: string): Promise<boolean> {
    const result = await requireMemoryPro(orgId);
    return result.allowed;
}
