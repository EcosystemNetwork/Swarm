/** Sidebar — Draggable navigation with sections (Core/Operations/Intelligence/System/Modifications). */
"use client";

import { useState, useEffect, useCallback, useRef, type DragEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useOrg } from "@/contexts/OrgContext";
import { useSkin } from "@/contexts/SkinContext";
import { getOwnedItems, SKILL_REGISTRY } from "@/lib/skills";
import {
  LayoutDashboard, FolderKanban, Users, Briefcase, MessageSquare,
  LayoutGrid, Shield, Clock, Activity, BarChart3, Settings,
  Map, Calendar, Radio, FileText, ChevronLeft, ChevronRight, GripVertical,
  Command, Coins, Stethoscope, Brain, UserCog, Network, HardDrive, BookOpen, Store, Building2,
  Link as LinkIcon, Zap,
} from "lucide-react";

/** Map iconName strings from sidebarConfig to lucide components */
const ICON_MAP: Record<string, typeof LayoutDashboard> = {
  Link: LinkIcon,
};

// ═══════════════════════════════════════════════════════════════
// Navigation Model
// ═══════════════════════════════════════════════════════════════

export interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  accentColor?: "amber" | "cyan";
}

const SECTION_COLORS: Record<string, { activeBg: string; activeText: string; activeBorder: string; activeBar: string; badgeBg: string; badgeText: string; dropIndicator: string; headerText: string }> = {
  amber: {
    activeBg: "bg-amber-500/10",
    activeText: "text-amber-400",
    activeBorder: "border-amber-500/20",
    activeBar: "bg-amber-500",
    badgeBg: "bg-amber-500/20",
    badgeText: "text-amber-400",
    dropIndicator: "border-amber-500/50",
    headerText: "text-muted-foreground/40",
  },
  cyan: {
    activeBg: "bg-cyan-500/10",
    activeText: "text-cyan-400",
    activeBorder: "border-cyan-500/20",
    activeBar: "bg-cyan-500",
    badgeBg: "bg-cyan-500/20",
    badgeText: "text-cyan-400",
    dropIndicator: "border-cyan-500/50",
    headerText: "text-cyan-400/50",
  },
  futuristic: {
    activeBg: "bg-cyan-400/10",
    activeText: "text-cyan-300",
    activeBorder: "border-cyan-400/20",
    activeBar: "bg-cyan-400",
    badgeBg: "bg-cyan-400/20",
    badgeText: "text-cyan-300",
    dropIndicator: "border-cyan-400/50",
    headerText: "text-cyan-400/40",
  },
};

