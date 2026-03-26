/** Procedural SVG Avatar Generator — Deterministic avatar from agent ID
 *
 * Adapted from WW-AI-Lab/openclaw-office avatar-generator module.
 * Generates a unique procedural face/hair/clothes SVG from a stable hash
 * of the agent's ID string. Serves as a **fallback** when no Meshy 3D model
 * or ComfyUI 2D sprite is available for an agent.
 *
 * Usage:
 *   const svg = generateAvatarSvg(agent.id, { size: 64 });
 *   // returns a self-contained SVG string
 *
 * Priority chain (checked by the renderer):
 *   1. agent.modelUrl   → Meshy 3D GLB
 *   2. agent.spriteUrl  → ComfyUI 2D sprite sheet
 *   3. generateAvatarSvg() → this procedural fallback
 */

/* ═══════════════════════════════════════
   Hash Utilities
   ═══════════════════════════════════════ */

/** Deterministic 32-bit hash from string (djb2a variant) */
export function hashString(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

/** Pull a float 0..1 from the hash at a given salt offset */
export function hashFloat(id: string, salt: number): number {
  return (hashString(`${id}:${salt}`) % 10000) / 10000;
}

/** Pull an integer 0..max from the hash */
export function hashInt(id: string, salt: number, max: number): number {
  return hashString(`${id}:${salt}`) % max;
}

/** Pick an item from an array deterministically */
export function hashPick<T>(id: string, salt: number, arr: readonly T[]): T {
  return arr[hashInt(id, salt, arr.length)];
}

/* ═══════════════════════════════════════
   Palettes
   ═══════════════════════════════════════ */

export const SKIN_TONES = [
  "#f9d5a7", "#f5c18c", "#d8a06e", "#c68642", "#a0674b",
  "#7a4a3a", "#5c3928", "#f0d0b0", "#e8b88a", "#c99b6d",
] as const;

export const HAIR_COLORS = [
  "#342016", "#5a3214", "#1a1a1a", "#8c5e3c", "#b78847",
  "#cc3333", "#553399", "#2288aa", "#ddaa33", "#777777",
] as const;

export const TOP_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#eab308", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#6366f1", "#14b8a6",
  "#64748b", "#dc2626", "#16a34a", "#d97706", "#7c3aed",
] as const;

export const BOTTOM_COLORS = [
  "#1f2937", "#374151", "#1e3a5f", "#4b2d1a", "#1a1a2e",
  "#2d3748", "#4a5568", "#1e293b",
] as const;

export const SHOE_COLORS = [
  "#374151", "#1f2937", "#92400e", "#f5f5f4", "#ef4444",
  "#3b82f6", "#000000",
] as const;

/* ═══════════════════════════════════════
   Feature Definitions
   ═══════════════════════════════════════ */

type HairStyle = "short" | "parted" | "spiky" | "bun" | "none" | "mohawk" | "long";
type TopStyle = "tshirt" | "hoodie" | "jacket" | "tanktop";
type FaceShape = "round" | "oval" | "square";
type EyeStyle = "normal" | "wide" | "sleepy" | "glasses";

const HAIR_STYLES: readonly HairStyle[] = ["short", "parted", "spiky", "bun", "none", "mohawk", "long"];
const TOP_STYLES: readonly TopStyle[] = ["tshirt", "hoodie", "jacket", "tanktop"];
const FACE_SHAPES: readonly FaceShape[] = ["round", "oval", "square"];
const EYE_STYLES: readonly EyeStyle[] = ["normal", "wide", "sleepy", "glasses"];

/* ═══════════════════════════════════════
   SVG Body Part Builders
   ═══════════════════════════════════════ */

function buildHead(faceShape: FaceShape, skinTone: string, cx: number, cy: number, size: number): string {
  const r = size * 0.3;
  switch (faceShape) {
    case "round":
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${skinTone}" />`;
    case "oval":
      return `<ellipse cx="${cx}" cy="${cy}" rx="${r * 0.88}" ry="${r}" fill="${skinTone}" />`;
    case "square":
      return `<rect x="${cx - r * 0.85}" y="${cy - r * 0.9}" width="${r * 1.7}" height="${r * 1.8}" rx="${r * 0.2}" fill="${skinTone}" />`;
  }
}

