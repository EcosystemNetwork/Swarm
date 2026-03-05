/** Agent Map Palette — Draggable sidebar with n8n-style workflow node categories. */
"use client";

import { useState } from "react";
import { NODE_CATALOG, type CatalogNodeItem } from "./agent-map-node-catalog";
import { ChevronDown, Search } from "lucide-react";

interface AgentMapPaletteProps {
  agents: Array<{ id: string; name: string; type: string; status: string }>;
}

const TYPE_ICONS: Record<string, string> = {
  Research: "🔬", Trading: "📈", Operations: "⚙️", Support: "🛟",
  Analytics: "📊", Scout: "🔍", Security: "🛡️", Creative: "🎨",
  Engineering: "🔧", DevOps: "🚀", Marketing: "📢", Finance: "💰",
  Data: "📦", Coordinator: "🎯", Legal: "⚖️", Communication: "📡",
};

const CATEGORY_BORDER_COLORS: Record<string, string> = {
  amber: "border-amber-400/60 hover:border-amber-400",
  purple: "border-purple-400/60 hover:border-purple-400",
  blue: "border-blue-400/60 hover:border-blue-400",
  orange: "border-orange-400/60 hover:border-orange-400",
  red: "border-red-400/60 hover:border-red-400",
  yellow: "border-yellow-400/60 hover:border-yellow-400",
};

const CATEGORY_BG_COLORS: Record<string, string> = {
  amber: "bg-amber-500/5",
  purple: "bg-purple-500/5",
  blue: "bg-blue-500/5",
  orange: "bg-orange-500/5",
  red: "bg-red-500/5",
  yellow: "bg-yellow-500/5",
};

export function AgentMapPalette({ agents }: AgentMapPaletteProps) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const onDragStart = (event: React.DragEvent, nodeType: string, data: string) => {
    event.dataTransfer.setData("application/reactflow-type", nodeType);
    event.dataTransfer.setData("application/reactflow-data", data);
    event.dataTransfer.effectAllowed = "move";
  };

  const toggleCategory = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const lowerSearch = search.toLowerCase();

  const filterItem = (item: CatalogNodeItem) =>
    !search || item.label.toLowerCase().includes(lowerSearch) || item.description.toLowerCase().includes(lowerSearch);

  const filteredAgents = agents.filter(
    (a) => !search || a.name.toLowerCase().includes(lowerSearch) || a.type.toLowerCase().includes(lowerSearch)
  );

  return (
    <div className="w-64 border-l border-border bg-muted/50 overflow-y-auto p-3 space-y-3 flex-shrink-0">
      {/* Title */}
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
        Node Palette
      </h3>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search nodes..."
          className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/50 placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Static categories from catalog */}
      {NODE_CATALOG.map((category) => {
        const items = category.items.filter(filterItem);
        if (items.length === 0) return null;
        const isCollapsed = collapsed.has(category.id);

        return (
          <div key={category.id}>
            <button
              onClick={() => toggleCategory(category.id)}
              className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground mb-1.5 px-1 hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <span>{category.icon}</span>
                <span>{category.label}</span>
                <span className="text-[10px] text-muted-foreground/60">({items.length})</span>
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
              />
            </button>

            {!isCollapsed && (
              <div className="space-y-1.5">
                {items.map((item) => (
                  <div
                    key={item.nodeType}
                    draggable
                    onDragStart={(e) =>
                      onDragStart(e, item.nodeType, JSON.stringify(item.defaultData))
                    }
                    className={`p-2.5 rounded-lg border border-dashed cursor-grab active:cursor-grabbing transition-all hover:shadow-sm ${
                      CATEGORY_BORDER_COLORS[item.color] || "border-border"
                    } ${CATEGORY_BG_COLORS[item.color] || "bg-muted/30"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Dynamic Agents section */}
      {filteredAgents.length > 0 && (
        <div>
          <button
            onClick={() => toggleCategory("agents")}
            className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground mb-1.5 px-1 hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <span>🤖</span>
              <span>Agents</span>
              <span className="text-[10px] text-muted-foreground/60">({filteredAgents.length})</span>
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${collapsed.has("agents") ? "-rotate-90" : ""}`}
            />
          </button>

          {!collapsed.has("agents") && (
            <div className="space-y-1.5">
              {filteredAgents.map((agent) => (
                <div
                  key={agent.id}
                  draggable
                  onDragStart={(e) =>
                    onDragStart(
                      e,
                      "agentNode",
                      JSON.stringify({
                        label: agent.name,
                        agentName: agent.name,
                        type: agent.type,
                        status: agent.status,
                        taskCount: 0,
                        activeCount: 0,
                        costEstimate: "$0.00",
                        assignedCost: 0,
                      })
                    )
                  }
                  className="p-2.5 rounded-lg border border-border bg-card cursor-grab active:cursor-grabbing hover:border-amber-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center text-[10px] font-bold text-amber-700 dark:text-amber-400">
                      {agent.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{agent.name}</p>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          {TYPE_ICONS[agent.type] || "🤖"} {agent.type}
                        </span>
                        <span
                          className={`w-1.5 h-1.5 rounded-full ml-auto ${
                            agent.status === "online"
                              ? "bg-emerald-500"
                              : agent.status === "busy"
                              ? "bg-orange-500"
                              : "bg-muted-foreground/40"
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {search && filteredAgents.length === 0 && NODE_CATALOG.every((c) => c.items.filter(filterItem).length === 0) && (
        <div className="text-center py-4 text-muted-foreground">
          <p className="text-xs">No nodes match &ldquo;{search}&rdquo;</p>
        </div>
      )}
    </div>
  );
}
