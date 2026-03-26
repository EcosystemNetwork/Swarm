/** Office2D — Isometric 2D floor plan with stress escalation, particles,
 *  deliveries, CEO avatar, department colors, decorative detail, break room,
 *  and localized labels */
"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useOffice, getFilteredAgents } from "./office-store";
import { STATUS_COLORS, STATUS_ICONS, STRESS_COLORS, STRESS_ICONS, BREAK_SPOTS } from "./types";
import type { VisualAgent, DeskSlot, RoomConfig, AgentVisualStatus, Particle, DeliveryAnimation, Position, StressTier } from "./types";
import type { OfficeTheme } from "./themes";
import { getDepartmentColors } from "./themes";
import type { DepartmentId } from "./types";
import { t } from "./i18n";
import { DEFAULT_ART_SLOTS, ART_PIPELINE, ART_LABELS } from "./studio/art-types";
import type { ArtSlot, OfficeArtPieceData } from "./studio/art-types";
import { ArtCustomizeDialog } from "./studio/ArtCustomizeDialog";
import { useOrg } from "@/contexts/OrgContext";
import {
  EXPANDED_SPRITE_CONFIG,
  ANIM_ROWS,
  ANIM_SPEEDS,
} from "./engine/sprite-system";
import type { SpriteAnimationType } from "./engine/sprite-system";

/* ═══════════════════════════════════════
   Constants
   ═══════════════════════════════════════ */

const CEO_SIZE = 14;
const CEO_SPEED = 3;
const PARTICLE_TICK_MS = 40;

/** Map agent visual status to the expanded sprite animation type */
function getAnimationType(status: AgentVisualStatus): SpriteAnimationType {
  switch (status) {
    case "active":
    case "tool_calling":
      return "working";
    case "thinking":
      return "thinking";
    case "speaking":
      return "talking";
    case "error":
      return "error";
    case "blocked":
      return "error";
    case "spawning":
      return "spawning";
    case "idle":
      return "idle";
    case "offline":
      return "idle";
    default:
      return "idle";
  }
}

/* ═══════════════════════════════════════
   Main Component
   ═══════════════════════════════════════ */

