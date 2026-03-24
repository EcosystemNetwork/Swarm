/** OfficeProvider — Wraps the Office Sim with state + data fetching */
"use client";

import { useReducer, useEffect, useCallback } from "react";
import { useOrg } from "@/contexts/OrgContext";
import {
  OfficeContext,
  officeReducer,
  initialState,
  mapAgentStatus,
} from "./office-store";
import type { VisualAgent, Position } from "./types";
import { DEFAULT_LAYOUT } from "./types";

/** Assign desk positions to agents based on layout */
function assignPositions(
  agents: { id: string; name: string; status: string; model?: string }[],
): VisualAgent[] {
  const desks = DEFAULT_LAYOUT.desks;
  return agents.map((a, i) => {
    const desk = desks[i % desks.length];
    const status = mapAgentStatus(a.status);
    const zone = status === "error" ? "error_bay" as const
      : status === "offline" ? "corridor" as const
      : "desk" as const;
    const pos: Position = zone === "error_bay"
      ? { x: 730, y: 470 }
      : zone === "corridor"
      ? { x: 20, y: desk.position.y }
      : desk.position;

    return {
      id: a.id,
      name: a.name,
      status,
      position: pos,
      targetPosition: pos,
      zone,
      currentTask: null,
      speechBubble: null,
      parentAgentId: null,
      childAgentIds: [],
      lastActiveAt: Date.now(),
      toolCallCount: 0,
      model: a.model || null,
    };
  });
}

export function OfficeProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(officeReducer, initialState);
  const { currentOrg } = useOrg();

  const fetchAgents = useCallback(async () => {
    if (!currentOrg) return;
    try {
      const res = await fetch(`/api/agents?orgId=${currentOrg.id}`);
      if (!res.ok) return;
      const data = await res.json();
      const raw = (data.agents || data || []) as { id: string; name: string; status: string; model?: string }[];
      const visual = assignPositions(raw);
      dispatch({ type: "SET_AGENTS", agents: visual });
      dispatch({ type: "SET_CONNECTED", connected: true });
    } catch {
      dispatch({ type: "SET_CONNECTED", connected: false });
    }
  }, [currentOrg]);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 5000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  return (
    <OfficeContext.Provider value={{ state, dispatch }}>
      {children}
    </OfficeContext.Provider>
  );
}
