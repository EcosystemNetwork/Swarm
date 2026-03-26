/** Office Sim — Theme definitions with department-specific colors and derive-from-accent */

import type { DepartmentId } from "./types";

/* ═══════════════════════════════════════
   Color Utilities
   ═══════════════════════════════════════ */

/** Parse hex string to [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** RGB to hex string */
function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

/** Linearly blend two hex colors. t=0 → a, t=1 → b */
export function blendColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(
    ar + (br - ar) * t,
    ag + (bg - ag) * t,
    ab + (bb - ab) * t,
  );
}

/** Check if a color is light (YIQ brightness formula) */
export function isLightColor(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

/** Auto-pick black or white text for contrast */
export function contrastTextColor(bgHex: string): string {
  return isLightColor(bgHex) ? "#1a1a2e" : "#e8e8f0";
}

/**
 * Derive a full 4-color palette from a single accent color + brightness tone.
 * tone: 0 = very dark, 100 = very bright
 */
export function deriveFromAccent(
  accent: string,
  tone: number,
): { floor1: string; floor2: string; wall: string; accent: string } {
  const t = Math.max(0, Math.min(100, tone)) / 100;
  const darkBase = "#0a0a14";
  return {
    floor1: blendColor(darkBase, accent, t * 0.25),
    floor2: blendColor(darkBase, accent, t * 0.18),
    wall: blendColor(darkBase, accent, t * 0.35),
    accent,
  };
}

/* ═══════════════════════════════════════
   Department Color Schemes
   ═══════════════════════════════════════ */

export interface DepartmentColors {
  floor: string;
  wall: string;
  accent: string;
  label: string;
}

export const DEFAULT_DEPARTMENT_COLORS: Record<DepartmentId, DepartmentColors> = {
  engineering: { floor: "#1a1d2e", wall: "#242840", accent: "#3b82f6", label: "#93c5fd" },
  design: { floor: "#2a1a2e", wall: "#3d2440", accent: "#e040fb", label: "#f0abfc" },
  operations: { floor: "#1a2a1e", wall: "#243d28", accent: "#22c55e", label: "#86efac" },
  qa: { floor: "#2a2a1a", wall: "#3d3d24", accent: "#eab308", label: "#fde047" },
  research: { floor: "#1a2a2e", wall: "#243d40", accent: "#06b6d4", label: "#67e8f9" },
  security: { floor: "#2a1a1a", wall: "#3d2424", accent: "#ef4444", label: "#fca5a5" },
  unassigned: { floor: "#1a1a1e", wall: "#2a2a30", accent: "#6b7280", label: "#9ca3af" },
};

/* ═══════════════════════════════════════
   Theme Interface
   ═══════════════════════════════════════ */

export interface OfficeTheme {
  id: string;
  name: string;
  description: string;

  // 3D Colors
  floorColor: string;
  wallColor: string;
  deskColor: string;
  monitorColor: string;
  accentColor: string;

  // 3D Lighting
  ambientIntensity: number;
  ambientColor: string;
  directionalIntensity: number;
  directionalColor: string;
  fillLightColor: string;
  pointLightColor: string;
  pointLightIntensity: number;
  fogColor: string;
  fogNear: number;
  fogFar: number;

  // 3D Materials
  floorMetalness: number;
  floorRoughness: number;
  deskMetalness: number;
  deskRoughness: number;

  // 2D SVG
  svgBackground: string;
  svgGridColor: string;
  svgDeskFill: string;
  svgDeskStroke: string;
  svgMonitorFill: string;
  svgMonitorStroke: string;
  svgRoomMeeting: { bg: string; border: string };
  svgRoomBreak: { bg: string; border: string };
  svgRoomServer: { bg: string; border: string };
  svgRoomErrorBay: { bg: string; border: string };

  // Shadow & highlight
  svgAmbientShadowColor: string;
  svgDeskShadowOffset: number;
  svgHighlightColor: string;

  // Department color overrides (optional per-department customization)
  departmentColors?: Partial<Record<DepartmentId, DepartmentColors>>;

  // AI generation prompt hints (used by Meshy/ComfyUI)
  furnitureStylePrompt: string;
  textureStylePrompt: string;
  artStylePrompt: string;
}

/** Get colors for a department, falling back to defaults */
export function getDepartmentColors(
  theme: OfficeTheme,
  department: DepartmentId,
): DepartmentColors {
  return theme.departmentColors?.[department] ?? DEFAULT_DEPARTMENT_COLORS[department];
}

/* ═══════════════════════════════════════
   Theme Presets
   ═══════════════════════════════════════ */

export const THEME_PRESETS: OfficeTheme[] = [
  {
    id: "startup-loft",
    name: "Startup Loft",
    description: "Modern open-plan with warm wood tones and natural light",

    floorColor: "#2a1f14",
    wallColor: "#3d3428",
    deskColor: "#5c4a35",
    monitorColor: "#1a1a1a",
    accentColor: "#f59e0b",

    ambientIntensity: 0.4,
    ambientColor: "#fff5e6",
    directionalIntensity: 0.8,
    directionalColor: "#ffe8c4",
    fillLightColor: "#87ceeb",
    pointLightColor: "#fbbf24",
    pointLightIntensity: 0.4,
    fogColor: "#1a150f",
    fogNear: 14,
    fogFar: 30,

    floorMetalness: 0.1,
    floorRoughness: 0.9,
    deskMetalness: 0.2,
    deskRoughness: 0.7,

    svgBackground: "hsl(30, 30%, 8%)",
    svgGridColor: "hsl(30, 20%, 14%)",
    svgDeskFill: "hsl(30, 25%, 18%)",
    svgDeskStroke: "hsl(30, 20%, 28%)",
    svgMonitorFill: "hsl(0, 0%, 8%)",
    svgMonitorStroke: "hsl(30, 15%, 22%)",
    svgRoomMeeting: { bg: "rgba(245, 158, 11, 0.06)", border: "rgba(245, 158, 11, 0.2)" },
    svgRoomBreak: { bg: "rgba(34, 197, 94, 0.04)", border: "rgba(34, 197, 94, 0.15)" },
    svgRoomServer: { bg: "rgba(6, 182, 212, 0.04)", border: "rgba(6, 182, 212, 0.15)" },
    svgRoomErrorBay: { bg: "rgba(239, 68, 68, 0.06)", border: "rgba(239, 68, 68, 0.2)" },

    svgAmbientShadowColor: "rgba(0, 0, 0, 0.35)",
    svgDeskShadowOffset: 3,
    svgHighlightColor: "rgba(255, 240, 220, 0.08)",

    furnitureStylePrompt: "modern minimalist startup office, light wood and steel, Scandinavian design",
    textureStylePrompt: "warm oak wood grain, natural matte finish, Scandinavian",
    artStylePrompt: "warm modern art, earth tones, Scandinavian gallery aesthetic",
  },
  {
    id: "corporate-tower",
    name: "Corporate Tower",
    description: "Sleek glass and steel high-rise with cool blue accents",

    floorColor: "#1a1d24",
    wallColor: "#2a2d34",
    deskColor: "#3a3d44",
    monitorColor: "#0a0a0a",
    accentColor: "#3b82f6",

    ambientIntensity: 0.35,
    ambientColor: "#d4e4ff",
    directionalIntensity: 0.9,
    directionalColor: "#ffffff",
    fillLightColor: "#3b82f6",
    pointLightColor: "#60a5fa",
    pointLightIntensity: 0.3,
    fogColor: "#0d1117",
    fogNear: 15,
    fogFar: 32,

    floorMetalness: 0.6,
    floorRoughness: 0.3,
    deskMetalness: 0.7,
    deskRoughness: 0.3,

    svgBackground: "hsl(220, 25%, 6%)",
    svgGridColor: "hsl(220, 20%, 12%)",
    svgDeskFill: "hsl(220, 15%, 14%)",
    svgDeskStroke: "hsl(220, 15%, 22%)",
    svgMonitorFill: "hsl(220, 20%, 6%)",
    svgMonitorStroke: "hsl(220, 15%, 18%)",
    svgRoomMeeting: { bg: "rgba(59, 130, 246, 0.06)", border: "rgba(59, 130, 246, 0.2)" },
    svgRoomBreak: { bg: "rgba(96, 165, 250, 0.04)", border: "rgba(96, 165, 250, 0.15)" },
    svgRoomServer: { bg: "rgba(147, 197, 253, 0.04)", border: "rgba(147, 197, 253, 0.12)" },
    svgRoomErrorBay: { bg: "rgba(239, 68, 68, 0.06)", border: "rgba(239, 68, 68, 0.2)" },

    svgAmbientShadowColor: "rgba(0, 0, 0, 0.4)",
    svgDeskShadowOffset: 3,
    svgHighlightColor: "rgba(180, 210, 255, 0.06)",

    furnitureStylePrompt: "corporate executive office, glass and brushed steel, premium modern",
    textureStylePrompt: "polished concrete, cool grey, professional corporate",
    artStylePrompt: "corporate fine art, sleek contemporary, gallery exhibition quality",
  },
  {
    id: "cyberpunk-den",
    name: "Cyberpunk Den",
    description: "Neon-lit underground workspace with glitch aesthetics",

    floorColor: "#0a0014",
    wallColor: "#14002a",
    deskColor: "#1a0a2e",
    monitorColor: "#050008",
    accentColor: "#e040fb",

    ambientIntensity: 0.15,
    ambientColor: "#4a0080",
    directionalIntensity: 0.3,
    directionalColor: "#e040fb",
    fillLightColor: "#00e5ff",
    pointLightColor: "#e040fb",
    pointLightIntensity: 0.6,
    fogColor: "#050010",
    fogNear: 10,
    fogFar: 24,

    floorMetalness: 0.8,
    floorRoughness: 0.2,
    deskMetalness: 0.9,
    deskRoughness: 0.1,

    svgBackground: "hsl(270, 100%, 3%)",
    svgGridColor: "hsl(280, 80%, 10%)",
    svgDeskFill: "hsl(270, 60%, 10%)",
    svgDeskStroke: "hsl(290, 80%, 25%)",
    svgMonitorFill: "hsl(270, 80%, 3%)",
    svgMonitorStroke: "hsl(290, 100%, 40%)",
    svgRoomMeeting: { bg: "rgba(224, 64, 251, 0.08)", border: "rgba(224, 64, 251, 0.3)" },
    svgRoomBreak: { bg: "rgba(0, 229, 255, 0.06)", border: "rgba(0, 229, 255, 0.25)" },
    svgRoomServer: { bg: "rgba(0, 229, 255, 0.04)", border: "rgba(0, 229, 255, 0.2)" },
    svgRoomErrorBay: { bg: "rgba(255, 0, 60, 0.08)", border: "rgba(255, 0, 60, 0.3)" },

    svgAmbientShadowColor: "rgba(80, 0, 120, 0.5)",
    svgDeskShadowOffset: 4,
    svgHighlightColor: "rgba(224, 64, 251, 0.1)",

    furnitureStylePrompt: "cyberpunk futuristic, neon purple and cyan LED accents, dark metal, sci-fi",
    textureStylePrompt: "dark metal grating with neon light bleed, cyberpunk, industrial",
    artStylePrompt: "cyberpunk digital art, neon glow, glitch aesthetic, vaporwave",
  },
  {
    id: "cozy-studio",
    name: "Cozy Studio",
    description: "Warm indie workspace with plants, rugs, and soft lighting",

    floorColor: "#2a2018",
    wallColor: "#3d3020",
    deskColor: "#6b5440",
    monitorColor: "#1a1510",
    accentColor: "#22c55e",

    ambientIntensity: 0.5,
    ambientColor: "#ffe4c4",
    directionalIntensity: 0.6,
    directionalColor: "#ffd4a0",
    fillLightColor: "#22c55e",
    pointLightColor: "#fde68a",
    pointLightIntensity: 0.5,
    fogColor: "#1a150e",
    fogNear: 12,
    fogFar: 26,

    floorMetalness: 0.05,
    floorRoughness: 0.95,
    deskMetalness: 0.1,
    deskRoughness: 0.85,

    svgBackground: "hsl(30, 35%, 7%)",
    svgGridColor: "hsl(30, 25%, 13%)",
    svgDeskFill: "hsl(25, 30%, 20%)",
    svgDeskStroke: "hsl(25, 25%, 30%)",
    svgMonitorFill: "hsl(25, 20%, 8%)",
    svgMonitorStroke: "hsl(25, 20%, 20%)",
    svgRoomMeeting: { bg: "rgba(34, 197, 94, 0.06)", border: "rgba(34, 197, 94, 0.2)" },
    svgRoomBreak: { bg: "rgba(253, 230, 138, 0.05)", border: "rgba(253, 230, 138, 0.18)" },
    svgRoomServer: { bg: "rgba(6, 182, 212, 0.04)", border: "rgba(6, 182, 212, 0.15)" },
    svgRoomErrorBay: { bg: "rgba(239, 68, 68, 0.06)", border: "rgba(239, 68, 68, 0.2)" },

    svgAmbientShadowColor: "rgba(0, 0, 0, 0.3)",
    svgDeskShadowOffset: 2,
    svgHighlightColor: "rgba(255, 228, 196, 0.1)",

    furnitureStylePrompt: "cozy indie studio, reclaimed wood, plants, vintage brass accents, warm",
    textureStylePrompt: "worn reclaimed wood, warm tones, rustic cottage",
    artStylePrompt: "cozy handmade art, watercolor, botanical illustration, warm tones",
  },
];