function buildEyes(eyeStyle: EyeStyle, cx: number, cy: number, size: number): string {
  const eyeSpacing = size * 0.1;
  const eyeY = cy - size * 0.02;
  const eyeR = size * 0.03;

  let left = "";
  let right = "";

  switch (eyeStyle) {
    case "normal":
      left = `<circle cx="${cx - eyeSpacing}" cy="${eyeY}" r="${eyeR}" fill="#1a1a1a" />`;
      right = `<circle cx="${cx + eyeSpacing}" cy="${eyeY}" r="${eyeR}" fill="#1a1a1a" />`;
      break;
    case "wide":
      left = `<circle cx="${cx - eyeSpacing}" cy="${eyeY}" r="${eyeR * 1.4}" fill="#1a1a1a" />`;
      right = `<circle cx="${cx + eyeSpacing}" cy="${eyeY}" r="${eyeR * 1.4}" fill="#1a1a1a" />`;
      break;
    case "sleepy":
      left = `<line x1="${cx - eyeSpacing - eyeR}" y1="${eyeY}" x2="${cx - eyeSpacing + eyeR}" y2="${eyeY}" stroke="#1a1a1a" stroke-width="${eyeR * 0.8}" stroke-linecap="round" />`;
      right = `<line x1="${cx + eyeSpacing - eyeR}" y1="${eyeY}" x2="${cx + eyeSpacing + eyeR}" y2="${eyeY}" stroke="#1a1a1a" stroke-width="${eyeR * 0.8}" stroke-linecap="round" />`;
      break;
    case "glasses": {
      const gr = eyeR * 2;
      left = `<circle cx="${cx - eyeSpacing}" cy="${eyeY}" r="${gr}" fill="none" stroke="#555" stroke-width="1" />
        <circle cx="${cx - eyeSpacing}" cy="${eyeY}" r="${eyeR}" fill="#1a1a1a" />`;
      right = `<circle cx="${cx + eyeSpacing}" cy="${eyeY}" r="${gr}" fill="none" stroke="#555" stroke-width="1" />
        <circle cx="${cx + eyeSpacing}" cy="${eyeY}" r="${eyeR}" fill="#1a1a1a" />`;
      break;
    }
  }

  return left + right;
}

function buildMouth(cx: number, cy: number, size: number, mouthSeed: number): string {
  const my = cy + size * 0.1;
  const mw = size * 0.08;
  if (mouthSeed < 0.33) {
    // Smile
    return `<path d="M ${cx - mw} ${my} Q ${cx} ${my + mw * 0.8} ${cx + mw} ${my}" fill="none" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round" />`;
  }
  if (mouthSeed < 0.66) {
    // Neutral line
    return `<line x1="${cx - mw * 0.6}" y1="${my}" x2="${cx + mw * 0.6}" y2="${my}" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round" />`;
  }
  // Open
  return `<ellipse cx="${cx}" cy="${my}" rx="${mw * 0.5}" ry="${mw * 0.35}" fill="#1a1a1a" />`;
}

