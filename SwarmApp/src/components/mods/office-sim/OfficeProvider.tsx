/** OfficeProvider — Wraps the Office Sim with state + data fetching + perception */
"use client";

import { useReducer, useEffect, useCallback, useRef, useState } from "react";
import { useOrg } from "@/contexts/OrgContext";
import {
  OfficeContext,
  officeReducer,
  initialState,
  mapAgentStatus,
  computeUtilization,
} from "./office-store";
import type { VisualAgent, Position, AgentVisualStatus, Particle } from "./types";
import { computeDynamicLayout, getStressTier, STRESS_COLORS } from "./types";
import { classifyTransition, generateNarrative, shouldHold, getZoneForStatus } from "./engine/perception";
import type { OfficeFurnitureData } from "./studio/furniture-types";
import type { OfficeTextureData } from "./studio/texture-types";
import type { OfficeArtPieceData } from "./studio/art-types";
import { getOrgArt } from "./studio/art-firestore";
import { batchGetAvatars } from "./studio/avatar-firestore";
import type { AgentAvatarData } from "./studio/avatar-types";
import { useHubStream } from "@/hooks/useHubStream";
import { detectLocale } from "./i18n";

/* ═══════════════════════════════════════
   Position Assignment
   ═══════════════════════════════════════ */

interface RawAgent {
  id: string;
  name: string;
  status: string;
  model?: string;
  type?: string;
  capabilities?: string[];
  bio?: string;
  asn?: string;
  description?: string;
  reportedSkills?: { skillId: string }[];
  department?: string;
}

function assignPositions(
  agents: RawAgent[],
  desks: { id: string; position: Position; assignedAgentId: string | null }[],
): VisualAgent[] {
  return agents.map((a, i) => {
    const desk = desks[i % desks.length];
    const status = mapAgentStatus(a.status);
    const zone = getZoneForStatus(status);
    const pos: Position = zone === "error_bay"
      ? { x: 730, y: 470 }
      : zone === "corridor"
      ? { x: 20, y: desk.position.y }
      : desk.position;

    const partial = {
      status,
      toolCallCount: 0,
      childAgentIds: [] as string[],
    };
    const utilization = computeUtilization(partial);

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
      agentType: a.type || null,
      capabilities: a.capabilities || a.reportedSkills?.map(s => s.skillId) || [],
      bio: a.bio || a.description || null,
      asn: a.asn || null,
      department: (a.department as VisualAgent["department"]) || null,
      utilization,
      stressTier: getStressTier(utilization),
    };
  });
}

/* ═══════════════════════════════════════
   Provider Component
   ═══════════════════════════════════════ */