const DEFAULT_SECTIONS: NavSection[] = [
  {
    id: "core",
    label: "Core",
    items: [
      { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "organizations", href: "/organizations", label: "Orgs", icon: Building2 },
      { id: "projects", href: "/swarms", label: "Projects", icon: FolderKanban },
      { id: "agents", href: "/agents", label: "Agents", icon: Users },
      { id: "board", href: "/kanban", label: "Boards", icon: LayoutGrid },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { id: "jobs", href: "/jobs", label: "Jobs", icon: Briefcase },
      { id: "channels", href: "/chat", label: "Channels", icon: MessageSquare },
      { id: "approvals", href: "/approvals", label: "Approvals", icon: Shield },
      { id: "operators", href: "/operators", label: "Operators", icon: UserCog },
      { id: "cron", href: "/cron", label: "Scheduler", icon: Clock },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    items: [
      { id: "activity", href: "/activity", label: "Activity", icon: Activity },
      { id: "cerebro", href: "/cerebro", label: "Cerebro", icon: Brain },
      { id: "memory", href: "/memory", label: "Memory", icon: HardDrive },
      { id: "metrics", href: "/metrics", label: "Metrics", icon: BarChart3 },
      { id: "usage", href: "/usage", label: "Usage", icon: Coins },
      { id: "market", href: "/market", label: "Market", icon: Store },
      { id: "agent-map", href: "/agent-map", label: "Agent Map", icon: Map },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { id: "logs", href: "/logs", label: "Logs", icon: FileText },
      { id: "gateways", href: "/gateways", label: "Gateways", icon: Network },
      { id: "doctor", href: "/doctor", label: "Health", icon: Stethoscope },
      { id: "swarm", href: "/swarm", label: "Swarm", icon: Zap },
      { id: "docs", href: "/docs", label: "Docs", icon: BookOpen },
      { id: "settings", href: "/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    id: "modifications",
    label: "Modifications",
    items: [],
    accentColor: "cyan",
  },
];

// ═══════════════════════════════════════════════════════════════
// Persistence Keys
// ═══════════════════════════════════════════════════════════════

const SECTION_ORDER_KEY = "swarm-sidebar-order";
const ITEM_ORDER_KEY = "swarm-sidebar-items";
const COLLAPSED_KEY = "swarm-sidebar-collapsed";

// ═══════════════════════════════════════════════════════════════
// Persistence Helpers
// ═══════════════════════════════════════════════════════════════

function loadJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

function saveJSON(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { }
}

function loadCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(COLLAPSED_KEY) === "true"; } catch { return false; }
}

// Build a complete lookup of all items from the given sections by id
function buildItemLookup(base: NavSection[]): Record<string, NavItem> {
  const m: Record<string, NavItem> = {};
  for (const s of base) for (const i of s.items) m[i.id] = i;
  return m;
}

/**
 * Apply saved section order + item order to produce the final NavSection[].
 * Any new items not in saved order get appended to their default section.
 */
function applySavedState(base: NavSection[] = DEFAULT_SECTIONS): NavSection[] {
  const sectionOrder = loadJSON<string[]>(SECTION_ORDER_KEY);
  const itemOrder = loadJSON<Record<string, string[]>>(ITEM_ORDER_KEY);

  // Start with base, then re-order sections
  let sections = [...base.map(s => ({ ...s, items: [...s.items] }))];

  if (sectionOrder) {
    const lookup: Record<string, NavSection> = {};
    for (const s of sections) lookup[s.id] = s;
    const ordered: NavSection[] = [];
    const used = new Set<string>();
    for (const id of sectionOrder) {
      if (lookup[id]) { ordered.push(lookup[id]); used.add(id); }
    }
    for (const s of sections) {
      if (!used.has(s.id)) ordered.push(s);
    }
    sections = ordered;
  }

  // Apply saved item order within each section
  if (itemOrder) {
    const allItems = buildItemLookup(base);
    for (const section of sections) {
      const savedItemIds = itemOrder[section.id];
      if (!savedItemIds) continue;

      const sectionItemLookup: Record<string, NavItem> = {};
      for (const item of section.items) sectionItemLookup[item.id] = item;
      // Also check global lookup for items moved from other sections
      const ordered: NavItem[] = [];
      const used = new Set<string>();
      for (const id of savedItemIds) {
        const item = sectionItemLookup[id] || allItems[id];
        if (item) { ordered.push(item); used.add(id); }
      }
      // Append any items in section.items not in saved order (new items)
      for (const item of section.items) {
        if (!used.has(item.id)) ordered.push(item);
      }
      section.items = ordered;
    }
  }

  return sections;
}

function saveSectionOrder(sections: NavSection[]) {
  saveJSON(SECTION_ORDER_KEY, sections.map(s => s.id));
}

function saveItemOrder(sections: NavSection[]) {
  const order: Record<string, string[]> = {};
  for (const s of sections) order[s.id] = s.items.map(i => i.id);
  saveJSON(ITEM_ORDER_KEY, order);
}

// ═══════════════════════════════════════════════════════════════
// Drag-and-drop Types
// ═══════════════════════════════════════════════════════════════

type DragKind = "section" | "item";

interface DragState {
  kind: DragKind;
  sectionId: string;
  itemId?: string; // only for "item" kind
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export function Sidebar() {
  const pathname = usePathname();
  const { currentOrg } = useOrg();
  const { skin } = useSkin();
  const [collapsed, setCollapsed] = useState(false);
  const [sections, setSections] = useState<NavSection[]>(DEFAULT_SECTIONS);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<{ sectionId: string; itemId?: string } | null>(null);
  const orgIdRef = useRef<string | null>(null);

  // Fetch installed mods and rebuild sidebar sections
  const refreshModSidebar = useCallback(async (orgId: string) => {
    try {
      const owned = await getOwnedItems(orgId);
      const ownedIds = new Set(owned.filter(o => o.enabled).map(o => o.skillId));

      const dynamicItems: { sectionId: string; item: NavItem }[] = [];
      for (const skill of SKILL_REGISTRY) {
        if (skill.sidebarConfig && ownedIds.has(skill.id)) {
          const icon = ICON_MAP[skill.sidebarConfig.iconName] as typeof LayoutDashboard | undefined;
          if (icon != null) {
            dynamicItems.push({
              sectionId: skill.sidebarConfig.sectionId,
              item: {
                id: `mod-${skill.id}`,
                href: skill.sidebarConfig.href,
                label: skill.sidebarConfig.label,
                icon,
              },
            });
          }
        }
      }

      const base = DEFAULT_SECTIONS.map(s => ({ ...s, items: [...s.items] }));
      for (const { sectionId, item } of dynamicItems) {
        const section = base.find(s => s.id === sectionId);
        if (section && !section.items.some(i => i.id === item.id)) {
          section.items.push(item);
        }
      }

      setSections(applySavedState(base));
    } catch {
      setSections(applySavedState());
    }
  }, []);

  // Load on org change
  useEffect(() => {
    const orgId = currentOrg?.id ?? null;
    orgIdRef.current = orgId;
    setCollapsed(loadCollapsed());

    if (!orgId) {
      setSections(applySavedState());
      return;
    }

    refreshModSidebar(orgId);
  }, [currentOrg, refreshModSidebar]);

  // Re-fetch when marketplace installs/removes items
  useEffect(() => {
    const handler = () => {
      if (orgIdRef.current) refreshModSidebar(orgIdRef.current);
    };
    window.addEventListener("swarm-inventory-changed", handler);
    return () => window.removeEventListener("swarm-inventory-changed", handler);
  }, [refreshModSidebar]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSED_KEY, String(next)); } catch { }
      return next;
    });
  }, []);

  // ── Section-level drag ──

  const onSectionDragStart = (sectionId: string) => (e: DragEvent) => {
    setDragging({ kind: "section", sectionId });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `section:${sectionId}`);
  };

  const onSectionDragOver = (sectionId: string) => (e: DragEvent) => {
    if (!dragging || dragging.kind !== "section") return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (sectionId !== dragging.sectionId) setDropTarget({ sectionId });
  };

  const onSectionDrop = (targetSectionId: string) => (e: DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    if (!dragging || dragging.kind !== "section" || dragging.sectionId === targetSectionId) return;

    setSections(prev => {
      const arr = [...prev];
      const from = arr.findIndex(s => s.id === dragging.sectionId);
      const to = arr.findIndex(s => s.id === targetSectionId);
      if (from === -1 || to === -1) return prev;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      saveSectionOrder(arr);
      return arr;
    });
    setDragging(null);
  };

  // ── Item-level drag ──

  const onItemDragStart = (sectionId: string, itemId: string) => (e: DragEvent) => {
    e.stopPropagation(); // Don't trigger section drag
    setDragging({ kind: "item", sectionId, itemId });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `item:${sectionId}:${itemId}`);
  };

  const onItemDragOver = (sectionId: string, itemId: string) => (e: DragEvent) => {
    if (!dragging || dragging.kind !== "item") return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTarget({ sectionId, itemId });
  };

  const onItemDrop = (targetSectionId: string, targetItemId: string) => (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    if (!dragging || dragging.kind !== "item") return;
    if (dragging.sectionId === targetSectionId && dragging.itemId === targetItemId) {
      setDragging(null);
      return;
    }

    setSections(prev => {
      const next = prev.map(s => ({ ...s, items: [...s.items] }));
      const srcSection = next.find(s => s.id === dragging.sectionId);
      const dstSection = next.find(s => s.id === targetSectionId);
      if (!srcSection || !dstSection) return prev;

      const srcIdx = srcSection.items.findIndex(i => i.id === dragging.itemId);
      if (srcIdx === -1) return prev;

      const [movedItem] = srcSection.items.splice(srcIdx, 1);
      const dstIdx = dstSection.items.findIndex(i => i.id === targetItemId);
      if (dstIdx === -1) {
        dstSection.items.push(movedItem);
      } else {
        dstSection.items.splice(dstIdx, 0, movedItem);
      }

      saveSectionOrder(next);
      saveItemOrder(next);
      return next;
    });
    setDragging(null);
  };

  // Allow dropping items onto a section when it's empty or as a catch-all
  const onSectionDropForItem = (sectionId: string) => (e: DragEvent) => {
    if (!dragging || dragging.kind !== "item") return;
    e.preventDefault();
    setDropTarget(null);

    setSections(prev => {
      const next = prev.map(s => ({ ...s, items: [...s.items] }));
      const srcSection = next.find(s => s.id === dragging.sectionId);
      const dstSection = next.find(s => s.id === sectionId);
      if (!srcSection || !dstSection) return prev;

      const srcIdx = srcSection.items.findIndex(i => i.id === dragging.itemId);
      if (srcIdx === -1) return prev;

      const [movedItem] = srcSection.items.splice(srcIdx, 1);
      dstSection.items.push(movedItem);

      saveSectionOrder(next);
      saveItemOrder(next);
      return next;
    });
    setDragging(null);
  };

  const onDragEnd = () => {
    setDragging(null);
    setDropTarget(null);
  };

  return (
    <aside className={cn(
      "sticky top-16 h-[calc(100vh-4rem)] border-r border-border shrink-0 transition-all duration-300 flex flex-col",
      "bg-card/50 backdrop-blur-xl",
      collapsed ? "w-[52px]" : "w-56"
    )}>
      {/* Sections */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-thin">
        {sections.map((section) => {
          // Hide empty sections (e.g., Modifications with no installed mods)
          if (section.items.length === 0) return null;
          const colorKey = skin === "futuristic" ? "futuristic" : (section.accentColor || "amber");
          const colors = SECTION_COLORS[colorKey];
          return (
          <div
            key={section.id}
            draggable={!collapsed && dragging?.kind !== "item"}
            onDragStart={onSectionDragStart(section.id)}
            onDragOver={(e) => {
              onSectionDragOver(section.id)(e);
              // Also allow item drops onto section area
              if (dragging?.kind === "item") {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(e) => {
              if (dragging?.kind === "section") {
                onSectionDrop(section.id)(e);
              } else if (dragging?.kind === "item") {
                onSectionDropForItem(section.id)(e);
              }
            }}
            onDragEnd={onDragEnd}
            className={cn(
              "transition-all",
              dropTarget?.sectionId === section.id && !dropTarget?.itemId && `border-t-2 ${colors.dropIndicator}`,
              dragging?.kind === "section" && dragging.sectionId === section.id && "opacity-40"
            )}
          >
            {/* Section header */}
            {!collapsed && (
              <div className="flex items-center gap-1 px-3 pt-3 pb-1 group cursor-grab active:cursor-grabbing">
                <GripVertical className="h-3 w-3 text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
                <span className={cn("text-[10px] font-semibold uppercase tracking-wider", colors.headerText)}>
                  {section.label}
                </span>
              </div>
            )}

            {/* Items */}
            <div className={cn("space-y-0.5", collapsed ? "px-1" : "px-2")}>
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const isBeingDragged = dragging?.kind === "item" && dragging.itemId === item.id;
                const isDropTarget = dropTarget?.sectionId === section.id && dropTarget?.itemId === item.id;

                return (
                  <div
                    key={item.id}
                    draggable={!collapsed}
                    onDragStart={onItemDragStart(section.id, item.id)}
                    onDragOver={onItemDragOver(section.id, item.id)}
                    onDrop={onItemDrop(section.id, item.id)}
                    onDragEnd={onDragEnd}
                    className={cn(
                      "relative group/item",
                      isBeingDragged && "opacity-30",
                      isDropTarget && `before:absolute before:left-2 before:right-2 before:top-0 before:h-[2px] before:rounded-full ${colors.activeBar}`
                    )}
                  >
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                        collapsed ? "justify-center p-2" : "px-2.5 py-1.5",
                        isActive
                          ? `${colors.activeBg} ${colors.activeText} border ${colors.activeBorder}`
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                      )}
                    >
                      {isActive && (
                        <span className={cn("absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-full", colors.activeBar)} />
                      )}
                      {!collapsed && (
                        <GripVertical className="h-2.5 w-2.5 text-muted-foreground/0 group-hover/item:text-muted-foreground/40 transition-colors shrink-0 cursor-grab active:cursor-grabbing" />
                      )}
                      <item.icon className={cn("shrink-0", collapsed ? "h-4.5 w-4.5" : "h-4 w-4")} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && item.badge && (
                        <span className={cn("ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-medium", colors.badgeBg, colors.badgeText)}>
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}
      </nav>

      {/* Footer: Collapse + ⌘K hint */}
      <div className={cn(
        "border-t border-border p-2 space-y-1",
        collapsed ? "items-center" : ""
      )}>
        {!collapsed && (
          <button
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true }));
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Command className="h-3.5 w-3.5" />
            <span>Search</span>
            <kbd className="ml-auto text-[9px] px-1 py-0.5 rounded bg-muted border border-border font-mono">⌘K</kbd>
          </button>
        )}
        <button
          onClick={toggleCollapsed}
          className={cn(
            "flex items-center gap-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors",
            collapsed ? "w-full justify-center p-2" : "w-full px-2.5 py-1.5"
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed
            ? <ChevronRight className="h-3.5 w-3.5" />
            : <><ChevronLeft className="h-3.5 w-3.5" /><span>Collapse</span></>
          }
        </button>
      </div>
    </aside>
  );
}