export function Office2D() {
  const { state, dispatch } = useOffice();
  const { agents, layout, collaborationLinks, selectedAgentId, theme, deliveries, particles, ceoPosition, ceoActive, locale, art } = state;
  const { currentOrg } = useOrg();
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [artDialogSlotId, setArtDialogSlotId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const strings = useMemo(() => t(locale), [locale]);
  const artDialogSlot = artDialogSlotId ? DEFAULT_ART_SLOTS.find(s => s.id === artDialogSlotId) : null;

  const agentList = Array.from(agents.values());
  const filteredIds = getFilteredAgents(state);
  const canvasW = layout.canvasWidth;
  const canvasH = layout.canvasHeight;

  const selectAgent = useCallback((id: string | null) => {
    dispatch({ type: "SELECT_AGENT", id });
  }, [dispatch]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.5, Math.min(2, z - e.deltaY * 0.001)));
  }, []);

  /* ── CEO keyboard navigation ── */
  useEffect(() => {
    if (!ceoActive) return;
    const onDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(e.key)) {
        e.preventDefault();
        keysRef.current.add(e.key);
      }
      if (e.key === "Escape") dispatch({ type: "SET_CEO_ACTIVE", active: false });
    };
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);

    const tick = setInterval(() => {
      const keys = keysRef.current;
      let dx = 0, dy = 0;
      if (keys.has("ArrowLeft") || keys.has("a")) dx -= CEO_SPEED;
      if (keys.has("ArrowRight") || keys.has("d")) dx += CEO_SPEED;
      if (keys.has("ArrowUp") || keys.has("w")) dy -= CEO_SPEED;
      if (keys.has("ArrowDown") || keys.has("s")) dy += CEO_SPEED;
      if (dx || dy) {
        dispatch({
          type: "SET_CEO_POSITION",
          position: {
            x: Math.max(0, Math.min(canvasW - CEO_SIZE, ceoPosition.x + dx)),
            y: Math.max(0, Math.min(canvasH - CEO_SIZE, ceoPosition.y + dy)),
          },
        });
      }
    }, 16);

    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      clearInterval(tick);
    };
  }, [ceoActive, ceoPosition, canvasW, canvasH, dispatch]);

  /* ── Particle tick ── */
  useEffect(() => {
    if (particles.length === 0) return;
    const tick = setInterval(() => {
      const updated = particles
        .map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.05, // gravity
          life: p.life - (PARTICLE_TICK_MS / 1000) / p.maxLife,
        }))
        .filter(p => p.life > 0);
      dispatch({ type: "SET_PARTICLES", particles: updated });
    }, PARTICLE_TICK_MS);
    return () => clearInterval(tick);
  }, [particles, dispatch]);

  /* ── Delivery animation tick ── */
  useEffect(() => {
    if (deliveries.length === 0) return;
    const tick = setInterval(() => {
      const updated = deliveries
        .map(d => ({ ...d, progress: d.progress + 0.02 }))
        .filter(d => d.progress < 1);
      dispatch({ type: "UPDATE_DELIVERIES", deliveries: updated });
    }, 32);
    return () => clearInterval(tick);
  }, [deliveries, dispatch]);

  /* ── Clock time for decorative clock ── */
  const [clockAngle, setClockAngle] = useState(0);
  useEffect(() => {
    const tick = setInterval(() => {
      const d = new Date();
      setClockAngle((d.getMinutes() * 6) + (d.getSeconds() * 0.1));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-border bg-card" onWheel={handleWheel}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        className="w-full h-auto"
        style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
        onClick={() => {
          if (!ceoActive) dispatch({ type: "SET_CEO_ACTIVE", active: true });
        }}
      >
        {/* ── Defs ── */}
        <defs>
          <pattern id="office-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke={theme.svgGridColor} strokeWidth="0.5" />
          </pattern>
          <filter id="bubble-shadow">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.5" />
          </filter>
          <filter id="stress-glow-busy">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feFlood floodColor={STRESS_COLORS.busy.glow} result="color" />
            <feComposite in="color" in2="blur" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="stress-glow-stressed">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor={STRESS_COLORS.stressed.glow} result="color" />
            <feComposite in="color" in2="blur" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="stress-glow-overloaded">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feFlood floodColor={STRESS_COLORS.overloaded.glow} result="color" />
            <feComposite in="color" in2="blur" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── Background ── */}
        <rect width={canvasW} height={canvasH} fill={theme.svgBackground} />
        <rect width={canvasW} height={canvasH} fill="url(#office-grid)" />

        {/* ── Decorative: wall clock ── */}
        <g transform="translate(15, 15)">
          <circle r="12" cx="12" cy="12" fill="none" stroke="hsl(215, 20%, 25%)" strokeWidth="1" />
          <line x1="12" y1="12" x2="12" y2="5" stroke="hsl(215, 20%, 50%)" strokeWidth="1" transform={`rotate(${clockAngle}, 12, 12)`} />
          <circle r="1.5" cx="12" cy="12" fill="hsl(215, 20%, 40%)" />
        </g>

        {/* ── Decorative: potted plants ── */}
        <PlantSvg x={canvasW - 50} y={20} />
        <PlantSvg x={canvasW - 50} y={canvasH - 50} />

        {/* ── Rooms ── */}
        {layout.rooms.map((room) => (
          <RoomSvg key={room.id} room={room} theme={theme} strings={strings} breakSpots={room.type === "break" ? BREAK_SPOTS : undefined} />
        ))}

        {/* ── Art Slots ── */}
        {DEFAULT_ART_SLOTS.map((slot) => (
          <ArtSlotSvg
            key={slot.id}
            slot={slot}
            artData={art.get(slot.id)}
            canvasW={canvasW}
            theme={theme}
            onClick={() => setArtDialogSlotId(slot.id)}
          />
        ))}

        {/* ── Collaboration lines ── */}
        {collaborationLinks.map((link, i) => {
          const source = agents.get(link.sourceId);
          const target = agents.get(link.targetId);
          if (!source || !target) return null;
          return (
            <line
              key={i}
              x1={source.position.x + 40}
              y1={source.position.y + 30}
              x2={target.position.x + 40}
              y2={target.position.y + 30}
              stroke="#3b82f6"
              strokeWidth={1 + link.strength * 2}
              strokeDasharray="6 4"
              opacity={0.4 + link.strength * 0.4}
            />
          );
        })}

        {/* ── Delivery animations ── */}
        {deliveries.map((del) => (
          <DeliverySvg key={del.id} delivery={del} agents={agents} />
        ))}

        {/* ── Desks ── */}
        {layout.desks.map((desk, i) => {
          const agent = agentList[i];
          const dimmed = agent ? !filteredIds.has(agent.id) : false;
          return (
            <DeskSvg
              key={desk.id}
              desk={desk}
              agent={agent || null}
              selected={agent?.id === selectedAgentId}
              hovered={agent?.id === hoveredAgent}
              dimmed={dimmed}
              theme={theme}
              strings={strings}
              onHover={(id) => setHoveredAgent(id)}
              onSelect={(id) => selectAgent(id)}
            />
          );
        })}

        {/* ── Particles ── */}
        {particles.map((p) => (
          <circle
            key={p.id}
            cx={p.x}
            cy={p.y}
            r={p.size * p.life}
            fill={p.color}
            opacity={p.life * 0.8}
          />
        ))}

        {/* ── CEO Avatar ── */}
        {ceoActive && (
          <g transform={`translate(${ceoPosition.x}, ${ceoPosition.y})`}>
            <rect width={CEO_SIZE} height={CEO_SIZE} rx="3" fill="hsl(48, 100%, 50%)" stroke="hsl(48, 100%, 70%)" strokeWidth="1.5">
              <animate attributeName="opacity" values="0.8;1;0.8" dur="1.5s" repeatCount="indefinite" />
            </rect>
            <text x={CEO_SIZE / 2} y={CEO_SIZE / 2 + 3} textAnchor="middle" fontSize="8" fill="#1a1a2e" fontWeight="bold">
              {strings.ceo}
            </text>
            <text x={CEO_SIZE / 2} y={CEO_SIZE + 10} textAnchor="middle" fontSize="6" fill="hsl(48, 100%, 70%)">
              WASD
            </text>
          </g>
        )}

        {/* ── Queue zone ── */}
        <g transform={`translate(30, ${canvasH - 90})`}>
          <rect width="200" height="50" rx="4" fill="hsl(217, 33%, 10%)" stroke="hsl(217, 33%, 18%)" strokeWidth="1" />
          <text x="100" y="18" textAnchor="middle" fill="hsl(215, 20%, 55%)" fontSize="9" fontWeight="500">
            {strings.queueInbox}
          </text>
          <text x="100" y="36" textAnchor="middle" fill="hsl(215, 20%, 45%)" fontSize="11">
            {agentList.filter(a => !a.currentTask && a.status !== "offline").length} {strings.idle}
          </text>
        </g>
      </svg>

      {/* ── Hover tooltip ── */}
      {hoveredAgent && agents.get(hoveredAgent) && (
        <AgentTooltip agent={agents.get(hoveredAgent)!} strings={strings} />
      )}

      {/* ── CEO activation hint ── */}
      {!ceoActive && (
        <div className="absolute bottom-2 right-2 text-[10px] text-muted-foreground/50 pointer-events-none">
          Click to activate CEO mode
        </div>
      )}

      {/* ── Art Customize Dialog ── */}
      {artDialogSlot && currentOrg && (
        <ArtCustomizeDialog
          slot={artDialogSlot}
          orgId={currentOrg.id}
          theme={theme}
          open={!!artDialogSlotId}
          onOpenChange={(open) => { if (!open) setArtDialogSlotId(null); }}
          onArtChanged={() => {
            setArtDialogSlotId(null);
            // Trigger art refetch via provider
            dispatch({ type: "SET_THEME", theme: { ...theme } });
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   Sub-Components
   ═══════════════════════════════════════ */

function PlantSvg({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Pot */}
      <rect x="4" y="16" width="16" height="10" rx="2" fill="hsl(25, 30%, 20%)" stroke="hsl(25, 20%, 30%)" strokeWidth="0.5" />
      {/* Soil */}
      <ellipse cx="12" cy="16" rx="7" ry="2" fill="hsl(20, 40%, 15%)" />
      {/* Leaves */}
      <ellipse cx="10" cy="10" rx="4" ry="6" fill="hsl(140, 50%, 25%)" transform="rotate(-15, 10, 10)" />
      <ellipse cx="14" cy="8" rx="3" ry="5" fill="hsl(140, 45%, 30%)" transform="rotate(10, 14, 8)" />
      <ellipse cx="12" cy="6" rx="3" ry="4" fill="hsl(140, 55%, 22%)" />
    </g>
  );
}

interface RoomStrings {
  meetingRoom: string;
  breakRoom: string;
  errorBay: string;
  serverRoom: string;
}

function RoomSvg({ room, theme, strings, breakSpots }: {
  room: RoomConfig;
  theme: OfficeTheme;
  strings: RoomStrings;
  breakSpots?: typeof BREAK_SPOTS;
}) {
  const colors: Record<string, { bg: string; border: string }> = {
    meeting: theme.svgRoomMeeting,
    break: theme.svgRoomBreak,
    server: theme.svgRoomServer,
    error_bay: theme.svgRoomErrorBay,
  };
  const c = colors[room.type] || colors.meeting;

  const localizedLabel =
    room.type === "meeting" ? strings.meetingRoom :
    room.type === "break" ? strings.breakRoom :
    room.type === "error_bay" ? strings.errorBay :
    room.type === "server" ? strings.serverRoom :
    room.label;

  return (
    <g>
      <rect
        x={room.position.x}
        y={room.position.y}
        width={room.width}
        height={room.height}
        rx="4"
        fill={c.bg}
        stroke={c.border}
        strokeWidth="1"
        strokeDasharray={room.type === "error_bay" ? "4 3" : "none"}
      />
      <text
        x={room.position.x + room.width / 2}
        y={room.position.y + 16}
        textAnchor="middle"
        fill="hsl(215, 20%, 50%)"
        fontSize="9"
        fontWeight="500"
      >
        {localizedLabel.toUpperCase()}
      </text>

      {/* Break room furniture */}
      {breakSpots && breakSpots.map((spot, i) => (
        <BreakFurnitureSvg
          key={i}
          spot={spot}
          roomX={room.position.x}
          roomY={room.position.y + 24}
        />
      ))}
    </g>
  );
}

function BreakFurnitureSvg({ spot, roomX, roomY }: {
  spot: typeof BREAK_SPOTS[0];
  roomX: number;
  roomY: number;
}) {
  const x = roomX + spot.position.x;
  const y = roomY + spot.position.y;

  if (spot.furniture === "sofa") {
    return (
      <g>
        <rect x={x} y={y} width="28" height="12" rx="3" fill="hsl(260, 20%, 22%)" stroke="hsl(260, 15%, 30%)" strokeWidth="0.5" />
        <rect x={x + 2} y={y + 2} width="24" height="6" rx="2" fill="hsl(260, 25%, 28%)" />
      </g>
    );
  }
  if (spot.furniture === "table") {
    return (
      <g>
        <rect x={x} y={y} width="18" height="18" rx="2" fill="hsl(30, 25%, 18%)" stroke="hsl(30, 20%, 28%)" strokeWidth="0.5" />
        {/* Coffee cup */}
        <circle cx={x + 12} cy={y + 6} r="2.5" fill="hsl(30, 20%, 12%)" stroke="hsl(30, 15%, 25%)" strokeWidth="0.3" />
      </g>
    );
  }
  if (spot.furniture === "counter") {
    return (
      <rect x={x} y={y} width="30" height="8" rx="1" fill="hsl(0, 0%, 16%)" stroke="hsl(0, 0%, 24%)" strokeWidth="0.5" />
    );
  }
  // Default: small chair
  return (
    <rect x={x} y={y} width="10" height="10" rx="2" fill="hsl(215, 15%, 18%)" stroke="hsl(215, 15%, 25%)" strokeWidth="0.3" />
  );
}

function DeliverySvg({ delivery, agents }: {
  delivery: DeliveryAnimation;
  agents: Map<string, VisualAgent>;
}) {
  const source = agents.get(delivery.sourceId);
  const target = agents.get(delivery.targetId);
  if (!source || !target) return null;

  const sx = source.position.x + 40;
  const sy = source.position.y + 30;
  const tx = target.position.x + 40;
  const ty = target.position.y + 30;

  const px = sx + (tx - sx) * delivery.progress;
  const py = sy + (ty - sy) * delivery.progress - Math.sin(delivery.progress * Math.PI) * 20;

  const color = delivery.type === "message" ? "#60a5fa"
    : delivery.type === "task" ? "#fbbf24"
    : "#34d399";

  return (
    <g>
      {/* Trail */}
      <line
        x1={sx} y1={sy} x2={px} y2={py}
        stroke={color}
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity={0.3}
      />
      {/* Package */}
      <circle cx={px} cy={py} r={4} fill={color} opacity={0.9}>
        <animate attributeName="r" values="3;5;3" dur="0.5s" repeatCount="indefinite" />
      </circle>
      {/* Label */}
      <text x={px} y={py - 8} textAnchor="middle" fontSize="6" fill={color} opacity={0.7}>
        {delivery.type === "message" ? "MSG" : delivery.type === "task" ? "TASK" : "DATA"}
      </text>
    </g>
  );
}

function DeskSvg({
  desk,
  agent,
  selected,
  hovered,
  dimmed,
  theme,
  strings,
  onHover,
  onSelect,
}: {
  desk: DeskSlot;
  agent: VisualAgent | null;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
  theme: OfficeTheme;
  strings: { empty: string };
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}) {
  const { x, y } = desk.position;
  const statusColor = agent ? STATUS_COLORS[agent.status] : "#374151";
  const icon = agent ? STATUS_ICONS[agent.status] : "";

  // Stress-tier visual escalation
  const stressTier: StressTier = agent?.stressTier || "normal";
  const stressColors = STRESS_COLORS[stressTier];
  const stressIcon = STRESS_ICONS[stressTier];
  const stressFilter = stressTier === "overloaded" ? "url(#stress-glow-overloaded)"
    : stressTier === "stressed" ? "url(#stress-glow-stressed)"
    : stressTier === "busy" ? "url(#stress-glow-busy)"
    : undefined;

  // Department color tint
  const deptId = (desk.department || agent?.department || "unassigned") as DepartmentId;
  const deptColors = getDepartmentColors(theme, deptId);

  // Monitor content based on status
  const monitorContent = agent
    ? agent.status === "active" || agent.status === "tool_calling"
      ? "hsl(140, 60%, 35%)" // green code
      : agent.status === "thinking"
      ? "hsl(50, 80%, 40%)" // yellow processing
      : agent.status === "error"
      ? "hsl(0, 70%, 40%)" // red error
      : agent.status === "blocked"
      ? "hsl(30, 80%, 40%)" // amber blocked
      : "hsl(215, 20%, 15%)" // dark idle
    : "hsl(215, 20%, 10%)";

  return (
    <g
      className="cursor-pointer"
      opacity={dimmed ? 0.2 : 1}
      filter={agent && !dimmed ? stressFilter : undefined}
      onMouseEnter={() => agent && onHover(agent.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => agent && !dimmed && onSelect(agent.id)}
    >
      {/* Department floor tint */}
      {deptId !== "unassigned" && (
        <rect
          x={x - 4}
          y={y - 4}
          width={88}
          height={64}
          rx="6"
          fill={deptColors.floor}
          opacity={0.3}
        />
      )}

      {/* Desk surface */}
      <rect
        x={x}
        y={y}
        width={80}
        height={56}
        rx="4"
        fill={selected ? "rgba(251, 191, 36, 0.08)" : hovered ? "rgba(255, 255, 255, 0.04)" : theme.svgDeskFill}
        stroke={selected ? theme.accentColor : deptId !== "unassigned" ? deptColors.accent + "40" : theme.svgDeskStroke}
        strokeWidth={selected ? 2 : 1}
      />

      {/* Monitor */}
      <rect x={x + 25} y={y + 6} width={30} height={20} rx="2" fill={theme.svgMonitorFill} stroke={theme.svgMonitorStroke} strokeWidth="0.5" />
      {/* Monitor screen content */}
      <rect x={x + 27} y={y + 8} width={26} height={16} rx="1" fill={monitorContent} opacity={0.6} />
      {/* Monitor screen lines (code) */}
      {agent && (agent.status === "active" || agent.status === "tool_calling") && (
        <g opacity={0.5}>
          <line x1={x + 29} y1={y + 12} x2={x + 44} y2={y + 12} stroke="hsl(140, 60%, 60%)" strokeWidth="0.5" />
          <line x1={x + 29} y1={y + 15} x2={x + 40} y2={y + 15} stroke="hsl(140, 50%, 50%)" strokeWidth="0.5" />
          <line x1={x + 29} y1={y + 18} x2={x + 48} y2={y + 18} stroke="hsl(140, 40%, 45%)" strokeWidth="0.5" />
          <line x1={x + 29} y1={y + 21} x2={x + 42} y2={y + 21} stroke="hsl(140, 60%, 55%)" strokeWidth="0.5" />
        </g>
      )}

      {/* Desk clutter */}
      <DeskClutterSvg x={x} y={y} agent={agent} />

      {/* Status ring with stress escalation */}
      {agent && (
        <circle
          cx={x + 40}
          cy={y + 42}
          r={8}
          fill="none"
          stroke={stressTier !== "normal" ? stressColors.primary : statusColor}
          strokeWidth={selected ? 2.5 : stressTier === "overloaded" ? 2 : 1.5}
          opacity={agent.status === "offline" ? 0.3 : 0.8}
        >
          {(agent.status === "active" || agent.status === "thinking") && (
            <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
          )}
          {agent.status === "error" && (
            <animate attributeName="r" values="8;10;8" dur="1s" repeatCount="indefinite" />
          )}
          {stressTier === "overloaded" && (
            <animate attributeName="stroke-width" values="1.5;3;1.5" dur="0.8s" repeatCount="indefinite" />
          )}
        </circle>
      )}

      {/* Agent avatar indicator */}
      {agent && agent.status !== "offline" && (
        agent.spriteSheetUrl ? (
          <AnimatedSpriteSvg
            spriteSheetUrl={agent.spriteSheetUrl}
            x={x + 16}
            y={y + 20}
            status={agent.status}
          />
        ) : agent.spriteUrl ? (
          <image
            href={agent.spriteUrl}
            x={x + 24}
            y={y + 26}
            width={32}
            height={32}
            style={{ imageRendering: "pixelated" }}
          />
        ) : (
          <text x={x + 40} y={y + 46} textAnchor="middle" fontSize="10">
            {icon}
          </text>
        )
      )}

      {/* Stress tier indicator */}
      {agent && stressIcon && !dimmed && (
        <text x={x + 72} y={y + 12} fontSize="8" textAnchor="end">
          {stressIcon}
        </text>
      )}

      {/* Utilization bar */}
      {agent && agent.utilization > 0 && !dimmed && (
        <g>
          <rect x={x + 4} y={y + 52} width={72} height={2} rx="1" fill="hsl(215, 15%, 15%)" />
          <rect
            x={x + 4}
            y={y + 52}
            width={72 * agent.utilization}
            height={2}
            rx="1"
            fill={stressColors.primary}
            opacity={0.7}
          />
        </g>
      )}

      {/* Name label */}
      <text
        x={x + 40}
        y={y + 56 + 12}
        textAnchor="middle"
        fill={agent ? (deptId !== "unassigned" ? deptColors.label : "hsl(210, 40%, 85%)") : "hsl(215, 20%, 35%)"}
        fontSize="8"
        fontWeight={agent ? "500" : "400"}
      >
        {agent ? truncate(agent.name, 12) : strings.empty}
      </text>

      {/* Department label */}
      {agent && deptId !== "unassigned" && !dimmed && (
        <text
          x={x + 40}
          y={y + 56 + 21}
          textAnchor="middle"
          fill={deptColors.label}
          fontSize="6"
          opacity={0.6}
        >
          {deptId.toUpperCase()}
        </text>
      )}

      {/* Speech bubble */}
      {agent?.speechBubble && !dimmed && (
        <SpeechBubbleSvg x={x + 40} y={y - 8} text={agent.speechBubble} />
      )}
    </g>
  );
}

function DeskClutterSvg({ x, y, agent }: { x: number; y: number; agent: VisualAgent | null }) {
  if (!agent || agent.status === "offline") return null;

  return (
    <g opacity={0.5}>
      {/* Coffee cup */}
      <circle cx={x + 12} cy={y + 14} r="3" fill="hsl(30, 20%, 15%)" stroke="hsl(30, 15%, 25%)" strokeWidth="0.3" />
      {agent.status === "active" && (
        <g opacity={0.4}>
          <line x1={x + 11} y1={y + 10} x2={x + 10} y2={y + 7} stroke="hsl(0, 0%, 50%)" strokeWidth="0.3" />
          <line x1={x + 13} y1={y + 10} x2={x + 14} y2={y + 7} stroke="hsl(0, 0%, 50%)" strokeWidth="0.3" />
        </g>
      )}
      {/* Papers/notes */}
      <rect x={x + 60} y={y + 10} width="10" height="8" rx="0.5" fill="hsl(48, 50%, 25%)" opacity={0.4} transform={`rotate(5, ${x + 65}, ${y + 14})`} />
      {/* Keyboard */}
      <rect x={x + 28} y={y + 30} width={24} height={8} rx="1" fill="hsl(215, 15%, 14%)" stroke="hsl(215, 10%, 20%)" strokeWidth="0.3" />
    </g>
  );
}

function SpeechBubbleSvg({ x, y, text }: { x: number; y: number; text: string }) {
  const maxW = 120;
  const truncated = text.length > 30 ? text.slice(0, 27) + "..." : text;
  const w = Math.min(maxW, truncated.length * 5.5 + 16);
  const h = 22;
  const bx = x - w / 2;
  const by = y - h;

  return (
    <g filter="url(#bubble-shadow)">
      <rect
        x={bx}
        y={by}
        width={w}
        height={h}
        rx="4"
        fill="hsl(222, 50%, 12%)"
        stroke="hsl(48, 100%, 50%)"
        strokeWidth="0.5"
        opacity="0.95"
      >
        <animate attributeName="opacity" values="0;0.95" dur="0.3s" fill="freeze" />
      </rect>
      <polygon
        points={`${x - 4},${y - 1} ${x},${y + 5} ${x + 4},${y - 1}`}
        fill="hsl(222, 50%, 12%)"
        stroke="hsl(48, 100%, 50%)"
        strokeWidth="0.5"
      />
      <line x1={x - 5} y1={y - 1} x2={x + 5} y2={y - 1} stroke="hsl(222, 50%, 12%)" strokeWidth="1.5" />
      <text
        x={x}
        y={by + h / 2 + 3.5}
        textAnchor="middle"
        fill="hsl(48, 100%, 85%)"
        fontSize="7"
        fontWeight="500"
      >
        {truncated}
      </text>
    </g>
  );
}

interface TooltipStrings {
  ready: string;
  working: string;
  thinking: string;
  offline: string;
  blocked: string;
  spawning: string;
}

function AgentTooltip({ agent, strings }: { agent: VisualAgent; strings: TooltipStrings }) {
  const color = STATUS_COLORS[agent.status];
  const stressTier = agent.stressTier;
  const stressColors = STRESS_COLORS[stressTier];

  return (
    <div className="absolute top-2 left-2 bg-popover/95 backdrop-blur border border-border rounded-md p-3 shadow-lg z-20 max-w-[260px] pointer-events-none">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-sm font-medium">{agent.name}</span>
        {agent.department && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full border" style={{ borderColor: stressColors.primary + "40", color: stressColors.text }}>
            {agent.department}
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>Status: <span className="capitalize" style={{ color }}>{agent.status}</span></p>
        {agent.currentTask && <p>Task: {truncate(agent.currentTask, 40)}</p>}
        {agent.speechBubble && <p>Says: &quot;{truncate(agent.speechBubble, 40)}&quot;</p>}
        {agent.model && <p>Model: {agent.model}</p>}
        {agent.agentType && <p>Type: {agent.agentType}</p>}
        <p>Zone: {agent.zone.replace("_", " ")}</p>
        {/* Utilization & stress */}
        <p>
          Load: {Math.round(agent.utilization * 100)}%
          {stressTier !== "normal" && (
            <span style={{ color: stressColors.primary, marginLeft: 4 }}>
              ({stressTier} {STRESS_ICONS[stressTier]})
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

/** Art slot SVG — renders a clickable art frame in the 2D view */
function ArtSlotSvg({ slot, artData, canvasW, theme, onClick }: {
  slot: ArtSlot;
  artData?: OfficeArtPieceData;
  canvasW: number;
  theme: OfficeTheme;
  onClick: () => void;
}) {
  // Handle negative x (offset from right edge)
  const x = slot.svg.x < 0 ? canvasW + slot.svg.x : slot.svg.x;
  const { y, width, height } = slot.svg;
  const pipeline = ART_PIPELINE[slot.category];
  const is3D = pipeline === "meshy";

  if (artData?.imageUrl) {
    // Filled 2D art: show the generated image
    return (
      <g className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onClick(); }}>
        {/* Frame border */}
        <rect
          x={x - 2} y={y - 2} width={width + 4} height={height + 4}
          rx="2" fill="none" stroke={theme.accentColor} strokeWidth="1" opacity={0.5}
        />
        <image
          href={artData.imageUrl}
          x={x} y={y} width={width} height={height}
          preserveAspectRatio="xMidYMid slice"
          style={{ imageRendering: "auto" }}
        />
        {/* Hover overlay */}
        <rect
          x={x} y={y} width={width} height={height}
          fill="transparent" className="hover:fill-white/10"
        />
      </g>
    );
  }

  if (artData?.modelUrl && is3D) {
    // Filled 3D art: show a badge placeholder in 2D view
    return (
      <g className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <rect
          x={x} y={y} width={width} height={height}
          rx="3" fill={theme.accentColor + "15"} stroke={theme.accentColor} strokeWidth="0.5"
        />
        <text
          x={x + width / 2} y={y + height / 2 - 3}
          textAnchor="middle" fontSize="8" fill={theme.accentColor} opacity={0.8}
        >
          3D
        </text>
        <text
          x={x + width / 2} y={y + height / 2 + 6}
          textAnchor="middle" fontSize="5" fill="hsl(215, 20%, 50%)"
        >
          {ART_LABELS[slot.category]}
        </text>
      </g>
    );
  }

  // Empty slot: dashed border + "+" icon
  return (
    <g className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <rect
        x={x} y={y} width={width} height={height}
        rx="3" fill="transparent"
        stroke="hsl(215, 20%, 25%)" strokeWidth="0.5" strokeDasharray="3 2"
      />
      {/* Plus icon */}
      <line
        x1={x + width / 2 - 4} y1={y + height / 2}
        x2={x + width / 2 + 4} y2={y + height / 2}
        stroke="hsl(215, 20%, 35%)" strokeWidth="0.8"
      />
      <line
        x1={x + width / 2} y1={y + height / 2 - 4}
        x2={x + width / 2} y2={y + height / 2 + 4}
        stroke="hsl(215, 20%, 35%)" strokeWidth="0.8"
      />
      {/* Label */}
      <text
        x={x + width / 2} y={y + height + 8}
        textAnchor="middle" fontSize="5" fill="hsl(215, 20%, 35%)"
      >
        {slot.label}
      </text>
      {/* Pulse animation on hover */}
      <rect
        x={x} y={y} width={width} height={height}
        rx="3" fill="transparent" className="hover:fill-white/5"
      >
        <animate attributeName="stroke-opacity" values="0.3;0.6;0.3" dur="2s" repeatCount="indefinite" />
      </rect>
    </g>
  );
}

/**
 * AnimatedSpriteSvg — Renders an animated sprite sheet inside SVG using foreignObject.
 *
 * Supports the expanded 10-row sprite sheet format:
 *   Rows 0-3: Walk (down/left/right/up)
 *   Row 4: Idle    Row 5: Working    Row 6: Thinking
 *   Row 7: Talking Row 8: Error      Row 9: Spawning
 *
 * Uses CSS background-position to display the correct frame, animated via setInterval.
 */
function AnimatedSpriteSvg({
  spriteSheetUrl,
  x,
  y,
  status,
}: {
  spriteSheetUrl: string;
  x: number;
  y: number;
  status: AgentVisualStatus;
}) {
  const frameRef = useRef(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const animType = getAnimationType(status);

  const { frameWidth, frameHeight, framesPerRow, totalRows } = EXPANDED_SPRITE_CONFIG;
  const row = ANIM_ROWS[animType];
  const speed = ANIM_SPEEDS[animType];

  // Animate frame cycling — all animation types animate (idle has slow breathing)
  useEffect(() => {
    frameRef.current = 0;
    setFrameIndex(0);
    const tick = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % framesPerRow;
      setFrameIndex(frameRef.current);
    }, speed);
    return () => clearInterval(tick);
  }, [animType, speed, framesPerRow]);

  // Display size in the SVG (1:1 with sprite frame)
  const displayW = frameWidth;  // 48
  const displayH = frameHeight; // 64

  // Total sprite sheet pixel dimensions
  const sheetW = frameWidth * framesPerRow;   // 288
  const sheetH = frameHeight * totalRows;     // 640

  const bgX = -(frameIndex * frameWidth);
  const bgY = -(row * frameHeight);

  return (
    <foreignObject x={x} y={y} width={displayW} height={displayH}>
      <div
        style={{
          width: displayW,
          height: displayH,
          backgroundImage: `url(${spriteSheetUrl})`,
          backgroundPosition: `${bgX}px ${bgY}px`,
          backgroundSize: `${sheetW}px ${sheetH}px`,
          backgroundRepeat: "no-repeat",
          imageRendering: "pixelated",
        }}
      />
    </foreignObject>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "..." : s;
}
