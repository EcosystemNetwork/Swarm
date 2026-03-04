"use client";

import { useState, useEffect, useCallback, type DragEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, FolderKanban, Users, Briefcase, MessageSquare,
  LayoutGrid, Shield, Package, Clock, Activity, BarChart3, Settings,
  Map, Calendar, Radio, FileText, ChevronLeft, ChevronRight, GripVertical,
  Command,
} from "lucide-react";

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
}

const DEFAULT_SECTIONS: NavSection[] = [
  {
    id: "core",
    label: "Core",
    items: [
      { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "projects", href: "/swarms", label: "Projects", icon: FolderKanban },
      { id: "agents", href: "/agents", label: "Agents", icon: Users },
      { id: "board", href: "/kanban", label: "Board", icon: LayoutGrid },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { id: "jobs", href: "/jobs", label: "Jobs", icon: Briefcase },
      { id: "channels", href: "/chat", label: "Channels", icon: MessageSquare },
      { id: "approvals", href: "/approvals", label: "Approvals", icon: Shield },
      { id: "cron", href: "/cron", label: "Scheduler", icon: Clock },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    items: [
      { id: "activity", href: "/activity", label: "Activity", icon: Activity },
      { id: "metrics", href: "/metrics", label: "Metrics", icon: BarChart3 },
      { id: "skills", href: "/skills", label: "Skills", icon: Package },
      { id: "agent-map", href: "/agent-map", label: "Agent Map", icon: Map },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { id: "logs", href: "/logs", label: "Logs", icon: FileText },
      { id: "settings", href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const STORAGE_KEY = "swarm-sidebar-order";
const COLLAPSED_KEY = "swarm-sidebar-collapsed";

function loadSectionOrder(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
}

function saveSectionOrder(order: string[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(order)); } catch { }
}

function loadCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(COLLAPSED_KEY) === "true"; } catch { return false; }
}

function applySavedOrder(sections: NavSection[]): NavSection[] {
  const order = loadSectionOrder();
  if (!order) return sections;
  const lookup: Record<string, NavSection> = {};
  const used: Record<string, boolean> = {};
  for (const s of sections) lookup[s.id] = s;
  const ordered: NavSection[] = [];
  for (const id of order) {
    if (lookup[id]) { ordered.push(lookup[id]); used[id] = true; }
  }
  // Append any new sections not in the saved order
  for (const s of sections) {
    if (!used[s.id]) ordered.push(s);
  }
  return ordered;
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [sections, setSections] = useState<NavSection[]>(DEFAULT_SECTIONS);
  const [draggedSection, setDraggedSection] = useState<string | null>(null);
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);

  // Load user's saved order on mount
  useEffect(() => {
    setSections(applySavedOrder(DEFAULT_SECTIONS));
    setCollapsed(loadCollapsed());
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSED_KEY, String(next)); } catch { }
      return next;
    });
  }, []);

  // ── Drag-and-drop section reordering ──

  const handleDragStart = (sectionId: string) => (e: DragEvent) => {
    setDraggedSection(sectionId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", sectionId);
  };

  const handleDragOver = (sectionId: string) => (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (sectionId !== draggedSection) setDragOverSection(sectionId);
  };

  const handleDrop = (targetId: string) => (e: DragEvent) => {
    e.preventDefault();
    setDragOverSection(null);
    if (!draggedSection || draggedSection === targetId) return;

    setSections(prev => {
      const arr = [...prev];
      const fromIdx = arr.findIndex(s => s.id === draggedSection);
      const toIdx = arr.findIndex(s => s.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      saveSectionOrder(arr.map(s => s.id));
      return arr;
    });
    setDraggedSection(null);
  };

  const handleDragEnd = () => {
    setDraggedSection(null);
    setDragOverSection(null);
  };

  return (
    <aside className={cn(
      "sticky top-16 h-[calc(100vh-4rem)] border-r border-border shrink-0 transition-all duration-300 flex flex-col",
      "bg-card/50 backdrop-blur-xl",
      collapsed ? "w-[52px]" : "w-56"
    )}>
      {/* Sections */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-thin">
        {sections.map((section) => (
          <div
            key={section.id}
            draggable={!collapsed}
            onDragStart={handleDragStart(section.id)}
            onDragOver={handleDragOver(section.id)}
            onDrop={handleDrop(section.id)}
            onDragEnd={handleDragEnd}
            className={cn(
              "transition-all",
              dragOverSection === section.id && "border-t-2 border-amber-500/50",
              draggedSection === section.id && "opacity-40"
            )}
          >
            {/* Section header */}
            {!collapsed && (
              <div className="flex items-center gap-1 px-3 pt-3 pb-1 group cursor-grab active:cursor-grabbing">
                <GripVertical className="h-3 w-3 text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                  {section.label}
                </span>
              </div>
            )}

            {/* Items */}
            <div className={cn("space-y-0.5", collapsed ? "px-1" : "px-2")}>
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                      collapsed ? "justify-center p-2" : "px-2.5 py-1.5",
                      isActive
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-amber-500 rounded-full" />
                    )}
                    <item.icon className={cn("shrink-0", collapsed ? "h-4.5 w-4.5" : "h-4 w-4")} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && item.badge && (
                      <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: Collapse + ⌘K hint */}
      <div className={cn(
        "border-t border-border p-2 space-y-1",
        collapsed ? "items-center" : ""
      )}>
        {!collapsed && (
          <button
            onClick={() => {
              // Dispatch Cmd+K
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