function buildHair(hairStyle: HairStyle, hairColor: string, cx: number, cy: number, size: number): string {
  const r = size * 0.3;
  const top = cy - r;

  switch (hairStyle) {
    case "short":
      return `<path d="M ${cx - r * 0.9} ${cy - r * 0.4} Q ${cx - r * 0.9} ${top - r * 0.1} ${cx} ${top - r * 0.15} Q ${cx + r * 0.9} ${top - r * 0.1} ${cx + r * 0.9} ${cy - r * 0.4}" fill="${hairColor}" />`;
    case "parted":
      return `<path d="M ${cx - r * 0.95} ${cy - r * 0.3} Q ${cx - r * 0.9} ${top - r * 0.2} ${cx - r * 0.1} ${top - r * 0.18} L ${cx + r * 0.1} ${top - r * 0.12} Q ${cx + r * 0.9} ${top - r * 0.1} ${cx + r * 0.95} ${cy - r * 0.3}" fill="${hairColor}" />`;
    case "spiky": {
      const spikes: string[] = [];
      for (let i = -3; i <= 3; i++) {
        const sx = cx + i * r * 0.25;
        const sy = top - r * (0.2 + Math.abs(i) * 0.08);
        spikes.push(`L ${sx} ${sy}`);
      }
      return `<path d="M ${cx - r * 0.9} ${cy - r * 0.3} ${spikes.join(" ")} L ${cx + r * 0.9} ${cy - r * 0.3}" fill="${hairColor}" />`;
    }
    case "bun":
      return `<path d="M ${cx - r * 0.85} ${cy - r * 0.3} Q ${cx - r * 0.85} ${top - r * 0.1} ${cx} ${top - r * 0.1} Q ${cx + r * 0.85} ${top - r * 0.1} ${cx + r * 0.85} ${cy - r * 0.3}" fill="${hairColor}" />
        <circle cx="${cx}" cy="${top - r * 0.3}" r="${r * 0.25}" fill="${hairColor}" />`;
    case "mohawk":
      return `<path d="M ${cx - r * 0.15} ${cy - r * 0.3} L ${cx - r * 0.2} ${top - r * 0.5} Q ${cx} ${top - r * 0.6} ${cx + r * 0.2} ${top - r * 0.5} L ${cx + r * 0.15} ${cy - r * 0.3}" fill="${hairColor}" />`;
    case "long":
      return `<path d="M ${cx - r * 1.0} ${cy + r * 0.5} Q ${cx - r * 1.05} ${top - r * 0.1} ${cx} ${top - r * 0.15} Q ${cx + r * 1.05} ${top - r * 0.1} ${cx + r * 1.0} ${cy + r * 0.5}" fill="${hairColor}" />`;
    case "none":
    default:
      return "";
  }
}

function buildBody(topStyle: TopStyle, topColor: string, bottomColor: string, shoeColor: string, cx: number, cy: number, size: number): string {
  const bodyTop = cy + size * 0.28;
  const bodyW = size * 0.3;
  const bodyH = size * 0.25;
  const legH = size * 0.18;

  let torso = "";
  switch (topStyle) {
    case "tshirt":
      torso = `<rect x="${cx - bodyW}" y="${bodyTop}" width="${bodyW * 2}" height="${bodyH}" rx="3" fill="${topColor}" />`;
      break;
    case "hoodie":
      torso = `<rect x="${cx - bodyW * 1.05}" y="${bodyTop}" width="${bodyW * 2.1}" height="${bodyH * 1.05}" rx="5" fill="${topColor}" />
        <rect x="${cx - bodyW * 0.25}" y="${bodyTop}" width="${bodyW * 0.5}" height="${bodyH * 0.5}" rx="2" fill="${topColor}" opacity="0.7" />`;
      break;
    case "jacket":
      torso = `<rect x="${cx - bodyW}" y="${bodyTop}" width="${bodyW * 2}" height="${bodyH}" rx="3" fill="${topColor}" />
        <line x1="${cx}" y1="${bodyTop}" x2="${cx}" y2="${bodyTop + bodyH}" stroke="rgba(0,0,0,0.2)" stroke-width="1.5" />`;
      break;
    case "tanktop":
      torso = `<rect x="${cx - bodyW * 0.7}" y="${bodyTop}" width="${bodyW * 1.4}" height="${bodyH}" rx="3" fill="${topColor}" />`;
      break;
  }

  const legs = `<rect x="${cx - bodyW * 0.5}" y="${bodyTop + bodyH}" width="${bodyW * 0.4}" height="${legH}" rx="2" fill="${bottomColor}" />
    <rect x="${cx + bodyW * 0.1}" y="${bodyTop + bodyH}" width="${bodyW * 0.4}" height="${legH}" rx="2" fill="${bottomColor}" />`;

  const shoes = `<rect x="${cx - bodyW * 0.55}" y="${bodyTop + bodyH + legH}" width="${bodyW * 0.45}" height="${size * 0.04}" rx="2" fill="${shoeColor}" />
    <rect x="${cx + bodyW * 0.1}" y="${bodyTop + bodyH + legH}" width="${bodyW * 0.45}" height="${size * 0.04}" rx="2" fill="${shoeColor}" />`;

  return torso + legs + shoes;
}