export function OfficeProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(officeReducer, initialState);
  const { currentOrg } = useOrg();

  const [sseActive, setSseActive] = useState(false);
  const prevStatesRef = useRef<Map<string, AgentVisualStatus>>(new Map());
  const bubbleTimesRef = useRef<Map<string, number>>(new Map());
  const prevAgentCountRef = useRef(0);
  const avatarDataRef = useRef<Map<string, AgentAvatarData>>(new Map());

  /* ── Auto-detect locale on mount ── */
  useEffect(() => {
    dispatch({ type: "SET_LOCALE", locale: detectLocale() });
  }, []);

  /* ── SSE real-time stream (preferred) ── */
  useHubStream({
    orgId: currentOrg?.id,
    enabled: true,
    dispatch,
    onConnected: () => setSseActive(true),
    onDisconnected: () => setSseActive(false),
    onFallback: () => setSseActive(false),
  });

  /* ── Live agent fetching (initial load + periodic refresh) ── */
  const fetchAgents = useCallback(async () => {
    if (!currentOrg) return;
    try {
      const [agentRes, avatarRes] = await Promise.all([
        fetch(`/api/v1/mods/office-sim/hub-agents?orgId=${currentOrg.id}`),
        fetch(`/api/v1/plugins/assets?orgId=${currentOrg.id}&purpose=avatar`).catch(() => null),
      ]);
      if (!agentRes.ok) return;
      const data = await agentRes.json();
      const raw = (data.agents || []) as RawAgent[];

      if (typeof data.hubConnected === "boolean") {
        dispatch({ type: "SET_HUB_CONNECTED", hubConnected: data.hubConnected });
      }

      // Dynamic layout: recompute when agent count changes
      if (raw.length !== prevAgentCountRef.current) {
        prevAgentCountRef.current = raw.length;
        const dynamicLayout = computeDynamicLayout(raw.length);
        dispatch({ type: "SET_LAYOUT", layout: dynamicLayout });
      }

      const visual = assignPositions(raw, state.layout.desks);

      // Merge avatar assets from plugins API
      if (avatarRes?.ok) {
        try {
          const avatarData = await avatarRes.json();
          const assets = (avatarData.assets || []) as { agentId?: string; kind: string; url: string }[];
          const assetsByAgent = new Map<string, typeof assets>();
          for (const asset of assets) {
            if (!asset.agentId) continue;
            const list = assetsByAgent.get(asset.agentId) || [];
            list.push(asset);
            assetsByAgent.set(asset.agentId, list);
          }
          for (const agent of visual) {
            const agentAssets = assetsByAgent.get(agent.id);
            if (!agentAssets) continue;
            for (const asset of agentAssets) {
              if (asset.kind === "model-rigged" || asset.kind === "model-3d") {
                agent.modelUrl = asset.url;
              } else if (asset.kind === "sprite-2d") {
                agent.spriteUrl = asset.url;
              }
            }
          }
        } catch { /* procedural fallback */ }
      }

      // Merge avatar data from Firestore (includes spriteSheetUrl)
      for (const agent of visual) {
        const avatarEntry = avatarDataRef.current.get(agent.id);
        if (!avatarEntry) continue;
        if (avatarEntry.modelUrl && !agent.modelUrl) agent.modelUrl = avatarEntry.modelUrl;
        if (avatarEntry.spriteUrl && !agent.spriteUrl) agent.spriteUrl = avatarEntry.spriteUrl;
        if (avatarEntry.spriteSheetUrl) agent.spriteSheetUrl = avatarEntry.spriteSheetUrl;
        if (avatarEntry.animationUrls && !agent.animationUrls) agent.animationUrls = avatarEntry.animationUrls;
      }

      // Perception engine
      const now = Date.now();
      for (const agent of visual) {
        const prevStatus = prevStatesRef.current.get(agent.id);
        if (prevStatus && prevStatus !== agent.status) {
          const eventType = classifyTransition(prevStatus, agent.status);
          const lastBubbleTime = bubbleTimesRef.current.get(agent.id) || 0;

          if (!shouldHold(lastBubbleTime, now)) {
            const narrative = generateNarrative(agent, eventType);
            agent.speechBubble = narrative;
            bubbleTimesRef.current.set(agent.id, now);
          }

          dispatch({
            type: "PUSH_ACTIVITY",
            event: {
              timestamp: now,
              agentId: agent.id,
              agentName: agent.name,
              type: eventType === "error_onset" ? "error"
                : eventType === "recovery" ? "recovery"
                : eventType === "spawn" ? "spawn"
                : eventType === "despawn" ? "despawn"
                : "status_change",
              description: `${agent.name}: ${prevStatus} → ${agent.status}`,
            },
          });

          // Spawn particles for lifecycle events
          const particleCount = eventType === "spawn" ? 8
            : eventType === "error_onset" ? 6
            : eventType === "recovery" ? 5
            : 0;
          if (particleCount > 0) {
            const pType = eventType === "error_onset" ? "error" as const
              : eventType === "spawn" ? "spark" as const
              : "work" as const;
            const pColor = eventType === "error_onset" ? STRESS_COLORS.overloaded.primary
              : eventType === "spawn" ? "#60a5fa"
              : STRESS_COLORS.normal.primary;
            const newParticles: Particle[] = [];
            for (let pi = 0; pi < particleCount; pi++) {
              newParticles.push({
                id: now + pi,
                x: agent.position.x + 40,
                y: agent.position.y + 30,
                vx: (Math.random() - 0.5) * 3,
                vy: -Math.random() * 2 - 1,
                life: 1,
                maxLife: 1.2 + Math.random() * 0.6,
                color: pColor,
                size: 2 + Math.random() * 2,
                type: pType,
              });
            }
            dispatch({ type: "SET_PARTICLES", particles: newParticles });
          }
        }
        prevStatesRef.current.set(agent.id, agent.status);
      }

      dispatch({ type: "SET_AGENTS", agents: visual });
      dispatch({ type: "SET_CONNECTED", connected: true });
    } catch {
      dispatch({ type: "SET_CONNECTED", connected: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg, state.layout.desks]);

  /* ── Polling loop ── */
  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, sseActive ? 30_000 : 5_000);
    return () => clearInterval(interval);
  }, [fetchAgents, sseActive]);

  /* ── Fetch furniture + textures + art when theme changes ── */
  useEffect(() => {
    if (!currentOrg) return;
    const themeId = state.theme.id;

    Promise.all([
      fetch(`/api/v1/plugins/assets?orgId=${currentOrg.id}&purpose=furniture&themeId=${themeId}`).catch(() => null),
      fetch(`/api/v1/plugins/assets?orgId=${currentOrg.id}&purpose=texture&themeId=${themeId}`).catch(() => null),
    ]).then(async ([furnitureRes, textureRes]) => {
      if (furnitureRes?.ok) {
        try {
          const data = await furnitureRes.json();
          const furnitureMap = new Map<string, OfficeFurnitureData>();
          if (data.furniture) {
            for (const [cat, info] of Object.entries(data.furniture)) {
              furnitureMap.set(cat, info as OfficeFurnitureData);
            }
          }
          dispatch({ type: "SET_FURNITURE", furniture: furnitureMap });
        } catch { /* graceful */ }
      }
      if (textureRes?.ok) {
        try {
          const data = await textureRes.json();
          const textureMap = new Map<string, OfficeTextureData>();
          if (data.textures) {
            for (const [mat, info] of Object.entries(data.textures)) {
              textureMap.set(mat, info as OfficeTextureData);
            }
          }
          dispatch({ type: "SET_TEXTURES", textures: textureMap });
        } catch { /* graceful */ }
      }
    });

    // Fetch art data from Firestore directly (client-side)
    getOrgArt(currentOrg.id, themeId)
      .then((artMap) => {
        dispatch({ type: "SET_ART", art: artMap });
      })
      .catch(() => { /* graceful — no art yet */ });

    // Fetch avatar data from Firestore (spriteSheetUrl, etc.)
    batchGetAvatars(currentOrg.id)
      .then((avatarMap) => {
        avatarDataRef.current = avatarMap;
      })
      .catch(() => { /* graceful — no custom avatars yet */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg, state.theme.id]);

  return (
    <OfficeContext.Provider value={{ state, dispatch }}>
      {children}
    </OfficeContext.Provider>
  );
}