/* ═══════════════════════════════════════
   Hat / Accessory Overlays
   ═══════════════════════════════════════ */

function buildHat(id: string, cx: number, cy: number, size: number, hairColor: string): string {
  const hatSeed = hashFloat(id, 99);
  if (hatSeed > 0.3) return ""; // 70% no hat

  const r = size * 0.3;
  const top = cy - r;
  const hatColor = hashPick(id, 100, TOP_COLORS);

  if (hatSeed < 0.15) {
    // Cap
    return `<path d="M ${cx - r * 1.0} ${top + r * 0.1} Q ${cx} ${top - r * 0.35} ${cx + r * 1.0} ${top + r * 0.1}" fill="${hatColor}" />
      <rect x="${cx + r * 0.3}" y="${top + r * 0.05}" width="${r * 0.8}" height="${r * 0.1}" rx="1" fill="${hatColor}" opacity="0.8" />`;
  }
  // Beanie
  return `<path d="M ${cx - r * 0.9} ${top + r * 0.15} Q ${cx - r * 0.95} ${top - r * 0.3} ${cx} ${top - r * 0.4} Q ${cx + r * 0.95} ${top - r * 0.3} ${cx + r * 0.9} ${top + r * 0.15}" fill="${hatColor}" />
    <line x1="${cx - r * 0.85}" y1="${top + r * 0.1}" x2="${cx + r * 0.85}" y2="${top + r * 0.1}" stroke="rgba(0,0,0,0.15)" stroke-width="2" />`;
}

/* ═══════════════════════════════════════
   Public API
   ═══════════════════════════════════════ */

export interface AvatarOptions {
  /** Output size in px (square). Default 64 */
  size?: number;
  /** Background color. Default transparent */
  bg?: string;
}

/**
 * Generate a deterministic SVG avatar string for a given agent ID.
 *
 * **Fallback only** — the renderer should prefer:
 *   1. agent.modelUrl (Meshy 3D)
 *   2. agent.spriteUrl (ComfyUI 2D)
 *   3. This procedural SVG
 */
export function generateAvatarSvg(agentId: string, opts: AvatarOptions = {}): string {
  const size = opts.size ?? 64;
  const cx = size / 2;
  const cy = size * 0.4;

  // Deterministic feature selection
  const skinTone = hashPick(agentId, 0, SKIN_TONES);
  const hairColor = hashPick(agentId, 1, HAIR_COLORS);
  const hairStyle = hashPick(agentId, 2, HAIR_STYLES);
  const topStyle = hashPick(agentId, 3, TOP_STYLES);
  const topColor = hashPick(agentId, 4, TOP_COLORS);
  const bottomColor = hashPick(agentId, 5, BOTTOM_COLORS);
  const shoeColor = hashPick(agentId, 6, SHOE_COLORS);
  const faceShape = hashPick(agentId, 7, FACE_SHAPES);
  const eyeStyle = hashPick(agentId, 8, EYE_STYLES);
  const mouthSeed = hashFloat(agentId, 9);

  const bgRect = opts.bg
    ? `<rect width="${size}" height="${size}" fill="${opts.bg}" />`
    : "";

  const parts = [
    bgRect,
    buildBody(topStyle, topColor, bottomColor, shoeColor, cx, cy, size),
    buildHead(faceShape, skinTone, cx, cy, size),
    buildHair(hairStyle, hairColor, cx, cy, size),
    buildEyes(eyeStyle, cx, cy, size),
    buildMouth(cx, cy, size, mouthSeed),
    buildHat(agentId, cx, cy, size, hairColor),
  ].filter(Boolean);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${parts.join("")}</svg>`;
}

/**
 * Generate a data URI for use in <img> src attributes.
 */
export function generateAvatarDataUri(agentId: string, opts: AvatarOptions = {}): string {
  const svg = generateAvatarSvg(agentId, opts);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Check if an agent has custom assets (should skip procedural generation).
 */
export function hasCustomAvatar(agent: { modelUrl?: string; spriteUrl?: string }): boolean {
  return !!(agent.modelUrl || agent.spriteUrl);
}
